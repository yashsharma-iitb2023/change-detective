"""SSRF guards for outbound scrape targets.

The service fetches user-supplied URLs server-side, which is the classic SSRF
shape (attacker points it at an internal service or cloud metadata endpoint).
Every URL is checked here before Playwright navigates to it, and every
redirect hop is checked again via the navigation guard below — nothing is
blindly followed.
"""

import ipaddress
import os
import socket
from urllib.parse import urlparse

MAX_URL_LENGTH = 2048
ALLOWED_SCHEMES = {"http", "https"}
MAX_REDIRECTS = 5

# Opt-in escape hatch for LOCAL DEVELOPMENT only: hosts listed here bypass the private-IP block so
# the agent can be pointed at a local test page (e.g. http://localhost:5050/test-page). Default is
# empty -> deny-by-default is fully intact; nothing is allowed unless SSRF_ALLOW_HOSTS is set
# (dev.sh sets it for the dev scraper). Never enable this in a deployment that faces untrusted input.
_ALLOW_HOSTS = {h.strip().lower() for h in os.environ.get("SSRF_ALLOW_HOSTS", "").split(",") if h.strip()}


class SSRFError(Exception):
    """URL blocked by policy (bad scheme, too long, resolves to a non-public IP)."""


class DNSResolutionError(Exception):
    """Hostname genuinely could not be resolved (distinct from being blocked)."""


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # Deny by default: only globally-routable IPs are allowed. This covers
    # 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
    # (incl. 169.254.169.254), 0.0.0.0, ::1, and fc00::/7 in one check.
    return not ip.is_global


def validate_url(url: str) -> None:
    """Raise SSRFError/DNSResolutionError if url is unsafe to fetch.

    Call this for the requested URL, and again for every redirect hop /
    the final URL (the navigation guard below does that for Playwright).
    """
    if len(url) > MAX_URL_LENGTH:
        raise SSRFError("url too long")

    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise SSRFError("scheme not allowed")

    host = parsed.hostname
    if not host:
        raise SSRFError("missing host")

    # Dev-only allowlist (see _ALLOW_HOSTS). Scheme/length are still enforced above.
    if host.lower() in _ALLOW_HOSTS:
        return

    try:
        # Host is already an IP literal (e.g. http://169.254.169.254/).
        ip = ipaddress.ip_address(host)
        if _is_blocked_ip(ip):
            raise SSRFError("blocked ip")
        return
    except ValueError:
        pass  # not a literal IP, resolve it below

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise DNSResolutionError("dns resolution failed") from exc
    if not infos:
        raise DNSResolutionError("dns resolution failed")

    # Guard DNS rebinding: check every resolved address, not just the first,
    # and re-run this same check for the final URL after navigation.
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if _is_blocked_ip(ip):
            raise SSRFError("blocked ip")


def make_navigation_guard():
    """Playwright route handler that re-validates every top-level navigation
    request (the initial request plus each redirect hop) and caps the
    redirect chain length. Non-navigation requests (images, scripts, xhr)
    pass through untouched.
    """
    hop_count = {"n": 0}

    async def handler(route, request):
        if request.resource_type != "document":
            await route.continue_()
            return

        hop_count["n"] += 1
        if hop_count["n"] > MAX_REDIRECTS + 1:
            await route.abort()
            return

        try:
            validate_url(request.url)
        except (SSRFError, DNSResolutionError):
            await route.abort()
            return

        await route.continue_()

    return handler
