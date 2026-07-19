// Shared contract for the parser, persistence, and diff modules.
// Every other phase (agent pipeline, API routes, UI) imports these shapes —
// this file is the single source of truth for the data that flows through the system.

import { z } from "zod";

export type RegionName = "header" | "body" | "footer";

export interface Section {
  id: string;
  heading: string;
  text: string;
}

export interface Region {
  sections: Section[];
  /** Stable tag/class/layout signature (sha1 hex). Same markup shape -> same fingerprint. */
  structuralFingerprint: string;
}

/** The canonical unit stored and compared (PRD §3.2 output). */
export interface Snapshot {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  httpStatus: number;
  title: string;
  metaDescription: string;
  regions: {
    header: Region;
    body: Region;
    footer: Region;
  };
}

/** Metadata the scraper provides alongside raw HTML, fed into parse(). */
export interface ScrapeMeta {
  url: string;
  finalUrl: string;
  httpStatus: number;
  fetchedAt: string;
  title: string;
  metaDescription: string;
}

/** The agent's durable understanding of a page's purpose/content, persisted in page_memory. */
export type PageAnalysis = string;

export type ChangeKind = "content" | "functional";

/** One itemized sub-change within a section (e.g. a single list entry added/removed/updated). */
export interface ChangeItem {
  op: "added" | "removed" | "updated";
  text: string; // one-line description (markdown), grounded in the diff
}

/** One detected difference between two snapshots (PRD §4, Agent 1 output unit). */
export interface Change {
  region: RegionName;
  sectionId: string;
  kind: ChangeKind;
  before: string | null; // null for additions
  after: string | null; // null for removals
  items?: ChangeItem[]; // per-entry breakdown when the section is a list, for bullet display
}

export interface DiffScope {
  includeHeader: boolean;
  includeFooter: boolean;
}

export interface DiffResult {
  changed: boolean;
  changes: Change[];
}

export type RunStatus =
  | "running"
  | "baseline_captured"
  | "no_change"
  | "reported"
  | "error";

// --- Render spec (PRD §5) — the only thing the frontend consumes. ---

export type BlockType =
  | "content_change"
  | "functional_change"
  | "section_added"
  | "section_removed"
  | "metric_change"
  | "callout";

export interface RenderBlock {
  type: BlockType;
  region: RegionName;
  /** Human title for this change, decided by the agent (e.g. "CO₂ reading rose"). */
  title: string;
  section: string;
  before: string | null;
  after: string | null;
  changeType: string;
  significance: string;
  items?: ChangeItem[]; // one-line bullets of the individual entries that changed in this section
}

export interface RenderSpec {
  url: string;
  finalUrl: string;
  comparedAt: string;
  summary: string;
  blocks: RenderBlock[];
}

// --- Render spec schema (mirrors the RenderSpec/RenderBlock types above) — the strict
// shape the agent's final output is validated/repaired against before it ever reaches the UI.
// (This is the only boundary we actually validate at: the LLM's output. Snapshots/regions are
// produced by our own parser and read straight back, so they need no runtime schema.) ---

export const BlockTypeSchema = z.enum([
  "content_change",
  "functional_change",
  "section_added",
  "section_removed",
  "metric_change",
  "callout",
]);

export const RegionNameSchema = z.enum(["header", "body", "footer"]);

export const ChangeItemSchema = z.object({
  op: z.enum(["added", "removed", "updated"]),
  text: z.string(),
});

export const RenderBlockSchema = z.object({
  type: BlockTypeSchema,
  region: RegionNameSchema,
  title: z.string(),
  section: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  changeType: z.string(),
  significance: z.string(),
  items: z.array(ChangeItemSchema).optional(),
});

export const RenderSpecSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  comparedAt: z.string(),
  summary: z.string(),
  blocks: z.array(RenderBlockSchema),
});
