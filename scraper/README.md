# Scraper

Small FastAPI service that renders a URL with headless Chromium (Playwright)
and returns the rendered HTML. Keeps one browser instance warm across
requests instead of a cold launch per scrape.

## Run

```
scraper/.venv/bin/uvicorn app:app --app-dir scraper --host 127.0.0.1 --port 7788
```

or, to pick the port up from `SCRAPER_PORT` (defaults to 7788):

```
scraper/.venv/bin/python scraper/app.py
```

`POST /scrape` with `{ "url": "https://example.com", "timeoutMs": 30000 }`.
`GET /health` for a liveness check.

## Test

```
scraper/.venv/bin/python scraper/test_scrape.py
```

Covers the SSRF guard (blocks `file://`, localhost, cloud metadata IP,
private IPs; allows public hosts) and a live scrape of a real public URL
plus a dead URL, calling the app's functions in-process — no server needed.

## Notes

- SSRF defenses live in `ssrf.py`: scheme allowlist, resolved-IP range
  blocking (deny by default, only globally-routable IPs allowed), and a
  Playwright navigation guard that re-validates every redirect hop and caps
  the chain at 5.
- Binds to `127.0.0.1` only — not a public service.
- Uses full Chromium (new headless mode) and presents the current Chrome
  user-agent derived from the installed browser (no "Headless" tell), so live
  SPA sites render and don't fingerprint it as a bot. Waits for
  `domcontentloaded` (not `networkidle`) so chatty SPAs don't falsely time out.
  Keep browsers current with `scraper/.venv/bin/python -m playwright install chromium`.
- Bad targets never produce a 500; every failure is a structured
  `{ "ok": false, "error": {...} }`.
