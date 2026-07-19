# Change Detective

**Point it at a URL. It tells you what changed since last time — and why it matters.**

An autonomous web change-detection agent. You give it a URL and hit Run. It renders the page,
snapshots the content, and on the next run it diffs against the last snapshot, reasons over the
difference, and produces a structured report: what changed, before → after, and a one-line take
on *why the change is significant* — organised by page section, streamed live as it works.

The emphasis is on **significance, not just difference**. Anyone can tell you three lines of text
changed. This tells you *the pricing number dropped, which may shift conversion* — the interpretation
is the product.

---

## Demo



https://github.com/user-attachments/assets/69a7105f-b1d2-429d-abb5-7a9d2d6c2035



---

## What it does

- **Trigger** — a URL, a Run button, and toggles to exclude the header/footer from analysis.
- **Live status feed** — real-time: which URL it's visiting, what step it's on.
- **Agentic decision** — the agent checks whether it has seen the page before and decides the path:
  first visit → analyse the page and remember what it is; return visit → reason over the diff using
  that memory. It's not a fixed script.
- **Structured change report** — per section, dynamically laid out: what changed, before, after,
  and a one-line significance read (rendered as Markdown — tables, lists, links preserved).
- **Agent trail** — every tool the agent invoked and why, so the reasoning is auditable. (Provider
  failover is an internal detail — logged server-side, not shown to the user.)

---

## Architecture

```
Browser (Next.js UI)
  │  SSE:  GET /api/run?url=…&includeHeader=…&includeFooter=…
  ▼
Next.js route handler ──►  Python scraper (FastAPI + Playwright)   render + SSRF guard
      │                         returns rendered HTML + meta + redirect/status
      ├─►  Parser        HTML → { header, body, footer } Markdown snapshot; body via Defuddle
      ├─►  Diff engine   deterministic per-section diff, functional vs content   ◄── the cost decision
      └─►  Agent (tool-calling loop, over an LLM failover chain)
             tools: assess · save_analysis · deliver_report
             first visit → analyse the page & remember it │ return visit → reason over the diff
  ▲
  └── streamed events:  status │ trail │ report │ error   (exactly one terminal)
```

Two processes: a **Next.js + TypeScript** app (UI, orchestration, agent, DB) and a **Python +
Playwright** scraper. Component responsibilities and the data contracts are detailed in the
sections below.

### Key decisions (and why)

- **An agent that decides the workflow — not a hardcoded chain.** A single orchestrator holds tools
  (`assess`, `save_analysis`, `deliver_report`) and *decides* what to do from `assess`'s result:
  on a **first visit** it forms an analysis of what the page is and saves it to memory; on a **return
  visit** it reasons over the diff *in the context of that past analysis* and delivers a change report.
  The model drives a real tool-use loop (AI SDK `generateText` + tool calls); we supply tools, a generic
  system prompt, and grounded facts — not the steps.
- **Diff before the LLM — the cost/latency call.** The deterministic diff runs inside `assess` and is
  the *only* thing that sees the full page; the LLM only ever receives the changed deltas — roughly a
  20–40× token reduction vs. sending the DOM, with less hallucination surface. No change → no analysis needed.
- **The LLM never authors the facts.** `deliver_report` blocks carry only a `changeIndex` + display
  `type` + `significance` from the model; the actual before/after/section are filled from the diff by
  index. A scraped page can't prompt-inject content into the report.
- **Significance is interpreted, and domain-agnostic.** The "why it matters" line must say what the
  change *indicates* (its direction and real-world implication) — not restate it or note that the page
  refreshed. There's **no hardcoded domain** in the prompt: the agent frames each interpretation with
  its own saved analysis of *what this page is and who relies on it*, so the right lens (pricing, legal
  clause, metrics dashboard, news feed…) is self-generated per page. A precomputed "time since last
  visit" only *calibrates* how surprising a change is — never explains it. And the agent's verdict is
  visible in the trail ("Judged 2 of 3 detected changes significant… the rest were minor").
- **A provider-agnostic LLM layer with failover.** `src/agent/model.ts` is the *only* file that
  knows about LLM providers — it builds models (OpenAI-compatible: Groq/NVIDIA/Mistral/…, or
  Google-native via `@ai-sdk/google`) and exposes one internal API, `withFailover`. The agent calls
  that and only ever sees an abstract model, so a provider can be added, swapped, or reordered
  without touching any other code. `withFailover` tries the configured chain (`GLM_*` + `LLM2_/3_/4_`)
  in order — first grounded result wins — and a **deterministic report** underneath guarantees a
  valid result even if every model is exhausted. Failover is transparent to the user (logged
  server-side only), so a rate-limited provider never shows up as an error.
- **Functional vs content.** Each snapshot keeps a Markdown content view and a structural fingerprint.
  A change that moves the fingerprint but not the text is *functional* (formatting); a text change is
  *content*. They're reported differently.

---

## Running it

**Prerequisites:** Node 20+, Python 3.11+. The Python venv and Playwright's Chromium are already set
up under `scraper/.venv` (recreate with the steps below if needed).

### 1. Configure

