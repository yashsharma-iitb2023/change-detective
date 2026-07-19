// Run: node --experimental-strip-types --test src/lib/limits.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireRunSlot, rateLimitOk } from "./limits.ts";

test("rateLimitOk allows the burst then blocks, and refills over time", () => {
  const key = `test-ip-${Math.random()}`;
  let now = 0;
  for (let i = 0; i < 10; i++) assert.equal(rateLimitOk(key, now), true, `request ${i} should pass`);
  assert.equal(rateLimitOk(key, now), false, "11th request in the same instant should be blocked");

  now += 6_000; // 1/10th of the window -> ~1 token back
  assert.equal(rateLimitOk(key, now), true);
  assert.equal(rateLimitOk(key, now), false);
});

test("acquireRunSlot rejects a second concurrent run of the same URL", () => {
  const url = `https://example.com/${Math.random()}`;
  const first = acquireRunSlot(url);
  assert.equal(first.ok, true);

  const second = acquireRunSlot(url);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "url_locked");

  if (first.ok) first.release();
  const third = acquireRunSlot(url);
  assert.equal(third.ok, true, "slot should be free again after release");
  if (third.ok) third.release();
});

test("acquireRunSlot enforces the global concurrency cap", () => {
  const slots = [1, 2, 3].map((n) => acquireRunSlot(`https://example.com/cap-${n}-${Math.random()}`));
  assert.ok(slots.every((s) => s.ok));

  const overflow = acquireRunSlot(`https://example.com/cap-overflow-${Math.random()}`);
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.reason, "concurrency");

  for (const s of slots) if (s.ok) s.release();
});
