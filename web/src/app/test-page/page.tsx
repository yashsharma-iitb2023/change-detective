// A self-contained sample LANDING PAGE to point the agent at (http://localhost:5050/test-page).
//
// HOW TO TEST A CHANGE:
//   1. Run the agent on http://localhost:5050/test-page once (captures a baseline).
//   2. Edit something meaningful below — bump a headline stat (e.g. CO₂ 421.6 -> 429.4),
//      add/remove a card in "Latest findings", or edit the mission status — and save.
//   3. Run the agent again. It should surface the change and reason about why it matters.
//
// Real content (headline metrics, a list of findings, imagery, sections) so the parser, diff,
// itemized bullets, and metric-significance all have something to work with.
//
// Images are self-hosted under /public/test-media (originally from Unsplash), so the app's strict
// CSP (img-src 'self') serves them. Each still has a gradient fallback behind it.

export const metadata = {
  title: "Aether Station — Earth Systems Observatory",
  description: "Live climate indicators and research findings from the Aether atmospheric observatory.",
};

const HERO_IMG = "/test-media/hero.jpg";
const MISSION_IMG = "/test-media/mission.jpg";

const FINDINGS = [
  {
    img: "/test-media/finding1.jpg",
    fallback: "linear-gradient(135deg,#1e3a8a,#0ea5e9)",
    tag: "Astronomy",
    text: "JWST detects a tentative dimethyl sulfide signature — a possible biosignature — in the atmosphere of exoplanet K2-18 b, sharpening the search for life on hycean worlds.",
  },
  {
    img: "/test-media/finding2.jpg",
    fallback: "linear-gradient(135deg,#0891b2,#a5f3fc)",
    tag: "Cryosphere",
    text: "Retreat of the Antarctic Thwaites Glacier accelerated by 12% over the past decade, revising sea-level projections upward.",
  },
  {
    img: "/test-media/finding3.jpg",
    fallback: "linear-gradient(135deg,#0d9488,#5eead4)",
    tag: "Oceans",
    text: "A new coral-reef restoration technique showed a 3× survival rate in Pacific field trials versus the standard method.",
  },
  {
    img: "/test-media/finding4.jpg",
    fallback: "linear-gradient(135deg,#4338ca,#818cf8)",
    tag: "Atmosphere",
    text: "Atmospheric methane concentration crossed 1,930 ppb for the first time on record.",
  },
];

const STATS = [
  { label: "Atmospheric CO₂", value: "434.5 ppm", delta: "+4.7 ppm / yr", up: true },
  { label: "Global temp anomaly", value: "+1.53 °C", delta: "+0.10 °C / yr", up: true },
  { label: "Arctic sea-ice minimum", value: "3.69 M km²", delta: "−0.45 M km² / yr", up: false },
  { label: "Global mean sea level", value: "+107.8 mm", delta: "+4.3 mm / yr", up: true },
];

const STYLE = `
  .site { color:#12151b; background:#ffffff; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .site * { box-sizing:border-box; }
  .site a { color:inherit; text-decoration:none; }
  .wrap { max-width:1100px; margin:0 auto; padding:0 24px; }

  .nav { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:space-between;
         padding:16px 24px; background:rgba(255,255,255,0.85); backdrop-filter:saturate(180%) blur(12px);
         border-bottom:1px solid #eef0f4; }
  .nav .brand { font-weight:700; letter-spacing:-0.01em; display:flex; align-items:center; gap:10px; }
  .nav .brand .dot { width:22px; height:22px; border-radius:50%; background:radial-gradient(circle at 30% 30%,#38bdf8,#1d4ed8); }
  .nav .links a { margin-left:22px; font-size:14px; color:#4b5563; }
  .nav .links a:hover { color:#12151b; }

  .hero { position:relative; color:#fff; background:#0b1120 center/cover no-repeat; }
  .hero .overlay { background:linear-gradient(180deg,rgba(6,12,26,0.55),rgba(6,12,26,0.78)); }
  .hero .inner { padding:96px 0 104px; max-width:680px; }
  .hero .eyebrow { text-transform:uppercase; letter-spacing:0.14em; font-size:12px; color:#93c5fd; margin:0 0 14px; }
  .hero h1 { font-size:46px; line-height:1.08; letter-spacing:-0.02em; margin:0 0 18px; }
  .hero p { font-size:19px; color:#dbe4f3; margin:0 0 28px; }
  .hero .cta { display:inline-block; background:#2563eb; color:#fff; padding:12px 22px; border-radius:10px; font-weight:600; }

  section.block { padding:64px 0; border-bottom:1px solid #f0f2f6; }
  .kicker { text-transform:uppercase; letter-spacing:0.12em; font-size:12px; color:#2563eb; font-weight:600; margin:0 0 8px; }
  h2 { font-size:30px; letter-spacing:-0.02em; margin:0 0 10px; }
  .lead { color:#586172; max-width:640px; margin:0 0 32px; }

  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
  .stat { border:1px solid #e9ecf2; border-radius:14px; padding:20px; background:#fbfcfe; }
  .stat .label { font-size:13px; color:#6b7280; margin:0 0 10px; }
  .stat .value { font-size:30px; font-weight:700; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .stat .delta { font-size:13px; font-weight:600; margin-top:8px; }
  .stat .delta.up { color:#b91c1c; } .stat .delta.down { color:#047857; }

  .cards { display:grid; grid-template-columns:repeat(2,1fr); gap:22px; }
  .card { border:1px solid #e9ecf2; border-radius:16px; overflow:hidden; background:#fff; }
  .card .thumb { height:172px; background-size:cover; background-position:center; }
  .card .body { padding:18px 20px 22px; }
  .card .tag { display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
               color:#2563eb; background:#eff6ff; padding:4px 10px; border-radius:999px; margin:0 0 10px; }
  .card p { margin:0; color:#333a46; }

  .mission { display:grid; grid-template-columns:1.1fr 1fr; gap:40px; align-items:center; }
  .mission .photo { min-height:280px; border-radius:16px; background-size:cover; background-position:center;
                    background-color:#0f172a; }
  .badge { display:inline-block; background:#dcfce7; color:#166534; font-weight:600; font-size:13px;
           padding:4px 12px; border-radius:999px; }

  footer.site-footer { background:#0b1120; color:#9aa6bd; padding:48px 0; }
  footer.site-footer .cols { display:grid; grid-template-columns:2fr 1fr 1fr; gap:32px; }
  footer.site-footer h4 { color:#fff; font-size:14px; margin:0 0 12px; }
  footer.site-footer a { display:block; color:#9aa6bd; font-size:14px; margin:6px 0; }
  footer.site-footer .fine { margin-top:28px; padding-top:20px; border-top:1px solid #1e293b; font-size:12px; }

  @media (max-width:820px){
    .stats{ grid-template-columns:repeat(2,1fr); }
    .cards{ grid-template-columns:1fr; }
    .mission{ grid-template-columns:1fr; }
    .hero h1{ font-size:34px; }
    footer.site-footer .cols{ grid-template-columns:1fr; }
  }
`;