```bash
cp .env.example .env          # if you don't already have one
```
Edit `.env`. The primary LLM (`GLM_*`) is required; the `LLM2_/LLM3_/LLM4_` backups are optional
but recommended (failover). **Use a tool-calling model** — Groq `llama-3.3-70b-versatile`, NVIDIA
`nemotron`, etc. Avoid *reasoning* models (gpt-oss, some nemotron variants): their `reasoning_content`
breaks OpenAI-compatible multi-turn tool loops.
```
GLM_API_KEY=…                 # any OpenAI-compatible provider
GLM_BASE_URL=https://api.groq.com/openai/v1
GLM_MODEL=llama-3.3-70b-versatile
# Optional backups, tried in order if the primary is rate-limited/down:
# LLM2_API_KEY=…  LLM2_BASE_URL=…  LLM2_MODEL=…
SCRAPER_URL=http://127.0.0.1:7788
```
> Notes: Groq's free tier caps at ~100k tokens/day — add a backup to keep going. Any slot can be
> **Google Gemini** via its native provider — set `LLM2_PROVIDER=google` (no base URL needed);
> other slots default to OpenAI-compatible. The web app reads this file via a symlink
> (`web/.env → ../.env`), so the repo root is the single source of truth.

### 2. Run both servers — one command

```bash
./dev.sh          # starts the scraper (:7788) + web app (:5050); Ctrl-C stops both
```

**No manual setup.** On first run `dev.sh` bootstraps everything it needs — installs the web
dependencies, creates the Python venv and installs the scraper's requirements, and downloads
Playwright's Chromium — then starts both servers. It's idempotent: subsequent runs skip straight
to starting up. All you need on the machine is **Node 20+** and **Python 3.11+**.

Prefer two terminals (and to install deps yourself)?
```bash
cd web && npm install                                   # web
python3 -m venv scraper/.venv && scraper/.venv/bin/pip install -r scraper/requirements.txt
scraper/.venv/bin/python -m playwright install chromium # scraper browser
# then: scraper/.venv/bin/python scraper/app.py   and   cd web && npm run dev
```

Open http://localhost:5050, enter a URL, Run. The **first** run has the agent analyse the page and
remember what it is; run it **again** (after the page changes) to get the change report reasoned in
light of that memory.

### Tests

```bash
cd web && npm test                             # parser, db, diff, agent (mock LLM tool calls), limits
scraper/.venv/bin/python scraper/test_scrape.py   # scraper + SSRF guard
```

---

## Reliability & security

Handled and verified end-to-end:

- **SSRF** — the scraper allowlists http/https, resolves the target and blocks private/internal &
  cloud-metadata IP ranges (deny-by-default), and re-validates every redirect hop.
- **Prompt injection** — scraped text is fenced and labelled untrusted; the LLM's output is
  schema-constrained (Zod) and never becomes the report's facts.
- **Abuse/cost** — per-IP rate limit, global concurrency cap, per-URL lock, and a 120s run watchdog.
- **Graceful failure** — redirects, dead URLs, DNS failures, HTTP errors, and an unreachable analysis
  service each surface a friendly message in the status feed; internals are logged server-side only.
- **XSS** — all scraped/LLM text renders as text (no `dangerouslySetInnerHTML`); CSP + security headers set.

---

## Known limitations

*(Named on purpose — these are the deliberate scope edges, not surprises.)*

- **Single page** — monitors the exact URL given; it doesn't crawl linked pages.
- **Latest-baseline retention** — compares against the previous run, not a full history/trend.
- **Section-level granularity** — diffs by section, not individual DOM attributes.
- **Body extraction uses Defuddle** (content-extraction) to robustly strip nav/header/footer/sidebar
  boilerplate, so obfuscated SPA markup still yields a clean body; it falls back to structural parsing
  when Defuddle returns too little. Header/footer regions are detected separately (semantic tag → ARIA
  role → CSS-module-aware class/id match) for the include/exclude toggles. Data-heavy SPAs (vs. article
  pages) are the hard case — body extraction can be partial there.
- **Content is parsed to Markdown** (Defuddle's markdown for the body, Turndown+GFM for header/footer)
  so tables, lists, bullets, links, headings and emphasis are preserved instead of flattened, and the
  report renders them with react-markdown (rehype-raw + rehype-sanitize keeps it XSS-safe). Note:
  content built from `<div>` grids rather than real `<table>`/`<ul>` markup (some SPAs) can't be turned
  into a table/list — there's no structure to recover.
- **Significance is the model's judgement** — a helpful read, not domain-calibrated truth.
- **Single-instance** — rate limits/locks are in-memory; a multi-instance deploy would move them to Redis.
- One build-chain `npm audit` advisory (PostCSS, transitive via Next, build-time only) is left as-is
  rather than force-downgrading Next.

---

## Project structure

```
scraper/              Python + Playwright + FastAPI
  app.py              POST /scrape, GET /health, warm browser
  ssrf.py             URL/IP allowlisting + redirect-hop guard
web/
  src/app/            page.tsx, layout, globals.css, api/run/route.ts (SSE orchestration)
  src/components/     TriggerForm, StatusFeed, AgentTrail, ChangeReport, blocks/ (dynamic registry)
  src/lib/            types (shared contract), parser, db (+ page_memory), diff, limits
  src/agent/          agent (tool-calling loop + deterministic fallback)
                      model (LLM layer: OpenAI-compatible + Google-native providers, failover API)
```

Built with Next.js, the Vercel AI SDK (tool-calling agent), a provider-agnostic LLM layer with
failover (Groq / Google Gemini / NVIDIA NIM / …), Playwright, Defuddle, Turndown, react-markdown,
and SQLite.
