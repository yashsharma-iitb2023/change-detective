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

// Break a changed list-like section into per-entry adds/removes/updates so the UI can show one-line
// bullets instead of one wall-of-text before/after. Grounded: entries come straight from the diff,
// keyed by their link/first-line text so reordering + renumbering don't create false changes.
const ITEM_START = /^\s*(?:\d+[.)]|[-*+])\s+/;

function parseItems(md: string): Map<string, string> {
  const items = new Map<string, string>();
  let cur: string[] | null = null;
  const flush = () => {
    if (!cur) return;
    const block = cur.join("\n").replace(ITEM_START, "").trim(); // drop the leading marker/number
    const link = block.match(/\[([^\]]+)\]/); // identity = first link text, else the first line
    const id = (link ? link[1] : block.split("\n")[0]).trim().toLowerCase();
    if (id) items.set(id, block);
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

function oneLine(text: string): string {
  const first = text.split("\n")[0].trim();
  return first.length > 140 ? `${first.slice(0, 139)}${ELLIPSIS}` : first;
}

function itemizeChange(before: string, after: string): ChangeItem[] | undefined {
  const b = parseItems(before);
  const a = parseItems(after);
  if (b.size < 2 && a.size < 2) return undefined; // not a list — leave the block to show before/after
  const items: ChangeItem[] = [];
  for (const [id, text] of a) {
    if (!b.has(id)) items.push({ op: "added", text: oneLine(text) });
    else if (b.get(id) !== text) items.push({ op: "updated", text: oneLine(text) });
  }
  for (const [id, text] of b) {
    if (!a.has(id)) items.push({ op: "removed", text: oneLine(text) });
  }
  return items.length ? items.slice(0, MAX_ITEMS) : undefined;
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
