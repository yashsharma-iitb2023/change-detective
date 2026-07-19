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
// Styling lives in a real external stylesheet (aether.module.css), scoped by Next so its
// generic selectors don't leak into the rest of the app. Images are self-hosted under
// /public/test-media (originally from Unsplash), so the app's strict CSP (img-src 'self')
// serves them. Each still has a gradient fallback behind it.

import styles from "./aether.module.css";

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

export default function TestPage() {
  return (
    <div className={styles.site}>
      <header className={styles.nav}>
        <a className={styles.brand} href="/test-page">
          <span className={styles.dot} /> Aether Station
        </a>
        <nav className={styles.links}>
          <a href="/test-page">Indicators</a>
          <a href="/test-page">Findings</a>
          <a href="/test-page">Mission</a>
          <a href="/test-page">About</a>
        </nav>
      </header>

      <div className={styles.hero} style={{ backgroundImage: `url(${HERO_IMG})` }}>
        <div className={styles.overlay}>
          <div className={styles.wrap}>
            <div className={styles.inner}>
              <p className={styles.eyebrow}>Earth Systems Observatory</p>
              <h1>Watching the planet's vital signs, in near real time.</h1>
              <p>
                Aether Station tracks the climate indicators and research that shape our understanding
                of a changing Earth — updated every monitoring cycle.
              </p>
              <a className={styles.cta} href="/test-page">
                Explore the latest readings →
              </a>
            </div>
          </div>
        </div>
      </div>

      <main>
        <section className={styles.block}>
          <div className={styles.wrap}>
            <p className={styles.kicker}>Key climate indicators</p>
            <h2>This cycle's headline readings</h2>
            <p className={styles.lead}>
              Averaged over the most recent monitoring cycle, shown against the prior 12 months.
            </p>
            <div className={styles.stats}>
              {STATS.map((s) => (
                <div className={styles.stat} key={s.label}>
                  <p className={styles.label}>{s.label}</p>
                  <div className={styles.value}>{s.value}</div>
                  <div className={`${styles.delta} ${s.up ? styles.up : styles.down}`}>{s.delta}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.wrap}>
            <p className={styles.kicker}>Latest findings</p>
            <h2>Fresh from the field</h2>
            <p className={styles.lead}>Notable research and observations reported this cycle.</p>
            <div className={styles.cards}>
              {FINDINGS.map((f) => (
                <article className={styles.card} key={f.text}>
                  <div
                    className={styles.thumb}
                    style={{ background: `${f.fallback}`, backgroundImage: `url(${f.img})` }}
                  />
                  <div className={styles.body}>
                    <span className={styles.tag}>{f.tag}</span>
                    <p>{f.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={`${styles.wrap} ${styles.mission}`}>
            <div>
              <p className={styles.kicker}>Mission status</p>
              <h2>Aether-2 stratospheric campaign</h2>
              <p className={styles.lead}>
                The Aether-2 stratospheric balloon campaign is <strong>on schedule</strong>, with the
                next launch window opening in the coming weeks. All five ground stations are reporting
                nominal telemetry.
              </p>
              <span className={styles.badge}>● On schedule</span>
            </div>
            <div className={styles.photo} style={{ backgroundImage: `url(${MISSION_IMG})` }} />
          </div>
        </section>
      </main>

      <footer className={styles["site-footer"]}>
        <div className={styles.wrap}>
          <div className={styles.cols}>
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
          <div className={styles.fine}>© 2026 Aether Station · Educational demo · All figures illustrative.</div>
        </div>
      </footer>
    </div>
  );
}
