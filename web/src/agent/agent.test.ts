// Run: node --experimental-strip-types --test src/agent/agent.test.ts
// Uses the AI SDK mock language model (ai/test) to script TOOL CALLS, so this needs no API
// key and makes no network call — the model's decisions (which tool, in what order) are
// scripted per test, exactly like a real small model driving the loop.
//
// agent.ts's save_analysis/assess tools read/write lib/db's process-wide DB via
// getDb() — point that at :memory: before anything opens it, so tests never touch the real
// dev database file.
process.env.DATABASE_PATH = ":memory:";

import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4, mockValues } from "ai/test";
import type { LanguageModel } from "ai";
import { runAgent, type PipelineEvent } from "./agent.ts";
import type { Region, Snapshot } from "../lib/types.ts";

const scope = { includeHeader: false, includeFooter: false };

function region(sections: { id: string; heading: string; text: string }[], fp = "fp1"): Region {
  return { sections, structuralFingerprint: fp };
}

function snapshot(body: Region, overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    httpStatus: 200,
    title: "Example Site",
    metaDescription: "An example site for testing.",
    regions: { header: region([]), body, footer: region([]) },
    ...overrides,
  };
}

/** One model turn that calls a single tool. */
function toolCall(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 10, text: 10, reasoning: undefined },
    },
    warnings: [],
  };
}

test("first visit -> baseline captured, analysis saved, empty blocks", async () => {
  const cur = snapshot(region([{ id: "section-0", heading: "About", text: "We do things." }]));

  const mock = new MockLanguageModelV4({
    doGenerate: mockValues(
      toolCall("assess", {}),
      toolCall("save_analysis", { analysis: "A site about doing things." }),
      toolCall("deliver_report", { summary: "A site about doing things.", blocks: [] }),
    ),
  });

  const events: PipelineEvent[] = [];
  const result = await runAgent(
    { url: cur.url, previousSnapshot: null, currentSnapshot: cur, scope },
    (e) => events.push(e),
    mock as unknown as LanguageModel,
  );

  assert.equal(result.status, "baseline_captured");
  assert.equal(result.renderSpec.blocks.length, 0);
  assert.equal(result.renderSpec.summary, "A site about doing things.");
  assert.equal(result.analysis, "A site about doing things.");
  assert.ok(events.some((e) => e.kind === "trail" && e.step === "assess"));
  assert.ok(events.some((e) => e.kind === "trail" && e.step === "deliver_report"));
});

test("return visit with a real diff -> reported, facts come from the diff not the model", async () => {
  const prev = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $10." }], "fp-old"));
  const cur = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $12." }], "fp-new"));

  const mock = new MockLanguageModelV4({
    doGenerate: mockValues(
      toolCall("assess", {}),
      toolCall("deliver_report", {
        summary: "The price increased.",
        blocks: [
          { changeIndex: 0, type: "metric_change", significance: "A price increase may affect conversion." },
          { changeIndex: 1, type: "functional_change", significance: "Visual only, low risk." },
        ],
      }),
    ),
  });

  const events: PipelineEvent[] = [];
  const result = await runAgent(
    { url: cur.url, previousSnapshot: prev, currentSnapshot: cur, scope },
    (e) => events.push(e),
    mock as unknown as LanguageModel,
  );

  assert.equal(result.status, "reported");
  assert.equal(result.renderSpec.blocks.length, 2);

  const priceBlock = result.renderSpec.blocks.find((b) => b.section === "section-0")!;
  assert.equal(priceBlock.type, "metric_change");
  assert.equal(priceBlock.before, "Our price is $10."); // from the diff, not the model
  assert.equal(priceBlock.after, "Our price is $12.");

  const functionalBlock = result.renderSpec.blocks.find((b) => b.section === "body-structure")!;
  assert.equal(functionalBlock.before, null);
  assert.equal(functionalBlock.after, null);

  // The raw sha1-style fingerprint hashes must never leak into the final spec.
  const serialized = JSON.stringify(result.renderSpec);
  assert.ok(!serialized.includes("fp-old"));
  assert.ok(!serialized.includes("fp-new"));
});