export default function TestPage() {
  return (
    <div className="site">
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />

      <header className="nav">
        <a className="brand" href="/test-page">
          <span className="dot" /> Aether Station
        </a>
        <nav className="links">
          <a href="/test-page">Indicators</a>
          <a href="/test-page">Findings</a>
          <a href="/test-page">Mission</a>
          <a href="/test-page">About</a>
        </nav>
      </header>

      <div className="hero" style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className="overlay">
          <div className="wrap">
            <div className="inner">
              <p className="eyebrow">Earth Systems Observatory</p>
              <h1>Watching the planet's vital signs, in near real time.</h1>
              <p>
                Aether Station tracks the climate indicators and research that shape our understanding
                of a changing Earth — updated every monitoring cycle.
              </p>
              <a className="cta" href="/test-page">
                Explore the latest readings →
              </a>
            </div>
          </div>
        </div>
      </div>

      <main>
        <section className="block">
          <div className="wrap">
            <p className="kicker">Key climate indicators</p>
            <h2>This cycle's headline readings</h2>
            <p className="lead">
              Averaged over the most recent monitoring cycle, shown against the prior 12 months.
            </p>
            <div className="stats">
              {STATS.map((s) => (
                <div className="stat" key={s.label}>
                  <p className="label">{s.label}</p>
                  <div className="value">{s.value}</div>
                  <div className={`delta ${s.up ? "up" : "down"}`}>{s.delta}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <p className="kicker">Latest findings</p>
            <h2>Fresh from the field</h2>
            <p className="lead">Notable research and observations reported this cycle.</p>
            <div className="cards">
              {FINDINGS.map((f) => (
                <article className="card" key={f.text}>
                  <div
                    className="thumb"
                    style={{ background: `${f.fallback}`, backgroundImage: `url(${f.img})` }}
                  />
                  <div className="body">
                    <span className="tag">{f.tag}</span>
                    <p>{f.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="block">
          <div className="wrap mission">
            <div>
              <p className="kicker">Mission status</p>
              <h2>Aether-2 stratospheric campaign</h2>
              <p className="lead">
                The Aether-2 stratospheric balloon campaign is <strong>on schedule</strong>, with the
                next launch window opening in the coming weeks. All five ground stations are reporting
                nominal telemetry.
              </p>
              <span className="badge">● On schedule</span>
            </div>
            <div className="photo" style={{ backgroundImage: `url(${MISSION_IMG})` }} />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <div className="cols">
            <div>
              <h4>Aether Station</h4>
              <p style={{ margin: 0, maxWidth: 320 }}>
                An educational sample page. Data shown is illustrative and not sourced from live
                instruments.
              </p>
            </div>
            <div>
              <h4>Data</h4>
              <a href="/test-page">Indicators</a>
              <a href="/test-page">Methodology</a>
              <a href="/test-page">Downloads</a>
            </div>
            <div>
              <h4>Station</h4>
              <a href="/test-page">Mission</a>
              <a href="/test-page">Team</a>
              <a href="/test-page">Contact</a>
            </div>
          </div>
          <div className="fine">© 2026 Aether Station · Educational demo · All figures illustrative.</div>
        </div>
      </footer>
    </div>
  );
}
