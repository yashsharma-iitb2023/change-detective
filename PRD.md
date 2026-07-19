# PRD — Autonomous Web Change-Detection Agent

## 1. Goal

A user gives a URL and hits Run. The system renders the page, reduces it to a structured
**Markdown** snapshot, and hands it to an **agent** that decides what to do:

- **First visit** → the agent reads the page (content + meta description), forms an analysis of
  *what the page is*, and remembers it.
- **Return visit** → the agent gets the deterministic diff since last time, reasons over the
  changes *in the context of that remembered analysis*, and produces a structured change report:
  what changed, before → after, and a one-line read on *why it might matter*, per section.

The emphasis is **significance, not just difference**, and the agent — not a hardcoded script —
decides the path. See `README.md` for the stack; `TRD.md` for the technical contracts.

## 2. Build order

**Backend first. Frontend is the last fortress.** Nothing in the UI is built until the backend
produces a correct, inspectable report over real websites.

1. **Scraper** (Python + Playwright) — fetch & render a page.
2. **Parser** — rendered HTML → structured Markdown snapshot.
3. **Persistence** — snapshots / runs / reports / page-memory in SQLite.
4. **Diff engine** — deterministic per-section diff (the grounding + cost guard).
5. **Agent** — the tool-calling orchestrator that decides and reasons.
6. **Frontend** — renders whatever the agent's report specifies.

Each stage is independently runnable and testable before the next is started.

---

## 3. Stage specs

### 3.1 Scraper

**Input:** a URL.
**Does:** headless full Chromium via Playwright — navigate (`domcontentloaded` + a short settle
for late JS-rendered content, not fragile `networkidle`), follow & re-validate redirects, present
a current real-Chrome user-agent, capture the rendered DOM + `<meta>` description.
**Output:**
```json
{ "requestedUrl", "finalUrl", "httpStatus", "fetchedAt", "html", "title", "metaDescription", "redirected" }
```
**Requirements:** per-request timeout; retry once; surface non-2xx; never throw uncaught — return
a structured `{ ok:false, error }`. Runs as a FastAPI service (`POST /scrape`) so the browser stays
warm. Bound to localhost; SSRF-guarded (see TRD §8.1).

### 3.2 Parser

**Input:** scraper output (rendered HTML + meta).
**Does:** split the page into **three regions — `header`, `body`, `footer`**. The **body** is
extracted with **Defuddle** (content-extraction: robustly strips nav/header/footer/sidebar
boilerplate by content heuristics, with a structural fallback); header/footer are detected
separately (semantic tag → ARIA role → CSS-module-aware class/id match) for the include/exclude
toggles. Each region's content is converted to **Markdown** (Defuddle's markdown for the body,
Turndown+GFM for header/footer) so **tables, lists, bullets, links, headings and emphasis are
preserved**, not flattened. Each region is split into sections (heading + Markdown text) with a
**structural fingerprint** (block-shape signature) used to tell functional from content changes.
**Output (the canonical snapshot):**
```json
{
  "url", "finalUrl", "fetchedAt", "httpStatus", "title", "metaDescription",
  "regions": {
    "header": { "sections": [ { "id", "heading", "text (markdown)" } ], "structuralFingerprint" },
    "body":   { "sections": [ ... ], "structuralFingerprint" },
    "footer": { "sections": [ ... ], "structuralFingerprint" }
  }
}
```
All three regions are **always parsed and stored**; whether a region is *analyzed* is the user's
toggle (§3.3), so flipping it never forces a re-scrape. This snapshot is the single unit stored
and compared — everything downstream speaks this shape.

> Limitation: content built from `<div>` grids (some SPAs) has no real table/list structure to
> recover, so it renders as clean text rather than a table.

### 3.3 Persistence & the run flow

**Tables:** `snapshots`, `runs`, `reports`, and **`page_memory`** — the agent's durable per-URL
understanding (what the page is), updated across runs so a return visit has context.

**Analysis scope:** the run carries `{ includeHeader, includeFooter }` (body always analyzed;
default is body-only). Excluded regions are still stored, just not diffed.

**Run flow (the orchestration route):** scrape → parse → load the latest prior snapshot →
`runAgent({ url, previousSnapshot, currentSnapshot, scope })` → save the new snapshot (advance the
baseline) + the report. Whether this is a first or return visit is discovered *by the agent*
(via its `assess` tool), not branched in the route.

