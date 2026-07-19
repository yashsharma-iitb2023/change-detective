// Deterministic per-section diff (PRD §4 Agent 1's evidence; TRD §4.2 caps).
// No LLM here — pure comparison, so this is what keeps GLM calls cheap: the agent only
// ever sees what this module says changed.

import { diffWords } from "diff";
import type { Change, ChangeItem, ChangeKind, DiffResult, DiffScope, Region, RegionName, Section, Snapshot } from "./types.ts";

const MAX_CHARS = 2000;
const MAX_CHANGES = 20;
const MAX_ITEMS = 15;
const ELLIPSIS = "…";

export function diffSnapshots(previous: Snapshot, current: Snapshot, scope: DiffScope): DiffResult {
  const regions: RegionName[] = ["body"];
  if (scope.includeHeader) regions.unshift("header");
  if (scope.includeFooter) regions.push("footer");

  const changes: Change[] = [];
  for (const region of regions) {
    diffRegion(region, previous.regions[region], current.regions[region], changes);
  }

  const capped = applyCaps(changes);
  return { changed: capped.length > 0, changes: capped };
}

function diffRegion(region: RegionName, prev: Region, cur: Region, out: Change[]): void {
  // Match sections by heading text, in document order; unmatched cur = added, unmatched prev = removed.
  const prevQueues = new Map<string, Section[]>();
  for (const s of prev.sections) {
    const q = prevQueues.get(s.heading);
    if (q) q.push(s);
    else prevQueues.set(s.heading, [s]);
  }

  for (const curSection of cur.sections) {
    const q = prevQueues.get(curSection.heading);
    const prevSection = q && q.length ? q.shift() : undefined;
    if (!prevSection) {
      out.push(makeChange(region, curSection.id, "content", null, curSection.text));
    } else if (textChanged(prevSection.text, curSection.text)) {
      out.push(makeChange(region, curSection.id, "content", prevSection.text, curSection.text, itemizeChange(prevSection.text, curSection.text)));
    }
  }

  for (const leftover of prevQueues.values()) {
    for (const s of leftover) {
      out.push(makeChange(region, s.id, "content", s.text, null));
    }
  }

  // Content identical but layout/markup shape moved -> functional, not content.
  if (prev.structuralFingerprint !== cur.structuralFingerprint) {
    out.push(
      makeChange(region, `${region}-structure`, "functional", prev.structuralFingerprint, cur.structuralFingerprint),
    );
  }
}

/** Word-level diff, used only to decide "did anything actually change" (whitespace-insensitive). */
function textChanged(a: string, b: string): boolean {
  if (a === b) return false;
  return diffWords(a, b).some((part) => part.added || part.removed);
}

function makeChange(region: RegionName, sectionId: string, kind: ChangeKind, before: string | null, after: string | null, items?: ChangeItem[]): Change {
  return { region, sectionId, kind, before, after, ...(items && items.length ? { items } : {}) };
}

// Break a changed repeated-item section (a list OR a card/feed grid) into per-entry
// adds/removes/updates so the UI shows one-line bullets instead of re-displaying the whole
// section. A section is treated as items in one of two GENERAL shapes — no site/page specifics:
//   1. a marker list (-, *, 1.)                — entry = each marker line + its continuation
//   2. a repeated-block feed (>=3 blank-line-separated blocks, e.g. cards) — entry = each block,
//      with a short heading-like "label" line merged into the block it precedes and used as the
//      block's stable identity (so a value edited inside a card reads as an update, not remove+add)
// Entries are keyed by link text / label / first line so reordering + renumbering aren't changes.
type Item = { id: string; text: string };
const ITEM_START = /^\s*(?:\d+[.)]|[-*+])\s+/;

