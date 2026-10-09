import { GlassPanel } from '../../components/GlassPanel';
export function Landing({
  onDemo,
  onImport,
  onProvider,
}: {
  onDemo: () => void;
  onImport: () => void;
  onProvider: () => void;
}) {
  return (
    <>
      <GlassPanel className="welcome-panel">
        <div className="welcome-copy">
          <span className="badge">NO KEY NEEDED</span>
          <h2>Meet your chart workspace.</h2>
          <p>
            Start with a synthetic dataset or import your own daily CSV. Pan
            through history, zoom into a session, or switch your view.
          </p>
          <button className="primary" onClick={onDemo}>
            Try Demo <span aria-hidden="true">↗</span>
          </button>
          <p className="small">
            780 daily bars · generated locally · no market-data requests
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-caption">PRICE / VOLUME</div>
          <svg viewBox="0 0 480 200" fill="none">
            <path
              className="art-grid"
              d="M0 40H480M0 90H480M0 140H480M70 0V200M170 0V200M270 0V200M370 0V200"
            />
            <path
              className="art-fill"
              d="M0 164L35 142L70 151L105 120L140 127L175 86L210 99L245 75L280 83L315 48L350 60L385 34L420 46L455 20L480 26V200H0Z"
            />
            <path
              className="art-line"
              d="M0 164L35 142L70 151L105 120L140 127L175 86L210 99L245 75L280 83L315 48L350 60L385 34L420 46L455 20L480 26"
            />
          </svg>
          <span>Illustration · synthetic data</span>
        </div>
      </GlassPanel>
      <div className="entry-grid">
        <GlassPanel className="entry-card">
          <span className="entry-icon" aria-hidden="true">
            ↥
          </span>
          <div>
            <h2>Bring your own data</h2>
            <p>Explore a local OHLCV file.</p>
          </div>
          <button onClick={onImport}>
            Import CSV <span aria-hidden="true">→</span>
          </button>
        </GlassPanel>
        <GlassPanel className="entry-card">
          <span className="entry-icon" aria-hidden="true">
            ⌁
          </span>
          <div>
            <h2>Connect a provider</h2>
            <p>Use your own market-data key.</p>
          </div>
          <button onClick={onProvider}>
            Connect Provider <span aria-hidden="true">→</span>
          </button>
        </GlassPanel>
      </div>
    </>
  );
}
