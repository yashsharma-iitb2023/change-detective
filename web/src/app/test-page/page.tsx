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
// Styling lives in a real external stylesheet (aether.css), namespaced under `.site` so it can't
// leak into the rest of the app. Class names on the elements are kept STABLE and semantic on
// purpose — this page is scraped and diffed, and stable class names stop a formatting change from
// being mis-read as a content change. Images are self-hosted under /public/test-media (originally
// from Unsplash), so the app's strict CSP (img-src 'self') serves them; each has a gradient fallback.

import "./aether.css";

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
    text: "Atmospheric methane concentration crossed 1,945 ppb for the first time on record, with the steepest annual jump measured since monitoring began.",
  },
];

const STATS = [
  { label: "Atmospheric CO₂", value: "431.8 ppm", delta: "+5.1 ppm / yr", up: true },
  { label: "Global temp anomaly", value: "+1.68 °C", delta: "+0.15 °C / yr", up: true },
  { label: "Arctic sea-ice minimum", value: "3.28 M km²", delta: "−0.58 M km² / yr", up: false },
  { label: "Global mean sea level", value: "+112.5 mm", delta: "+4.7 mm / yr", up: true },
];

export default function TestPage() {
  return (
    <div className="site">
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
                The Aether-2 stratospheric balloon campaign is <strong>delayed</strong>: the next
                launch window has slipped by six weeks after a telemetry fault at two of the five
                ground stations. Repairs are underway.
              </p>
              <span className="badge">● Delayed</span>
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
