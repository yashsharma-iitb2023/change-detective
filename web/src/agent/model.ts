// ── LLM layer ──────────────────────────────────────────────────────────────────────────────
// The single place that knows about LLM providers. Everything else (the agent, the route) calls
// `withFailover(...)` and only ever sees an abstract `LanguageModel` — so providers can be added,
// swapped, or reordered here WITHOUT touching any other file.
//
// Providers are read from env slots (GLM_* primary, LLM2_/LLM3_/LLM4_ backups). Each slot picks a
// provider: OpenAI-compatible (Groq, NVIDIA NIM, Mistral, Cerebras, …) or Google-native (Gemini,
// whose OpenAI-compat shim rejects complex tool schemas, so it needs the real @ai-sdk/google
// provider). Set `<SLOT>_PROVIDER=google|openai` to be explicit; otherwise it's auto-detected.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export interface ModelChoice {
  name: string;
  model: LanguageModel;
}

// Priority order. Slot 1 (GLM_*) is the primary; 2–4 are optional failover backups.
const SLOTS: { prefix: string; label: string }[] = [
  { prefix: "GLM", label: "primary" },
  { prefix: "LLM2", label: "backup-2" },
  { prefix: "LLM3", label: "backup-3" },
  { prefix: "LLM4", label: "backup-4" },
];

function detectProvider(prefix: string, baseURL: string | undefined): "google" | "openai" {
  const explicit = process.env[`${prefix}_PROVIDER`]?.toLowerCase();
  if (explicit === "google" || explicit === "openai") return explicit;
  if (baseURL && /generativelanguage\.googleapis\.com/.test(baseURL)) return "google";
  return "openai";
}

function buildModel(prefix: string): LanguageModel | null {
  const modelId = process.env[`${prefix}_MODEL`];
  if (!modelId) return null;
  const apiKey = process.env[`${prefix}_API_KEY`];
  const baseURL = process.env[`${prefix}_BASE_URL`];

  switch (detectProvider(prefix, baseURL)) {
    case "google":
      // Native provider — handles Gemini's function-calling schema correctly. baseURL is ignored.
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default:
      if (!baseURL) return null;
      return createOpenAICompatible({ name: prefix.toLowerCase(), baseURL, apiKey })(modelId);
  }
}

// When a provider hits its rate/quota limit, defer it until it's likely back, so subsequent runs
// skip straight to a working provider instead of paying the round-trip to re-hit the dead one.
// Persists across runs (module-level) for the life of the server process.
const cooldownUntil = new Map<string, number>(); // model name -> epoch ms it may be retried
const DEFAULT_COOLDOWN_MS = 15 * 60_000; // ponytail: fixed 15-min skip; honor Retry-After when the provider sends one
const MAX_COOLDOWN_MS = 6 * 60 * 60_000;

/** If `err` is a rate-limit/quota error, how long to defer this provider; otherwise null. */
function rateLimitCooldownMs(err: unknown): number | null {
  const e = err as { statusCode?: number; status?: number; message?: string; responseHeaders?: Record<string, string> };
  const status = e?.statusCode ?? e?.status;
  const msg = String(e?.message ?? "").toLowerCase();
  const limited = status === 429 || /rate limit|quota|too many requests|resource_exhausted|exhaust/.test(msg);
  if (!limited) return null;
  const header = e?.responseHeaders?.["retry-after"];
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_COOLDOWN_MS);
    const when = Date.parse(header); // HTTP-date form
    if (!Number.isNaN(when)) return Math.min(Math.max(when - Date.now(), 0), MAX_COOLDOWN_MS);
  }
  return DEFAULT_COOLDOWN_MS;
}

/**
 * Ordered LLMs to try. First that yields a grounded result wins; the rest are failovers.
 * Providers currently in cooldown are skipped — unless every provider is cooling down, in which
 * case we return the full chain and try anyway rather than give up.
 */
export function getModelChain(): ModelChoice[] {
  const built: ModelChoice[] = [];
  for (const slot of SLOTS) {
    const model = buildModel(slot.prefix);
    if (model) built.push({ name: `${slot.label} (${process.env[`${slot.prefix}_MODEL`]})`, model });
  }
  if (built.length === 0) {
    throw new Error("No LLM configured — set GLM_MODEL (+ GLM_BASE_URL, or GLM_PROVIDER=google).");
  }
  const now = Date.now();
  const ready = built.filter((m) => (cooldownUntil.get(m.name) ?? 0) <= now);
  return ready.length > 0 ? ready : built;
}

export interface FailoverEvent {
  label: string;
  reason: string;
}

/**
 * The LLM layer's public API. Runs `attempt` against each configured model in priority order and
 * returns the first non-null result. `attempt` returns null to mean "this model gave no usable
 * result — try the next"; a thrown error (rate limit, provider down) is treated the same way.
 * Returns null only if every model is exhausted. Callers never see provider details.
 */
export async function withFailover<T>(
  attempt: (model: LanguageModel, label: string) => Promise<T | null>,
  onFailover?: (event: FailoverEvent) => void,
): Promise<T | null> {
  const chain = getModelChain();
  for (let i = 0; i < chain.length; i++) {
    const { name, model } = chain[i];
    const isLast = i === chain.length - 1;
    try {
      const result = await attempt(model, name);
      if (result !== null) {
        cooldownUntil.delete(name); // it answered — it's healthy, clear any prior cooldown
        return result;
      }
      if (!isLast) onFailover?.({ label: name, reason: "produced no grounded result" });
    } catch (err) {
      console.error(`[llm] model "${name}" failed`, err);
      const cd = rateLimitCooldownMs(err);
      if (cd !== null) {
        cooldownUntil.set(name, Date.now() + cd);
        console.warn(`[llm] "${name}" rate-limited — deferring for ~${Math.round(cd / 60_000)} min`);
      }
      if (!isLast) onFailover?.({ label: name, reason: "was unavailable (rate limit or provider error)" });
    }
  }
  return null;
}
