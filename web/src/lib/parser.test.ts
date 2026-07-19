// Run: node --experimental-strip-types --test src/lib/parser.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "./parser.ts";

const meta = {
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  httpStatus: 200,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  title: "Example",
  metaDescription: "An example page.",
};

test("assigns regions via semantic tags (header/main/footer)", async () => {
  const html = `
    <html><body>
      <header class="site-header"><h1>Acme</h1><p>Welcome</p></header>
      <main>
        <h2>Pricing</h2><p>$10/mo</p>
        <h2>Support</h2><p>Email us</p>
      </main>
      <footer class="site-footer"><p>&copy; 2026 Acme</p></footer>
    </body></html>
  `;
  const snap = await parse(html, meta);

  assert.equal(snap.regions.header.sections.length, 1);
  assert.equal(snap.regions.header.sections[0].heading, "Acme");
  assert.equal(snap.regions.header.sections[0].text, "Welcome");

  assert.equal(snap.regions.body.sections.length, 2);
  assert.equal(snap.regions.body.sections[0].heading, "Pricing");
  assert.equal(snap.regions.body.sections[0].text, "$10/mo");
  assert.equal(snap.regions.body.sections[1].heading, "Support");

  assert.equal(snap.regions.footer.sections.length, 1);
  assert.match(snap.regions.footer.sections[0].text, /2026 Acme/);
});

test("falls back to role/class heuristics when no semantic tags exist", async () => {
  const html = `
    <html><body>
      <div role="banner"><h1>Fallback Co</h1></div>
      <div class="page-content">
        <h2>About</h2><p>We fall back gracefully.</p>
      </div>
      <div id="footer"><p>bottom text</p></div>
    </body></html>
  `;
  const snap = await parse(html, meta);

  assert.equal(snap.regions.header.sections[0].heading, "Fallback Co");
  assert.ok(snap.regions.body.sections.some((s) => s.heading === "About"));
  assert.match(snap.regions.footer.sections[0].text, /bottom text/);
});

test("strips script/style tags and any markup from text", async () => {
  const html = `
    <html><body>
      <main>
        <h2>Notice</h2>
        <p>Hello <b>world</b> <script>alert('xss')</script><style>.x{color:red}</style></p>
      </main>
    </body></html>
  `;
  const snap = await parse(html, meta);
  const text = snap.regions.body.sections[0].text;
  assert.match(text, /Hello/);
  assert.match(text, /world/);
  assert.doesNotMatch(text, /<|alert|script|style/);
});

test("preserves tables, lists, and links as Markdown", async () => {
  const html = `
    <html><body><main>
      <h2>Report</h2>
      <table><thead><tr><th>Item</th><th>Cost</th></tr></thead>
        <tbody><tr><td>Widget</td><td>$10</td></tr></tbody></table>
      <ul><li>First</li><li>Second</li></ul>
      <p>See <a href="https://example.org/docs">the docs</a>.</p>
    </main></body></html>
  `;
  const snap = await parse(html, meta);
  const md = snap.regions.body.sections.map((s) => s.text).join("\n");
  assert.match(md, /\| Item \| Cost \|/); // table header
  assert.match(md, /\| Widget \| \$10 \|/); // table row
  assert.match(md, /^-\s+First/m); // bullet list
  assert.match(md, /\[the docs\]\(https:\/\/example\.org\/docs\)/); // link
});

test("structural fingerprint is deterministic across identical renders", async () => {
  const html = `
    <html><body>
      <header class="hdr"><h1>Acme</h1></header>
      <main><h2>A</h2><p>one</p></main>
      <footer class="ftr"><p>c</p></footer>
    </body></html>
  `;
  const a = await parse(html, meta);
  const b = await parse(html, meta);
  assert.equal(a.regions.header.structuralFingerprint, b.regions.header.structuralFingerprint);
  assert.equal(a.regions.body.structuralFingerprint, b.regions.body.structuralFingerprint);
  assert.equal(a.regions.footer.structuralFingerprint, b.regions.footer.structuralFingerprint);

  // Same text, different markup shape -> different fingerprint.
  const htmlDiffStructure = `
    <html><body>
      <header class="hdr"><h1>Acme</h1></header>
      <main><h2>A</h2><div><p>one</p></div></main>
      <footer class="ftr"><p>c</p></footer>
    </body></html>
  `;
  const c = await parse(htmlDiffStructure, meta);
  assert.notEqual(a.regions.body.structuralFingerprint, c.regions.body.structuralFingerprint);
  assert.equal(a.regions.body.sections[0].text, c.regions.body.sections[0].text); // content unchanged
});
