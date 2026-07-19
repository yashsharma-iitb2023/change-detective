"""Runnable checks for the scraper service — plain asserts, stdlib only.

Run: scraper/.venv/bin/python scraper/test_scrape.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import app as scraper_app  # noqa: E402
from ssrf import DNSResolutionError, SSRFError, validate_url  # noqa: E402


def test_ssrf_blocks_bad_targets():
    blocked = [
        "file:///etc/passwd",
        "http://localhost",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5",
    ]
    for url in blocked:
        try:
            validate_url(url)
        except (SSRFError, DNSResolutionError):
            continue
        raise AssertionError(f"expected {url!r} to be blocked")
    print("ok: ssrf guard blocks file://, localhost, cloud metadata IP, private IP")


def test_ssrf_allows_public_host():
    validate_url("https://example.com")  # must not raise
    print("ok: ssrf guard allows a normal public host")


async def _run_scrape(url: str, timeout_ms: int = 15_000) -> dict:
    playwright = await scraper_app.async_playwright().start()
    scraper_app._browser = await playwright.chromium.launch(channel="chromium-headless-shell")
    try:
        return await scraper_app.scrape_url(url, timeout_ms)
    finally:
        await scraper_app._browser.close()
        await playwright.stop()


def test_scrape_live_public_url():
    result = asyncio.run(_run_scrape("https://example.com"))
    assert result["ok"] is True, result
    assert "Example Domain" in result["html"]
    assert result["title"]
    print("ok: scraping a real public URL returns ok:true with html+title")


def test_scrape_dead_url():
    result = asyncio.run(_run_scrape("http://this-domain-should-not-exist-abcxyz123.invalid"))
    assert result["ok"] is False, result
    print("ok: a dead/unreachable url returns ok:false")


if __name__ == "__main__":
    test_ssrf_blocks_bad_targets()
    test_ssrf_allows_public_host()
    test_scrape_live_public_url()
    test_scrape_dead_url()
    print("all tests passed")
