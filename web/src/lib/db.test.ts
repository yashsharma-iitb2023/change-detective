// Run: node --experimental-strip-types --test src/lib/db.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRun, getLatestReport, getLatestSnapshot, openDb, saveReport, saveSnapshot } from "./db.ts";
import type { Snapshot } from "./types.ts";

function makeSnapshot(url: string, bodyText: string): Snapshot {
  return {
    url,
    finalUrl: url,
    fetchedAt: new Date().toISOString(),
    httpStatus: 200,
    title: "t",
    metaDescription: "",
    regions: {
      header: { sections: [], structuralFingerprint: "h1" },
      body: { sections: [{ id: "section-0", heading: "", text: bodyText }], structuralFingerprint: "b1" },
      footer: { sections: [], structuralFingerprint: "f1" },
    },
  };
}

test("saveSnapshot + getLatestSnapshot round-trip, run/report helpers work", () => {
  const db = openDb(":memory:");
  const url = "https://example.com/other";

  assert.equal(getLatestSnapshot(url, db), null);
  saveSnapshot(makeSnapshot(url, "hello"), db);
  const loaded = getLatestSnapshot(url, db);
  assert.equal(loaded?.regions.body.sections[0].text, "hello");

  const runId = createRun(url, db);
  assert.ok(runId > 0);
  saveReport(
    runId,
    url,
    { url, finalUrl: url, comparedAt: new Date().toISOString(), summary: "no change", blocks: [] },
    db,
  );
  const report = getLatestReport(url, db);
  assert.equal(report?.summary, "no change");

  db.close();
});