---

## 4. The agent (the core)

**Shape: one orchestrator agent that holds tools and DECIDES the workflow** — a real tool-calling
loop (Vercel AI SDK `generateText` + tool calls), not a hardcoded chain. It runs over a
provider-agnostic **LLM failover chain** (§4.3). Input: `{ url, previousSnapshot, currentSnapshot,
scope }`. Every tool call emits `status` + `trail` events to the live feed.

### 4.1 Tools

- **`assess`** *(always called first — the single source of truth)* → returns `seenBefore`, any
  `pastAnalysis` (from page-memory), the current `page` (title, meta, section text), and — if seen
  before — the exact `changes` (the deterministic diff, each with a stable `index`). The diff runs
  **only here** and is the only source of before/after facts.
- **`save_analysis({ analysis })`** → persists the agent's understanding of the page to page-memory
  for future visits.
- **`deliver_report({ summary, blocks:[{ changeIndex, type, significance }] }])`** → ends the task.
  The agent supplies only the display `type` + `significance` + `summary`; the actual
  region/section/before/after are filled from the diff by `changeIndex` — **the model never authors
  a fact**. Baseline reports have empty `blocks` and a summary that *is* the page analysis.

### 4.2 Decision flow (the agent's, not ours)

1. Call `assess`.
2. **Not seen before** → write a concise analysis of what the page is (grounded in the returned
   content) → `save_analysis` → `deliver_report` (summary = analysis, no blocks).
3. **Seen before** → if `changes` is empty, deliver "no meaningful change"; else reason over the
   changes in light of `pastAnalysis` and deliver one block per change (choose block type, write a
   concrete, outcome-focused significance), referencing each change's `index`.

Guardrails enforce grounding: `deliver_report` is refused until `assess` has run, and blocks with a
missing/invalid `changeIndex` are dropped rather than invented.

**How significance is written (domain-agnostic).** The "why it matters" line must *interpret* the
change — its direction and real-world implication — not restate it, call it "worth a look", or
comment on the monitoring process. There is **no hardcoded domain** in the prompt: the agent frames
the interpretation with its own saved analysis of *what this page is and who relies on it*
(`pastAnalysis`), so the "right lens" for a pricing page, a legal clause, a metrics dashboard, or a
news feed is self-generated per page rather than templated. When several related values move the
same way, it names the overall trend. Elapsed time (`sinceLastVisit`, §4.4) only *calibrates* how
surprising a change is — it is never the explanation, and a change is never attributed to a "data
refresh".