test("return visit with no diff -> deterministic no-change summary, even if the model writes a page description", async () => {
  const body = region([{ id: "section-0", heading: "Intro", text: "Nothing has changed here." }], "fp1");
  const prev = snapshot(body);
  const cur = snapshot(body); // identical -> zero changes

  const mock = new MockLanguageModelV4({
    doGenerate: mockValues(
      toolCall("assess", {}),
      // Weak model wrongly re-runs the baseline flow and writes a page description on a no-change visit.
      toolCall("deliver_report", { summary: "Initial analysis: a test page with example sections.", blocks: [] }),
    ),
  });

  const result = await runAgent(
    { url: cur.url, previousSnapshot: prev, currentSnapshot: cur, scope },
    () => {},
    mock as unknown as LanguageModel,
  );

  assert.equal(result.status, "no_change");
  // Nothing to interpret -> deterministic; the model's page-description summary is discarded.
  assert.equal(result.renderSpec.summary, "No meaningful change since the last visit.");
  assert.equal(result.renderSpec.blocks.length, 0);
});

test("changes found but none surfaced -> trail states the agent judged them insignificant", async () => {
  const prev = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $10." }], "fp1"));
  const cur = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $12." }], "fp1"));

  const mock = new MockLanguageModelV4({
    doGenerate: mockValues(
      toolCall("assess", {}),
      toolCall("deliver_report", { summary: "A minor edit; nothing important changed.", blocks: [] }),
    ),
  });

  const events: PipelineEvent[] = [];
  await runAgent(
    { url: cur.url, previousSnapshot: prev, currentSnapshot: cur, scope },
    (e) => events.push(e),
    mock as unknown as LanguageModel,
  );

  const deliver = events.find((e) => e.kind === "trail" && e.step === "deliver_report");
  assert.ok(deliver && /judged none significant/i.test(deliver.reasoning));
});

test("duplicate blocks for the same change collapse to one (no repeated before/after)", async () => {
  const prev = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $10." }], "fp1"));
  const cur = snapshot(region([{ id: "section-0", heading: "Intro", text: "Our price is $12." }], "fp1"));

  const mock = new MockLanguageModelV4({
    doGenerate: mockValues(
      toolCall("assess", {}),
      toolCall("deliver_report", {
        summary: "The price increased.",
        blocks: [
          { changeIndex: 0, type: "metric_change", significance: "A price increase may affect conversion." },
          { changeIndex: 0, type: "content_change", significance: "Same change, restated differently." },
        ],
      }),
    ),
  });

  const result = await runAgent(
    { url: cur.url, previousSnapshot: prev, currentSnapshot: cur, scope },
    () => {},
    mock as unknown as LanguageModel,
  );

  assert.equal(result.renderSpec.blocks.length, 1); // one real change -> one block
  assert.equal(result.renderSpec.blocks[0].before, "Our price is $10.");
  assert.equal(result.renderSpec.blocks[0].after, "Our price is $12.");
});

test("model throws -> falls back to a deterministic report, never throws, emits a degraded trail", async () => {
  const prev = snapshot(region([{ id: "section-0", heading: "Intro", text: "a" }]));
  const cur = snapshot(region([{ id: "section-0", heading: "Intro", text: "b" }]));

  const mock = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("the model provider is unavailable");
    },
  });

  const events: PipelineEvent[] = [];
  const result = await runAgent(
    { url: cur.url, previousSnapshot: prev, currentSnapshot: cur, scope },
    (e) => events.push(e),
    mock as unknown as LanguageModel,
  );

  assert.equal(result.status, "reported");
  assert.equal(result.renderSpec.blocks.length, 1);
  assert.equal(result.renderSpec.blocks[0].section, "section-0");
  assert.equal(result.renderSpec.blocks[0].before, "a");
  assert.equal(result.renderSpec.blocks[0].after, "b");
  assert.ok(events.some((e) => e.kind === "trail" && /degraded/i.test(e.action)));
});

test("model never calls deliver_report -> falls back once the step budget is spent", async () => {
  const cur = snapshot(region([{ id: "section-0", heading: "About", text: "We do things." }]));

  const mock = new MockLanguageModelV4({
    // Always calls assess again — never delivers. The loop must still terminate
    // (stepCountIs) and degrade rather than hang or throw.
    doGenerate: async () => toolCall("assess", {}),
  });

  const events: PipelineEvent[] = [];
  const result = await runAgent(
    { url: cur.url, previousSnapshot: null, currentSnapshot: cur, scope },
    (e) => events.push(e),
    mock as unknown as LanguageModel,
  );

  assert.equal(result.status, "baseline_captured");
  assert.equal(result.renderSpec.blocks.length, 0);
  assert.equal(result.renderSpec.summary, "An example site for testing."); // from metaDescription
  assert.ok(events.some((e) => e.kind === "trail" && /degraded/i.test(e.action)));
});
