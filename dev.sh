#!/usr/bin/env bash
# Starts the scraper and the web app together; Ctrl-C stops both.
# First run bootstraps everything (node deps, Python venv, Playwright Chromium) with no manual
# steps — so a fresh clone is a single `./dev.sh` away from running.
set -euo pipefail
cd "$(dirname "$0")"

# Single source of truth for the scraper port: the scraper binds it, the web app targets it.
SCRAPER_PORT=7788

# --- Ensure dependencies are installed (idempotent; only does work when something is missing) ---

# 1. Web (Node) deps
if [ ! -d web/node_modules ]; then
  echo "→ Installing web dependencies (npm install)…"
  (cd web && npm install)
fi

# 2. Python venv for the scraper
if [ ! -x scraper/.venv/bin/python ]; then
  echo "→ Creating Python venv and installing scraper dependencies…"
  python3 -m venv scraper/.venv
  scraper/.venv/bin/pip install --quiet --upgrade pip
  scraper/.venv/bin/pip install --quiet -r scraper/requirements.txt
fi

# 3. Playwright's Chromium. `playwright install` is idempotent (skips if already present); a
# marker file lets us avoid even that ~1s check on the common already-installed path.
if [ ! -f scraper/.venv/.chromium-installed ]; then
  echo "→ Installing Playwright Chromium…"
  scraper/.venv/bin/python -m playwright install chromium
  touch scraper/.venv/.chromium-installed
fi

# --- Start both servers ---

# SSRF_ALLOW_HOSTS: dev-only allowlist so the agent can scrape the bundled sample page at
# http://localhost:5050/test-page. Harmless locally; do not carry into a public deployment.
SCRAPER_PORT=$SCRAPER_PORT SSRF_ALLOW_HOSTS="localhost,127.0.0.1" scraper/.venv/bin/python scraper/app.py &
pids=$!
(cd web && PORT=5050 SCRAPER_URL="http://127.0.0.1:$SCRAPER_PORT" npm run dev) &
pids="$pids $!"

trap 'kill $pids 2>/dev/null' INT TERM EXIT
wait
