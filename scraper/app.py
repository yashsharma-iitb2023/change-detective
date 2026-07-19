"""Rendering service: fetches a URL with headless Chromium and returns the
rendered HTML plus redirect/status metadata. Runs as a small FastAPI service
so one browser instance stays warm across requests instead of a cold launch
per scrape.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeout
from playwright.async_api import async_playwright
from pydantic import BaseModel

from ssrf import DNSResolutionError, SSRFError, make_navigation_guard, validate_url

DEFAULT_TIMEOUT_MS = 30_000
SETTLE_MS = 2_000  # extra wait after network idle for late JS-rendered content

_browser = None
_playwright = None
_user_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _browser, _playwright, _user_agent
    _playwright = await async_playwright().start()
    # Full Chromium in new headless mode — closer to a real browser than the
    # headless shell, which more sites fingerprint and block.
    _browser = await _playwright.chromium.launch(headless=True)
    # Derive the UA from the actual (latest installed) browser and drop the
    # "Headless" tell, so we always present as the current Chrome version.
    probe = await _browser.new_context()
    probe_page = await probe.new_page()
    ua = await probe_page.evaluate("navigator.userAgent")
    await probe.close()
    _user_agent = ua.replace("HeadlessChrome", "Chrome").replace("Headless", "")
    yield
    await _browser.close()
    await _playwright.stop()


app = FastAPI(lifespan=lifespan)


class ScrapeRequest(BaseModel):
    url: str
    timeoutMs: int = DEFAULT_TIMEOUT_MS


def _error(error_type: str, message: str, http_status: int | None = None) -> dict:
    error = {"type": error_type, "message": message}
    if http_status is not None:
        error["httpStatus"] = http_status
    return {"ok": False, "error": error}


async def _attempt_scrape(url: str, timeout_ms: int) -> dict:
    context = await _browser.new_context(
        user_agent=_user_agent,
        viewport={"width": 1280, "height": 800},
        locale="en-US",
    )
    page = await context.new_page()
    try:
        await page.route("**/*", make_navigation_guard())

        try:
            # Wait for the DOM, not networkidle: modern SPAs keep connections open
            # (polling/websockets) and never go idle, so networkidle would falsely time out.
            response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            # Best-effort settle for client-side rendering; don't fail if it never idles.
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeout:
                pass
            # Fixed extra settle so JS that injects content via timers/fetches after
            # network-idle (live widgets, e.g. trackers) has a chance to render before we
            # snapshot. ponytail: tune SETTLE_MS if a target renders slower.
            await page.wait_for_timeout(SETTLE_MS)
        except PlaywrightTimeout:
            return _error("timeout", "page took too long to load")
        except PlaywrightError:
            # Covers both real navigation failures and requests aborted by
            # the SSRF navigation guard on a redirect hop — don't leak which.
            return _error("navigation", "could not load page")

        # Belt-and-suspenders: re-check the final host too (redirect hops
        # were already validated by the navigation guard above).
        try:
            validate_url(page.url)
        except (SSRFError, DNSResolutionError):
            return _error("navigation", "request blocked")

        http_status = response.status if response else None
        if response is not None and response.status >= 400:
            return _error("http_error", f"server returned {response.status}", response.status)

        html = await page.content()
        title = await page.title()
        meta_description = await page.evaluate(
            """() => {
                const el = document.querySelector('meta[name="description"]')
                    || document.querySelector('meta[property="og:description"]');
                return el ? (el.getAttribute('content') || '') : '';
            }"""
        )
        return {
            "ok": True,
            "requestedUrl": url,
            "finalUrl": page.url,
            "httpStatus": http_status,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "html": html,
            "title": title,
            "metaDescription": meta_description,
            "redirected": page.url != url,
        }
    finally:
        await context.close()


async def scrape_url(url: str, timeout_ms: int) -> dict:
    try:
        validate_url(url)
    except DNSResolutionError:
        return _error("dns", "could not resolve host")
    except SSRFError:
        return _error("navigation", "request blocked")

    result = await _attempt_scrape(url, timeout_ms)
    if not result["ok"] and result["error"]["type"] in ("timeout", "navigation"):
        result = await _attempt_scrape(url, timeout_ms)  # retry once
    return result


@app.post("/scrape")
async def scrape(req: ScrapeRequest):
    try:
        return await scrape_url(req.url, req.timeoutMs or DEFAULT_TIMEOUT_MS)
    except Exception:
        # Never 500 on a bad target — structured failure, no internal detail.
        return _error("navigation", "could not process request")


@app.get("/health")
async def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SCRAPER_PORT", 7788)))
