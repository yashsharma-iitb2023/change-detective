#!/usr/bin/env bash
# Starts the scraper and the web app together; Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")"

# Single source of truth for the scraper port: the scraper binds it, the web app targets it.
SCRAPER_PORT=7788

# SSRF_ALLOW_HOSTS: dev-only allowlist so the agent can scrape the bundled sample page at
# http://localhost:5050/test-page. Harmless locally; do not carry into a public deployment.
SCRAPER_PORT=$SCRAPER_PORT SSRF_ALLOW_HOSTS="localhost,127.0.0.1" scraper/.venv/bin/python scraper/app.py &
pids=$!
(cd web && PORT=5050 SCRAPER_URL="http://127.0.0.1:$SCRAPER_PORT" npm run dev) &
pids="$pids $!"

trap 'kill $pids 2>/dev/null' INT TERM EXIT
wait
