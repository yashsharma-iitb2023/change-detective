# TRD — Autonomous Web Change-Detection Agent

Technical requirements for the system described in `PRD.md`. Stack is summarized in `README.md`.
This doc pins down contracts, the data model, and hard limits (tokens, latency, cost).

---

## 1. Components & responsibilities

| Component | Tech | Responsibility |
|-----------|------|----------------|
| Web app | Next.js + React (TS) | UI + `/api/run` SSE orchestration route |
| Agent | Vercel AI SDK tool-calling loop (TS) | `assess` / `save_analysis` / `deliver_report`; decides the workflow |
| LLM layer | `src/agent/model.ts` | provider-agnostic (OpenAI-compatible + Google-native); `withFailover` API |
| Scraper | Python + Playwright + FastAPI | render page, `POST /scrape` |
| DB | SQLite via `better-sqlite3` | snapshots, runs, reports, page_memory |

Deployment: two local processes — Next.js (`:5050`) and the Python scraper (`:7788`).

---

## 2. Interface contracts

### 2.1 Scraper — `POST /scrape`
Request: `{ "url": string, "timeoutMs": number = 30000 }`
Response (success):
```json
{ "ok": true, "requestedUrl", "finalUrl", "httpStatus", "fetchedAt", "html", "title", "metaDescription", "redirected": bool }
```
Response (failure): `{ "ok": false, "error": { "type": "timeout|dns|http_error|navigation", "message", "httpStatus?" } }`
Rules: wait for `domcontentloaded` + a short fixed settle for late JS-rendered content (not fragile `networkidle`, which SPAs never reach); present a current real-Chrome user-agent (full Chromium, new headless); retry once on `timeout`/`navigation`; return final URL after redirects; never 500 on a bad target — always structured `ok:false`.

### 2.2 Web app — `GET /api/run` (SSE)
Query: `url`, `includeHeader=bool`, `includeFooter=bool`.
Emits `text/event-stream` events, each `{ event, data }`:
- `status`  — `{ message }` a short live line for the main-screen activity view; either a pre-agent
  step ("Visiting…", "Reading the page…") or the agent's own ≤5-word `activity` narration
- `trail`   — `{ step, action, reasoning }` one entry per meaningful decision (left-column audit log)
- `report`  — `{ renderSpec }` the final render spec (PRD §5); terminal on success
- `error`   — `{ type, message }`; terminal on failure
Stream always ends with exactly one terminal event (`report` or `error`), then closes.

---

## 3. Data model (SQLite DDL)

```sql
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  final_url TEXT,
  http_status INTEGER,
  fetched_at TEXT NOT NULL,
  meta_description TEXT,
  regions_json TEXT NOT NULL,          -- { header, body, footer } Markdown snapshot
  UNIQUE(url, fetched_at)
);
CREATE INDEX idx_snapshots_url ON snapshots(url, fetched_at DESC);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  status TEXT NOT NULL                  -- running | baseline_captured | no_change | reported | error
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  render_spec_json TEXT NOT NULL
);

CREATE TABLE page_memory (               -- the agent's durable per-URL understanding of the page
  url TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  analysis TEXT NOT NULL
);
```
Retention: keep the **latest baseline per URL** for comparison; keep all `reports`; keep one
`page_memory` row per URL (updated across runs). Full snapshot history is out of scope (PRD §8).

---

## 4. LLM usage & hard limits

The cost/latency thesis: **diff first, send only deltas.** The deterministic diff runs inside the
agent's `assess` tool and is the *only* thing that sees the page. The model receives only the
changed sections (return visit) or the capped section text + meta (first visit) — never raw HTML.

### 4.1 Input caps (applied before anything reaches the model)

