// SQLite persistence (better-sqlite3, no ORM). Schema matches TRD §3 exactly.
// The first-seen/seen-before decision lives in the agent now (it decides baseline-vs-compare
// from getLatestSnapshot's result); this file is pure storage accessors.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { PageAnalysis, RenderSpec, RunStatus, Snapshot } from "./types.ts";

const DEFAULT_DB_PATH = "./data/app.sqlite";

/** Idempotent schema setup — safe to call on every startup. */
export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      final_url TEXT,
      http_status INTEGER,
      fetched_at TEXT NOT NULL,
      meta_description TEXT,
      regions_json TEXT NOT NULL,          -- { header, body, footer } parsed snapshot
      UNIQUE(url, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_url ON snapshots(url, fetched_at DESC);

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      started_at TEXT NOT NULL,
      status TEXT NOT NULL                  -- running | baseline_captured | no_change | reported | error
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      render_spec_json TEXT NOT NULL
    );

    -- The agent's durable per-URL understanding (PageAnalysis): what the page is, updated
    -- across runs so a return visit can reason "in the context of the past analysis" (see agent.ts).
    CREATE TABLE IF NOT EXISTS page_memory (
      url TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      analysis TEXT NOT NULL
    );
  `);
  // ponytail: dev-only DB, reset often — rather than a migration system, just try to add the
  // column and swallow the error if an older snapshots table already has it.
  try {
    db.exec(`ALTER TABLE snapshots ADD COLUMN meta_description TEXT`);
  } catch {
    /* column already exists */
  }
}

/** Open (and migrate) a database file. Pass ':memory:' or a temp path for tests. */
export function openDb(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    const dir = path.dirname(filePath);
    if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

let singleton: Database.Database | null = null;

/** The process-wide DB, keyed off DATABASE_PATH (env). Lazily opened on first use. */
export function getDb(): Database.Database {
  if (!singleton) singleton = openDb(process.env.DATABASE_PATH || DEFAULT_DB_PATH);
  return singleton;
}

interface SnapshotRow {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  fetchedAt: string;
  metaDescription: string | null;
  regionsJson: string;
}

export function saveSnapshot(snapshot: Snapshot, db: Database.Database = getDb()): void {
  db.prepare(
    `INSERT INTO snapshots (url, final_url, http_status, fetched_at, meta_description, regions_json)
     VALUES (@url, @finalUrl, @httpStatus, @fetchedAt, @metaDescription, @regionsJson)
     ON CONFLICT(url, fetched_at) DO UPDATE SET
       final_url = excluded.final_url,
       http_status = excluded.http_status,
       meta_description = excluded.meta_description,
       regions_json = excluded.regions_json`,
  ).run({
    url: snapshot.url,
    finalUrl: snapshot.finalUrl,
    httpStatus: snapshot.httpStatus,
    fetchedAt: snapshot.fetchedAt,
    metaDescription: snapshot.metaDescription,
    regionsJson: JSON.stringify(snapshot.regions),
  });
}

export function getLatestSnapshot(url: string, db: Database.Database = getDb()): Snapshot | null {
  const row = db
    .prepare(
      `SELECT url, final_url as finalUrl, http_status as httpStatus, fetched_at as fetchedAt,
              meta_description as metaDescription, regions_json as regionsJson
       FROM snapshots WHERE url = ? ORDER BY fetched_at DESC LIMIT 1`,
    )
    .get(url) as SnapshotRow | undefined;
  if (!row) return null;
  return {
    url: row.url,
    finalUrl: row.finalUrl ?? "",
    httpStatus: row.httpStatus ?? 0,
    fetchedAt: row.fetchedAt,
    // ponytail: title isn't in the snapshots DDL (TRD §3); not needed by the diff,
    // only by the report. Callers that need it can carry it separately.
    title: "",
    metaDescription: row.metaDescription ?? "",
    regions: JSON.parse(row.regionsJson),
  };
}

/** The agent's saved understanding of a page (see agent.ts's save_analysis tool), or null if none yet. */
export function getPageMemory(url: string, db: Database.Database = getDb()): PageAnalysis | null {
  const row = db.prepare(`SELECT analysis FROM page_memory WHERE url = ?`).get(url) as
    | { analysis: string }
    | undefined;
  return row?.analysis ?? null;
}

export function savePageMemory(url: string, analysis: PageAnalysis, db: Database.Database = getDb()): void {
  db.prepare(
    `INSERT INTO page_memory (url, updated_at, analysis) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET updated_at = excluded.updated_at, analysis = excluded.analysis`,
  ).run(url, new Date().toISOString(), analysis);
}

export function createRun(url: string, db: Database.Database = getDb()): number {
  const info = db
    .prepare(`INSERT INTO runs (url, started_at, status) VALUES (?, ?, ?)`)
    .run(url, new Date().toISOString(), "running" satisfies RunStatus);
  return info.lastInsertRowid as number;
}

export function updateRunStatus(runId: number, status: RunStatus, db: Database.Database = getDb()): void {
  db.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(status, runId);
}

export function saveReport(
  runId: number,
  url: string,
  renderSpec: RenderSpec,
  db: Database.Database = getDb(),
): number {
  const info = db
    .prepare(`INSERT INTO reports (run_id, url, created_at, render_spec_json) VALUES (?, ?, ?, ?)`)
    .run(runId, url, new Date().toISOString(), JSON.stringify(renderSpec));
  return info.lastInsertRowid as number;
}

/** Distinct URLs already seen (have a stored snapshot), most-recently-run first. */
export function getKnownUrls(db: Database.Database = getDb()): string[] {
  const rows = db
    .prepare(`SELECT url, MAX(fetched_at) AS last FROM snapshots GROUP BY url ORDER BY last DESC`)
    .all() as { url: string }[];
  return rows.map((r) => r.url);
}

export function getLatestReport(url: string, db: Database.Database = getDb()): RenderSpec | null {
  const row = db
    .prepare(`SELECT render_spec_json as json FROM reports WHERE url = ? ORDER BY created_at DESC LIMIT 1`)
    .get(url) as { json: string } | undefined;
  return row ? JSON.parse(row.json) : null;
}