**Live narration (agent-authored):** every tool also takes a short `activity` — a ≤5-word, plain,
present-tense note of what the agent is doing *right now* ("Checking the page", "Comparing to last
visit", "Writing the report"), written by the model itself and emitted as a live `status` the moment
the tool runs. It piggybacks on the tool calls the agent already makes (no extra round-trips) and
drives the main-screen live view (§5). A code fallback supplies a default if the model omits it.

### 4.3 Reliability & the LLM layer

- **Provider-agnostic LLM layer** (`src/agent/model.ts`) is the only place that knows about
  providers. It builds models (OpenAI-compatible — Groq/NVIDIA/Mistral — or Google-native via
  `@ai-sdk/google`) and exposes one internal API, `withFailover`. The agent calls it and only sees
  an abstract model, so providers can be added/swapped/reordered without touching other code.
- **Failover:** `withFailover` tries the configured chain (`GLM_*` + optional `LLM2_/3_/4_`) in
  order; the first grounded report wins, the rest are backups — **one provider running out never
  breaks output**. The switch is silent to the user (logged server-side), not surfaced in the trail.
- **Deferral (cooldown):** when a provider returns a rate-limit/quota error, it's put in a cooldown
  (honoring `Retry-After` when sent, else a default window) and **skipped on subsequent runs until
  it's likely back** — so a run doesn't keep paying the round-trip to re-hit a dead provider, and
  results stay fast. A successful call clears the cooldown; if every provider is cooling down, the
  chain is tried anyway rather than giving up.
- **Deterministic fallback:** if *every* model errors or can't finish, the run still returns a valid
  report built directly from the diff/meta (a "degraded" trail entry makes this visible). `runAgent`
  never throws.
- **Model requirement:** a tool-calling model. Avoid *reasoning* models whose `reasoning_content`
  breaks OpenAI-compatible multi-turn tool loops (gpt-oss, some nemotron variants).

**Scope: single page** — no crawling. "Agentic" = the agent deciding baseline-vs-compare, choosing
tools, judging significance, and handling redirects/retries/failover.

### 4.4 Temporal context

`assess` also gives the agent `previousFetchedAt`, `currentFetchedAt`, and a precomputed
`sinceLastVisit` ("3 minutes" / "2 hours" / "4 days") — because models are unreliable at date math.
It is used to *calibrate surprise* (heavy churn on a feed over a short window is more routine than a
change on a normally-static page), never to explain a change. The agent's judgment about how many
changes it surfaced vs. dismissed is also made visible in the trail ("Judged 2 of 3 detected changes
significant… the rest were minor").

---

## 5. Frontend render contract (dynamic display)

`deliver_report` produces a **render spec**: an ordered list of typed blocks. The frontend maps
each block type to a component — adding a display style = adding a block type, not rewiring the agent.

```json
{
  "url", "finalUrl", "comparedAt",
  "summary": "overall summary (or the page analysis on a first visit)",
  "blocks": [
    {
      "type": "content_change | functional_change | section_added | section_removed | metric_change | callout",
      "region": "header | body | footer",
      "section": "heading/label of where on the page",
      "before": "markdown",   // null for additions / functional changes
      "after": "markdown",    // null for removals / functional changes
      "changeType": "content | functional | …",
      "significance": "one-line why-it-matters",
      "items": [              // optional: per-entry breakdown of a changed list section
        { "op": "added | removed | updated", "text": "one-line markdown" }
      ]
    }
  ]
}
```

A changed section is often a *list* (a feed, a table of rows, a set of links) where many entries
moved at once. When the diff detects this, it emits `items` — a deterministic, grounded breakdown of
which entries were **added / removed / updated** (keyed by entry text so reordering and renumbering
don't create false diffs). The UI shows these as **one-line bullets**, with the full before/after
tucked behind a toggle — so "one snippet, many changes" reads as a scannable list, not a wall of text.

**Frontend responsibilities:**
1. **Trigger** — URL field (with a datalist of previously-run URLs) + Run + **Exclude header** /
   **Exclude footer** toggles (default excluded → body-only).
2. **Live activity (main view)** — while a run is in flight, the **main section** shows what the
   agent is doing right now, Claude-chat style: a single live line (the current `status`, animated)
   with a shimmer **skeleton** of the incoming report beneath it. The skeleton sits in the *same*
   surface the summary will fill, so the report fades in place rather than swapping one card for
   another. Driven by the agent's own `activity` narration (§4.1) plus the pre-agent scrape/parse
   steps; on error, the failure surfaces here.
3. **Structured report** — renders `blocks` by type; each shows section, before, after (as rendered
   **Markdown** — tables/lists/links, XSS-safe), and the significance line.
4. **Agent trail** — the left-column audit log: streams `trail` events — every tool the agent
   invoked and why (provider failover is logged server-side, not shown here). Persists after the run.

The frontend renders **only** what the render spec contains — it holds no analysis logic.

---

## 6. Reliability & edge cases

- Unreachable URL / timeout / non-2xx / blocked (SSRF) → structured error surfaced in the feed; no crash.
- Redirects → followed and re-validated; noted in the trail.
- First run → the agent captures a baseline **analysis** (not just "baseline captured").
- No meaningful change → agent delivers a clear "no meaningful change" report; the deterministic
  diff makes zero LLM calls when nothing changed.
- LLM provider exhausted/erroring → failover to a backup; deterministic report if all exhausted.
- Scraper unavailable → friendly `error` event, stream closed cleanly.

## 7. Out of scope (for now)

- Crawling / multi-page exploration; building our own target website (test on real sites first).
- Auth, scheduled/cron monitoring, multi-user, notifications.

## 8. Open questions

- Change granularity: section-level (current) vs. finer element-level diffs.
- Snapshot retention: latest-baseline-per-URL (current) vs. full history for trend analysis.
- Whether to add a light exploration step (follow a changed key link) to go beyond single-page.