- **Section text truncation** (~600 chars in `assess`'s page view; ~800 in the change list, middle-elided).
- **Section cap** (~30) and **change cap** (~20) before the model sees them.
- **No-op guard:** if the diff finds nothing on a return visit, no reasoning is needed.
- **Tool-loop bounds:** step cap (≤6) + stop-on-successful-delivery keep the number of model
  round-trips small (typically 2–3: `assess` → [`save_analysis`] → `deliver_report`).
- **Facts, not tokens:** `deliver_report` blocks carry only `changeIndex` + `type` + `significance`;
  before/after are filled from the diff, so the model never re-emits the page text.
- **Live narration is free:** each tool has an optional ≤5-word `activity` field the model fills to
  drive the main-screen live view — it rides the existing tool calls, so it adds no round-trips and
  negligible tokens; a code fallback covers omission.

### 4.2 Cost model (why this matters)

Sending the whole rendered DOM would be **~15k–40k input tokens per run**; diff-first sends only
deltas — **typically <1k tokens** — a **~20–40× reduction**, with lower latency and less
hallucination surface. A deliberate architectural decision, not a bolted-on optimization.

### 4.3 LLM layer, failover & model config

- **Chain (env):** primary `GLM_*` + optional `LLM2_/LLM3_/LLM4_`; each slot is OpenAI-compatible
  (`*_BASE_URL`) or Google-native (`*_PROVIDER=google`).
- **`withFailover`** tries the chain in order — first grounded report wins; on rate-limit/error/no-
  result it moves to the next; a **deterministic report** is returned if all are exhausted. `runAgent`
  never throws.
- **Cooldown/deferral:** a rate-limit/quota error puts that provider in a cooldown (parsed from
  `Retry-After`, else a 15-min default, capped at 6 h) and `getModelChain` skips it until it expires,
  so later runs go straight to a healthy provider instead of re-hitting the dead one. A successful
  call clears it; if all providers are cooling down, the full chain is tried anyway. Cooldown state is
  in-process (module-level), for the life of the server.
- **Model requirement:** a **tool-calling** model (e.g. Groq `llama-3.3-70b-versatile`, Gemini
  `gemini-2.5-flash`). Avoid *reasoning* models — their `reasoning_content` breaks OpenAI-compatible
  multi-turn tool loops (gpt-oss, some nemotron variants).
- **Robustness:** provider-level retries + the 120 s run watchdog (§5). Free-tier note: Groq caps at
  ~100k tokens/day — a backup provider keeps output flowing.

---

## 5. Latency budget (per run, single page)

| Phase | Target |
|-------|--------|
| Scrape + render | ≤ 8 s (30 s hard cap, incl. JS settle) |
| Parse + diff | < 800 ms |
| Agent tool loop (LLM round-trips) | ≤ ~15 s; + a few s per failover if a provider is down |
| **End-to-end** | **≤ 25 s typical, 120 s hard cap** |

The whole run has a 120 s watchdog; on breach → `error` event, stream closed.

---

## 6. Error handling matrix (surfaced in the status feed)

| Case | Behavior | Feed message |
|------|----------|--------------|
| Redirect | follow, compare `finalUrl` | "URL redirected → following to X" |
| Timeout | retry once, then fail | "Page slow, retrying…" / "Timed out" |
| Dead URL / DNS | fail cleanly | "Could not reach URL" |
| Non-2xx | surface status, stop | "Server returned 404" |
| First run | agent captures a baseline analysis | the page analysis as the summary |
| No change | agent delivers "no change" | "No meaningful change detected" |
| LLM provider exhausted/erroring | fail over to a backup silently, and **defer that provider** (cooldown) so later runs skip it | *(no user-facing message — output is unaffected)* |
| All LLMs exhausted | deterministic report from diff/meta | "Degraded to a deterministic report" |

Every branch emits an event; nothing fails silently.

---

## 7. Non-functional

- **Concurrency:** one run per URL at a time (in-process lock keyed by URL); simplest correct choice
  for a single-user prototype.
- **Observability:** the `trail` stream *is* the audit log — one entry per decision, persisted with the report.
- **Security:** see §9 — SSRF is the headline risk (server fetches user-supplied URLs).
- **Config:** all secrets/URLs via env (`.env`): the LLM chain (`GLM_*` + optional `LLM2_/3_/4_*`,
  each `*_API_KEY`/`*_BASE_URL`/`*_MODEL`/`*_PROVIDER`) and `SCRAPER_URL`.

---

## 8. Security & abuse prevention

This app takes a user-supplied URL and fetches it server-side with a headless browser — the
exact shape that is vulnerable to **SSRF**. Content it scrapes is untrusted and gets fed to an
LLM (**indirect prompt injection**) and rendered in the UI (**XSS**). Defenses, by layer:

### 8.1 SSRF — the #1 risk (scraper input boundary)
- **Scheme allowlist:** `http`/`https` only. Reject `file:`, `ftp:`, `gopher:`, `data:`, `blob:`, etc.
- **Block private/internal ranges** on the *resolved* IP: `127.0.0.0/8`, `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (incl. cloud metadata `169.254.169.254`),
  `::1`, `fc00::/7`, `0.0.0.0`. **Deny by default.**
- **Resolve DNS, validate the IP, then connect** — and guard **DNS rebinding** (re-check or pin the
  resolved IP for the actual request; don't let a second lookup swap in an internal IP).
- **Redirects:** don't blindly follow — re-validate every hop against the same rules; cap the chain (≤5).
- **Least privilege / isolation:** run the scraper network-restricted; never forward auth headers or
  cookies to arbitrary targets; don't co-locate it with sensitive internal services.

### 8.2 Prompt injection — scraped content is untrusted (LLM boundary)
- Treat page text as **data, not instructions**: wrap in explicit delimiters and instruct the model
  to analyze it, never to obey instructions found inside it.
- **Constrain output to a strict schema** (the `deliver_report` tool + the final render spec are
  Zod-validated); off-schema output is repaired or dropped. Structured output bounds the blast radius.
- The agent's tools are **read-only analysis** (`assess` / `save_analysis` / `deliver_report`) — none
  take destructive or external actions, and the model **can't author before/after facts** (filled from
  the diff by index). Keep it that way.

### 8.3 Rate limiting & resource exhaustion (cost + DoS)
- **Per-IP/session rate limit** on `/api/run` (e.g. token bucket, ~10 runs/min). In-memory for the
  prototype; note the upgrade to a durable store (Redis) for multi-instance.
- **Global concurrency cap** on in-flight scrapes/runs (bound Playwright contexts); plus the existing
  per-URL lock (§7).
- **Playwright caps:** navigation timeout, max response body size, block large/binary downloads, one
  context per run, always close it.
- **LLM cost controls** (§4): token/char caps, ≤20 changes/call, no-op guard, per-run watchdog. Add a
  per-session run cap so a loop can't rack up spend.
- **Request limits:** URL length (≤2048) and body size caps; reject oversized input early.

### 8.4 Output handling & web hardening
- **XSS:** render scraped before/after as **text only** — never `dangerouslySetInnerHTML`. Rely on
  React's default escaping; also strip HTML from parsed text server-side.
- **Security headers:** CSP, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`.
- **Scraper is not public:** bind to localhost / restrict CORS to the Next backend only.
- **Secrets server-side only:** LLM API keys never reach the client (no `NEXT_PUBLIC_`); read only in
  the server route / LLM layer.
- **No error leakage:** return generic client errors; keep stack traces and internal targets out of
  responses, SSE `error` events, and anything echoed back to the LLM.
- **Dependencies:** pin versions; `npm audit` / `pip audit` before shipping.

> Prototype scope: rate limiting and isolation are single-user-appropriate (in-memory, localhost).
> SSRF, prompt-injection schema-constraint, and XSS escaping are **not** optional — they hold even
> for a local demo and are the ones worth demoing as evidence of security judgment.

## 9. Known limitations (name them in the README)

- Header/footer detection is heuristic; body extraction (Defuddle) can be partial on data-heavy SPAs.
- Content built from `<div>` grids (no real `<table>`/`<ul>`) can't be recovered as tables/lists.
- Single-page scope — no crawling of linked pages.
- Latest-baseline-only — no long-term trend/history.
- Section-level granularity — not element/attribute-level diffs.
- Significance judgment is LLM opinion, not domain-calibrated.
- Needs a tool-calling model; reasoning models (gpt-oss, some nemotron) break the OpenAI-compatible
  tool loop. In-memory rate-limit/locks (single-instance).
