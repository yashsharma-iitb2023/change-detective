// Run: node --experimental-strip-types --test src/lib/diff.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSnapshots } from "./diff.ts";
import type { Region, Snapshot } from "./types.ts";

const scope = { includeHeader: true, includeFooter: true };

function region(sections: { id: string; heading: string; text: string }[], fp = "fp1"): Region {
  return { sections, structuralFingerprint: fp };
}

function snapshot(header: Region, body: Region, footer: Region): Snapshot {
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    httpStatus: 200,
    title: "t",
    metaDescription: "",
    regions: { header, body, footer },
  };
}

test("identical snapshots -> changed: false", () => {
  const r = region([{ id: "section-0", heading: "Intro", text: "hello world" }]);
  const snap = snapshot(region([]), r, region([]));
  const result = diffSnapshots(snap, snap, scope);
  assert.equal(result.changed, false);
  assert.deepEqual(result.changes, []);
});

test("copy edit is classified as content", () => {
  const prev = snapshot(
    region([]),
    region([{ id: "section-0", heading: "Intro", text: "Our price is $10." }]),
    region([]),
  );
  const cur = snapshot(
    region([]),
    region([{ id: "section-0", heading: "Intro", text: "Our price is $12." }]),
    region([]),
  );
  const result = diffSnapshots(prev, cur, scope);
  assert.equal(result.changed, true);
  const change = result.changes.find((c) => c.kind === "content");
  assert.ok(change);
  assert.equal(change?.before, "Our price is $10.");
  assert.equal(change?.after, "Our price is $12.");
});

test("css-only change (same text, different fingerprint) is classified as functional", () => {
  const sections = [{ id: "section-0", heading: "Intro", text: "same text" }];
  const prev = snapshot(region([]), region(sections, "fp-old"), region([]));
  const cur = snapshot(region([]), region(sections, "fp-new"), region([]));
  const result = diffSnapshots(prev, cur, scope);
  assert.equal(result.changed, true);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, "functional");
  assert.equal(result.changes[0].before, "fp-old");
  assert.equal(result.changes[0].after, "fp-new");
});

test("detects section added and section removed", () => {
  const prev = snapshot(
    region([]),
    region([
      { id: "section-0", heading: "Intro", text: "hello" },
      { id: "section-1", heading: "Old Section", text: "going away" },
    ]),
    region([]),
  );
  const cur = snapshot(
    region([]),
    region([
      { id: "section-0", heading: "Intro", text: "hello" },
      { id: "section-1", heading: "New Section", text: "brand new" },
    ]),
    region([]),
  );
  const result = diffSnapshots(prev, cur, scope);
  const added = result.changes.find((c) => c.sectionId === "section-1" && c.after === "brand new");
  assert.ok(added);
  assert.equal(added?.before, null);
  const removedChange = result.changes.find((c) => c.before === "going away");
  assert.ok(removedChange);
  assert.equal(removedChange?.after, null);
});

test("itemizes a changed list section into added/removed/updated entries", () => {
  const before = [
    "1. [Alpha](https://a.com) (a.com)",
    "\t1 point · by ann",
    "2. [Beta](https://b.com) (b.com)",
    "\t1 point · by bob",
    "3. [Gamma](https://g.com) (g.com)",
    "\t1 point · by guy",
  ].join("\n");
  const after = [
    "1. [Delta](https://d.com) (d.com)", // added
    "\t1 point · by deb",
    "2. [Alpha](https://a.com) (a.com)", // renumbered but unchanged -> not a change
    "\t1 point · by ann",
    "3. [Beta](https://b.com) (b.com)",
    "\t5 points · by bob", // points changed -> updated
    // Gamma dropped -> removed
  ].join("\n");

  const prev = snapshot(region([]), region([{ id: "section-0", heading: "", text: before }]), region([]));
  const cur = snapshot(region([]), region([{ id: "section-0", heading: "", text: after }]), region([]));
  const result = diffSnapshots(prev, cur, scope);

  const change = result.changes.find((c) => c.kind === "content");
  assert.ok(change?.items, "expected itemized breakdown");
  const ops = change!.items!.map((i) => i.op);
  assert.ok(change!.items!.some((i) => i.op === "added" && /Delta/.test(i.text)));
  assert.ok(change!.items!.some((i) => i.op === "removed" && /Gamma/.test(i.text)));
  assert.ok(change!.items!.some((i) => i.op === "updated" && /Beta/.test(i.text)));
  assert.ok(!ops.includes("updated") || change!.items!.every((i) => !/Alpha/.test(i.text))); // Alpha only renumbered -> unchanged
});

test("enforces the 2000-char truncation cap and 20-change cap", () => {
  const longText = "x".repeat(5000);
  const prevSections = [];
  const curSections = [];
  for (let i = 0; i < 25; i++) {
    prevSections.push({ id: `section-${i}`, heading: `H${i}`, text: `before-${i}` });
    curSections.push({ id: `section-${i}`, heading: `H${i}`, text: i === 0 ? longText : `after-${i}` });
  }
  const prev = snapshot(region([]), region(prevSections), region([]));
  const cur = snapshot(region([]), region(curSections), region([]));
  const result = diffSnapshots(prev, cur, scope);

  assert.equal(result.changes.length, 20); // capped at MAX_CHANGES
  const longOne = result.changes.find((c) => c.sectionId === "section-0");
  assert.ok(longOne);
  assert.ok((longOne!.after as string).length <= 2000);
  assert.ok((longOne!.after as string).includes("…"));
});

test("header/footer are only compared when included in scope", () => {
  const prev = snapshot(
    region([{ id: "section-0", heading: "", text: "old header" }]),
    region([{ id: "section-0", heading: "", text: "body" }]),
    region([{ id: "section-0", heading: "", text: "old footer" }]),
  );
  const cur = snapshot(
    region([{ id: "section-0", heading: "", text: "new header" }]),
    region([{ id: "section-0", heading: "", text: "body" }]),
    region([{ id: "section-0", heading: "", text: "new footer" }]),
  );
  const bodyOnly = diffSnapshots(prev, cur, { includeHeader: false, includeFooter: false });
  assert.equal(bodyOnly.changed, false);

  const withHeader = diffSnapshots(prev, cur, { includeHeader: true, includeFooter: false });
  assert.equal(withHeader.changed, true);
  assert.ok(withHeader.changes.every((c) => c.region !== "footer"));
});
