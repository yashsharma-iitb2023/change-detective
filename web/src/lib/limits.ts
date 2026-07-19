// Abuse prevention for /api/run (TRD §8.3): per-IP rate limit, a global concurrency cap,
// and a per-URL lock so the same page can't be scraped by two overlapping runs.
//
// ponytail: everything here is a plain in-memory Map/Set — correct for the single-instance
// prototype this is (CLAUDE.md scope). Upgrade path if this ever runs multi-instance: move
// the token buckets to a shared store (Redis) and the locks to a distributed lock/queue.

const RATE_LIMIT_PER_MIN = 10;
const RATE_WINDOW_MS = 60_000;
const MAX_CONCURRENT_RUNS = 3;

const buckets = new Map<string, { tokens: number; updatedAt: number }>();

/** Token-bucket check: true if `key` (client IP) may make another run right now. */
export function rateLimitOk(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: RATE_LIMIT_PER_MIN, updatedAt: now };
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(RATE_LIMIT_PER_MIN, bucket.tokens + (elapsed / RATE_WINDOW_MS) * RATE_LIMIT_PER_MIN);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

let activeRuns = 0;
const activeUrls = new Set<string>();

export type RunSlot =
  | { ok: true; release: () => void }
  | { ok: false; reason: "concurrency" | "url_locked" };

/** Reserve a run slot: rejects a second concurrent run of the same URL, and caps total in-flight runs. */
export function acquireRunSlot(url: string): RunSlot {
  if (activeUrls.has(url)) return { ok: false, reason: "url_locked" };
  if (activeRuns >= MAX_CONCURRENT_RUNS) return { ok: false, reason: "concurrency" };

  activeRuns += 1;
  activeUrls.add(url);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      activeRuns -= 1;
      activeUrls.delete(url);
    },
  };
}
