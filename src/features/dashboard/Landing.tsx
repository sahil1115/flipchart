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
    <GlassPanel className="welcome-panel">
      <div className="welcome-hero">
        <div className="welcome-copy">
          <span className="badge">NO KEY NEEDED</span>
          <h2>Meet your chart workspace.</h2>
          <p>
            Start with a synthetic dataset, import your own daily CSV or connect
            a market-data provider.
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
      </div>
      <div className="entry-grid">
        <div className="entry-item">
          <span className="entry-icon" aria-hidden="true">
            ↥
          </span>
          <div className="entry-text">
            <h3>Bring your own data</h3>
            <p>Explore a local OHLCV file.</p>
          </div>
          <div className="entry-action">
            <button onClick={onImport}>
              Import CSV <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <div className="entry-item">
          <span className="entry-icon" aria-hidden="true">
            ⌁
          </span>
          <div className="entry-text">
            <h3>Connect a provider</h3>
            <p>Connect live daily market data.</p>
          </div>
          <div className="entry-action">
            <button onClick={onProvider}>
              Connect Provider <span aria-hidden="true">→</span>
            </button>
            <p className="small">
              Twelve Data · free Yahoo Finance for US and India stocks
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