/** Shape 1: entries introduced by a list marker; following lines belong to the entry above. */
function markerItems(md: string): Item[] {
  const items: Item[] = [];
  let cur: string[] | null = null;
  const flush = () => {
    if (!cur) return;
    const block = cur.join("\n").replace(ITEM_START, "").trim(); // drop the leading marker/number
    const link = block.match(/\[([^\]]+)\]/); // identity = first link text, else the first line
    const id = (link ? link[1] : block.split("\n")[0]).trim().toLowerCase();
    if (id) items.push({ id, text: block });
    cur = null;
  };
  for (const line of md.split("\n")) {
    if (ITEM_START.test(line)) {
      flush();
      cur = [line];
    } else if (cur) {
      cur.push(line);
    }
  }
  flush();
  return items;
}

/** A short single-line block with no sentence punctuation — a tag/label heading a following block. */
function isLabel(block: string): boolean {
  const t = block.trim();
  return t.length > 0 && t.length <= 40 && !t.includes("\n") && !/[.!?]/.test(t);
}

/** Shape 2: blank-line-separated blocks (cards / paragraphs), label merged into the next block. */
function blockItems(md: string): Item[] {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const items: Item[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isLabel(b) && i + 1 < blocks.length && !isLabel(blocks[i + 1])) {
      items.push({ id: b.toLowerCase(), text: `${b} — ${blocks[i + 1]}` }); // label owns the block
      i++;
    } else {
      const link = b.match(/\[([^\]]+)\]/);
      const id = (link ? link[1] : b.split("\n")[0]).trim().toLowerCase();
      items.push({ id, text: b });
    }
  }
  return items;
}

function oneLine(text: string): string {
  const first = text.replace(/\n+/g, " ").trim();
  return first.length > 140 ? `${first.slice(0, 139)}${ELLIPSIS}` : first;
}

/** Word-overlap ratio — used only in the block path to pair an added+removed entry as an "update"
 *  when the entry's own identity line changed (no reliable link/label to key on). */
function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.min(wa.size, wb.size) >= 0.7;
}

/** Diff two entry lists by identity; `fuzzy` also pairs leftover add/remove by similarity. */
function diffItems(b: Item[], a: Item[], fuzzy: boolean): ChangeItem[] | undefined {
  const bMap = new Map(b.map((x) => [x.id, x.text]));
  const aMap = new Map(a.map((x) => [x.id, x.text]));
  const items: ChangeItem[] = [];
  const addedText: string[] = [];
  for (const { id, text } of a) {
    if (!bMap.has(id)) addedText.push(text);
    else if (bMap.get(id) !== text) items.push({ op: "updated", text: oneLine(text) });
  }
  const removedText: string[] = [];
  for (const { id, text } of b) if (!aMap.has(id)) removedText.push(text);

  for (const add of addedText) {
    const j = fuzzy ? removedText.findIndex((r) => similar(r, add)) : -1;
    if (j >= 0) {
      removedText.splice(j, 1);
      items.push({ op: "updated", text: oneLine(add) });
    } else {
      items.push({ op: "added", text: oneLine(add) });
    }
  }
  for (const r of removedText) items.push({ op: "removed", text: oneLine(r) });
  return items.length ? items.slice(0, MAX_ITEMS) : undefined;
}

function itemizeChange(before: string, after: string): ChangeItem[] | undefined {
  const bMarker = markerItems(before);
  const aMarker = markerItems(after);
  if (bMarker.length >= 2 || aMarker.length >= 2) return diffItems(bMarker, aMarker, false); // stable ids

  const bBlock = blockItems(before);
  const aBlock = blockItems(after);
  if (bBlock.length >= 3 || aBlock.length >= 3) return diffItems(bBlock, aBlock, true); // fuzzy: fragile ids

  return undefined; // ordinary prose — leave it to the before/after view
}

function truncate(text: string | null): string | null {
  if (text === null || text.length <= MAX_CHARS) return text;
  const keep = MAX_CHARS - ELLIPSIS.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
}

function applyCaps(changes: Change[]): Change[] {
  return changes
    .slice(0, MAX_CHANGES)
    .map((c) => ({ ...c, before: truncate(c.before), after: truncate(c.after) }));
}
