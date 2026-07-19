// Orchestration route (PRD §4, TRD §2.2): the one place that wires scrape -> parse -> agent ->
// persistence behind a single SSE stream. Streaming pattern (ReadableStream +
// text/event-stream Response) copied from the phase-5 mock this file replaces.
//
// Contract: exactly one terminal event (`report` or `error`), then the stream closes.
// Every branch in TRD §6's error matrix maps to a friendly `error` event — raw scraper/LLM
// errors and stack traces are logged server-side only, never sent to the client (TRD §8.4).

import { acquireRunSlot, rateLimitOk } from "@/lib/limits";
import { createRun, getLatestSnapshot, saveReport, saveSnapshot, updateRunStatus } from "@/lib/db";
import { parse } from "@/lib/parser";
import type { RunStatus, Snapshot } from "@/lib/types";
import { runAgent, type PipelineEvent } from "@/agent/agent";
import type {
  ErrorPayload,
  ReportPayload,
  StatusPayload,
  TrailPayload,
} from "@/components/sse-types";

const SCRAPER_URL = process.env.SCRAPER_URL || "http://127.0.0.1:7788";
const MAX_URL_LENGTH = 2048;
const WATCHDOG_MS = 120_000; // TRD §5 hard cap for the whole run

/** Human relative time ("2 hours ago") for the trail — timezone-independent, unlike a raw ISO stamp. */
function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "earlier";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  for (const [size, name] of [[86400, "day"], [3600, "hour"], [60, "minute"]] as [number, string][]) {
    if (s >= size) {
      const n = Math.round(s / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "moments ago";
}

interface ScrapeSuccess {
  ok: true;
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  fetchedAt: string;
  html: string;
  title: string;
  metaDescription: string;
  redirected: boolean;
}
interface ScrapeFailure {
  ok: false;
  error: { type: string; message: string; httpStatus?: number };
}
type ScrapeResponse = ScrapeSuccess | ScrapeFailure;

/** TRD §6 error matrix -> a friendly, non-leaking message. Raw detail is logged, not sent. */
function scrapeErrorPayload(error: ScrapeFailure["error"]): ErrorPayload {
  switch (error.type) {
    case "timeout":
      return { type: "timeout", message: "Timed out — the page took too long to load." };
    case "dns":
      return { type: "dns", message: "Could not reach that URL. Check that it's correct." };
    case "http_error":
      return {
        type: "http_error",
        message: error.httpStatus ? `Server returned ${error.httpStatus}.` : "The server returned an error.",
      };
    case "navigation":
      return { type: "navigation", message: "Could not load the page." };
    default:
      return { type: "scrape_failed", message: "Could not process this URL." };
  }
}

/** Best-effort client identity for the per-IP rate limit; falls back to a shared bucket locally. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") ?? "";
  const includeHeader = searchParams.get("includeHeader") === "true";
  const includeFooter = searchParams.get("includeFooter") === "true";

  const encoder = new TextEncoder();
  let closed = false;
  let trailStep = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          closed = true;
        }
      };
      const status = (message: string) => enqueue("status", { message } satisfies StatusPayload);
      const trail = (action: string, reasoning: string) =>
        enqueue("trail", { step: ++trailStep, action, reasoning } satisfies TrailPayload);
      const pipelineEmit = (e: PipelineEvent) =>
        e.kind === "status" ? status(e.message) : trail(e.action, e.reasoning);

      // --- Per-run cleanup, made idempotent so the abort listener, the stream's own
      // cancel(), and the normal terminal-event path can never double-release/double-log. ---
      let runId: number | null = null;
      let releaseSlot: (() => void) | null = null;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      let finished = false;

      const cleanup = (finalStatus: RunStatus) => {
        if (finished) return;
        finished = true;
        if (watchdog) clearTimeout(watchdog);
        releaseSlot?.();
        if (runId !== null) {
          try {
            updateRunStatus(runId, finalStatus);
          } catch (e) {
            console.error("[api/run] updateRunStatus failed", e);
          }
        }
      };

      const emitTerminal = (
        event: "report" | "error",
        data: ReportPayload | ErrorPayload,
        finalStatus: RunStatus,
      ) => {
        if (finished) return;
        enqueue(event, data);
        cleanup(finalStatus);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        closed = true;
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
        cleanup("error"); // client disconnected — stop billing this run, nothing left to send
      });

      // --- 1. Validate input, before it can consume a rate-limit token or a run slot. ---
      let parsedUrl: URL;
      try {
        if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) throw new Error("invalid length");
        parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("invalid scheme");
      } catch {
        emitTerminal(
          "error",
          { type: "invalid_url", message: "Please enter a valid http or https URL." },
          "error",
        );
        return;
      }
      const url = parsedUrl.toString();

      // --- Rate limit (TRD §8.3) ---
      if (!rateLimitOk(clientIp(request))) {
        emitTerminal("error", { type: "rate_limited", message: "Too many requests, slow down." }, "error");
        return;
      }

      // --- Global concurrency cap + per-URL lock (TRD §7, §8.3) ---
      const slot = acquireRunSlot(url);
      if (!slot.ok) {
        const message =
          slot.reason === "url_locked"
            ? "This URL is already being checked — try again shortly."
            : "The service is busy right now — try again shortly.";
        emitTerminal("error", { type: "busy", message }, "error");
        return;
      }
      releaseSlot = slot.release;

      // --- 120s watchdog (TRD §5) ---
      watchdog = setTimeout(() => {
        emitTerminal("error", { type: "timeout", message: "Timed out." }, "error");
      }, WATCHDOG_MS);

      runId = createRun(url);

      try {
        // --- 2. Scrape ---
        status(`Visiting ${url}…`);
        let scrapeJson: ScrapeResponse;
        try {
          const res = await fetch(`${SCRAPER_URL}/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            signal: request.signal,
          });
          scrapeJson = (await res.json()) as ScrapeResponse;
        } catch (e) {
          if (closed) return; // client aborted mid-fetch — nothing to report
          console.error("[api/run] scraper request failed", e);
          emitTerminal(
            "error",
            { type: "scraper_unavailable", message: "Could not reach the scraping service." },
            "error",
          );
          return;
        }

        if (!scrapeJson.ok) {
          console.error("[api/run] scrape failed", scrapeJson.error);
          emitTerminal("error", scrapeErrorPayload(scrapeJson.error), "error");
          return;
        }
        if (scrapeJson.redirected) {
          status(`URL redirected → following to ${scrapeJson.finalUrl}`);
        }
        trail(
          "Opened the page",
          `The page loaded successfully${scrapeJson.redirected ? " after following a redirect" : ""}.`,
        );
        if (closed) return;

        // --- 3. Parse ---
        status("Reading the page…");
        const currentSnapshot: Snapshot = await parse(scrapeJson.html, {
          url,
          finalUrl: scrapeJson.finalUrl,
          httpStatus: scrapeJson.httpStatus,
          fetchedAt: scrapeJson.fetchedAt,
          title: scrapeJson.title,
          metaDescription: scrapeJson.metaDescription,
        });
        if (closed) return;

        // --- 4. Agent — one orchestrator, holding tools, decides baseline vs. compare itself
        // (no hardcoded gate() branch here anymore; see agent/agent.ts). ---
        const previousSnapshot = getLatestSnapshot(url);
        if (previousSnapshot) {
          trail("Loaded previous snapshot", `Found a snapshot from ${timeAgo(previousSnapshot.fetchedAt)} to compare against.`);
        }
        if (closed) return;

        let agentResult: Awaited<ReturnType<typeof runAgent>>;
        try {
          agentResult = await runAgent(
            { url, previousSnapshot, currentSnapshot, scope: { includeHeader, includeFooter } },
            pipelineEmit,
          );
        } catch (e) {
          // runAgent degrades internally and should never throw — this is a last-resort net.
          if (closed) return;
          console.error("[api/run] agent failed", e);
          emitTerminal("error", { type: "analysis_unavailable", message: "Analysis service unavailable." }, "error");
          return;
        }

        // Baseline advances to this run regardless of outcome (TRD §3 retention: latest baseline per URL).
        try {
          saveSnapshot(currentSnapshot);
        } catch (e) {
          console.error("[api/run] saveSnapshot failed", e);
        }

        const renderSpec = agentResult.renderSpec;
        try {
          saveReport(runId, currentSnapshot.url, renderSpec);
        } catch (e) {
          console.error("[api/run] saveReport failed", e);
        }
        emitTerminal("report", { renderSpec }, agentResult.status);
      } catch (e) {
        // Safety net — nothing above should reach here, but the stream must never crash
        // (TRD §6): always end with exactly one terminal event, never leak internals.
        if (closed) return;
        console.error("[api/run] unexpected failure", e);
        emitTerminal("error", { type: "internal", message: "Something went wrong analyzing this page." }, "error");
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
