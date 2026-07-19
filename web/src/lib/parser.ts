// Scraped HTML -> canonical Snapshot (PRD §3.2).
//
// body is extracted with Defuddle (robust main-content extraction: strips nav/header/footer/
// sidebars by content heuristics, not tag/class matching), with a structural fallback for
// non-article pages. header/footer are detected separately for the include/exclude toggles.
//
// Each region's content is converted to **Markdown** (Turndown + GFM), so tables, lists,
// bullets, links, headings, bold/italic etc. are preserved instead of being flattened into a
// run-on string. The Markdown is later rendered in the UI. We never keep raw HTML, so no
// markup (or script/style) reaches storage or the LLM.

import * as cheerio from "cheerio";
import { Defuddle } from "defuddle/node";
import type { AnyNode } from "domhandler";
import { createHash } from "node:crypto";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { Region, ScrapeMeta, Section, Snapshot } from "./types.ts";

type CheerioAPI = ReturnType<typeof cheerio.load>;
type Selection = ReturnType<CheerioAPI>;

const HEADER_RE = /(?:^|[\s_-]|(?<=[a-z]))(?:header|masthead|topbar|navbar|banner)/i;
const FOOTER_RE = /(?:^|[\s_-]|(?<=[a-z]))(?:footer|colophon)/i;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

// Below this much text, treat Defuddle's extraction as a miss and fall back to structural parsing.
const MIN_BODY_CHARS = 200;

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.use(gfm); // tables, strikethrough, task lists
turndown.remove(["script", "style", "noscript", "template"]);

function htmlToMarkdown(html: string): string {
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a Markdown document into sections at ATX headings; content (tables/lists/…) is preserved. */
function toSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let buf: string[] = [];
  let index = 0;

  const flush = () => {
    const text = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text || heading) sections.push({ id: `section-${index++}`, heading, text });
  };

  for (const line of markdown.split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) {
      flush();
      heading = m[2].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export async function parse(html: string, meta: ScrapeMeta): Promise<Snapshot> {
  const $ = cheerio.load(html);
  $("script, style, noscript, template").remove();

  const headerEl = findRegionElement($, "header", "banner", HEADER_RE);
  const footerEl = findRegionElement($, "footer", "contentinfo", FOOTER_RE);

  const header = regionFromElement($, headerEl);
  const footer = regionFromElement($, footerEl);
  const body = await extractBody(html, $, headerEl, footerEl, meta.finalUrl);

  return {
    url: meta.url,
    finalUrl: meta.finalUrl,
    fetchedAt: meta.fetchedAt,
    httpStatus: meta.httpStatus,
    title: meta.title,
    metaDescription: meta.metaDescription,
    regions: { header, body, footer },
  };
}

/** Convert a detected region element to Markdown sections + a structural fingerprint. */
function regionFromElement($: CheerioAPI, el: Selection | null): Region {
  if (!el || !el.length) {
    return { sections: [], structuralFingerprint: fingerprint(null) };
  }
  const markdown = htmlToMarkdown($.html(el));
  return { sections: toSections(markdown), structuralFingerprint: fingerprint(el.get(0) ?? null) };
}

/**
 * Robust main-content extraction. Defuddle's native Markdown mode is used because it converts
 * complex real-world tables (spanning headers, links in cells) that Turndown's GFM plugin drops.
 * Falls back to structural parsing (Turndown) when Defuddle returns too little.
 */
async function extractBody(
  html: string,
  $: CheerioAPI,
  headerEl: Selection | null,
  footerEl: Selection | null,
  url: string,
): Promise<Region> {
  try {
    const result = await Defuddle(html, url, { markdown: true });
    const md = typeof result?.content === "string" ? result.content : "";
    if (md) {
      const sections = toSections(md);
      const textLen = sections.reduce((n, s) => n + s.heading.length + s.text.length, 0);
      if (textLen >= MIN_BODY_CHARS) {
        return { sections, structuralFingerprint: mdSignature(md) };
      }
    }
  } catch {
    // Defuddle can throw on unusual documents — fall through to structural parsing.
  }

  const mainEl = $("main").first();
  if (mainEl.length) return regionFromElement($, mainEl);
  headerEl?.remove();
  footerEl?.remove();
  const bodyRoot = $("body").length ? $("body") : $.root();
  return regionFromElement($, bodyRoot);
}

/**
 * Structural fingerprint of a Markdown document: the sequence of block *types* (heading, table
 * row, list item, quote, code, paragraph) with the text stripped. Detects layout/structure
 * changes independent of the words, so the diff can tell functional changes from content ones.
 */
function mdSignature(md: string): string {
  const shape = md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (/^#{1,6}\s/.test(t)) return "H";
      if (t.startsWith("|")) return "T";
      if (/^[-*+]\s/.test(t)) return "L";
      if (/^\d+\.\s/.test(t)) return "O";
      if (t.startsWith(">")) return "Q";
      if (t.startsWith("```")) return "C";
      return "P";
    })
    .join("");
  return createHash("sha1").update(shape).digest("hex");
}

function findRegionElement(
  $: CheerioAPI,
  tag: string,
  role: string,
  re: RegExp,
): Selection | null {
  const semantic = $(tag).first();
  if (semantic.length) return semantic;

  const byRole = $(`[role="${role}"]`).first();
  if (byRole.length) return byRole;

  // Keyword in class/id. Pick the OUTERMOST match (shallowest depth) so we get the region
  // wrapper, not an inner element that merely mentions the keyword.
  let best: AnyNode | null = null;
  let bestDepth = Infinity;
  $("[class], [id]").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs ?? {};
    const hay = `${attribs.class ?? ""} ${attribs.id ?? ""}`;
    if (!re.test(hay)) return;
    const depth = ancestorCount(el);
    if (depth < bestDepth) {
      bestDepth = depth;
      best = el;
    }
  });
  return best ? $(best) : null;
}

function ancestorCount(el: AnyNode): number {
  let n = 0;
  let p = (el as { parent?: AnyNode | null }).parent;
  while (p) {
    n++;
    p = (p as { parent?: AnyNode | null }).parent;
  }
  return n;
}

/** Deterministic tag/class layout signature, hashed for compact storage. Ignores text/ids. */
function fingerprint(el: AnyNode | null): string {
  return createHash("sha1").update(signature(el)).digest("hex");
}

function signature(el: AnyNode | null): string {
  if (!el || el.type !== "tag") return "";
  const classAttr = (el as unknown as { attribs?: Record<string, string> }).attribs?.class ?? "";
  const classes = classAttr.split(/\s+/).filter(Boolean).sort().join(".");
  const children = (el.children ?? [])
    .map((c) => signature(c as AnyNode))
    .filter(Boolean)
    .join(",");
  const tag = (el as { tagName?: string }).tagName ?? el.type;
  return `${tag}${classes ? `.${classes}` : ""}${children ? `(${children})` : ""}`;
}
