import { useCallback, useEffect, useRef, useState } from 'react';
import { PwaControls } from '../pwa/PwaControls';
import { GlassPanel } from '../components/GlassPanel';
import type { Dataset } from '../data/types';
import { loadDemo } from '../demo/load';
import { useWorkspace } from '../state/workspace';
import { applyTheme, resolveTheme, themes } from '../themes/themes';
import {
  readThemePreference,
  writeThemePreference,
} from '../storage/theme-preference';
import {
  defaultWorkspacePreference,
  resetPreferences,
} from '../storage/workspace-preference';
import { DatasetRepository } from '../storage/datasets';
import type { LibrarySnapshot } from '../storage/datasets';
import { CsvImportPanel } from '../import-export/CsvImportPanel';
import { DatasetWorkspace } from '../features/dashboard/DatasetWorkspace';
import { Landing } from '../features/dashboard/Landing';
import { ProviderPanel } from '../features/settings/ProviderPanel';
import { AlphaVantageProvider } from '../providers/alpha-vantage';
import { TwelveDataProvider } from '../providers/twelve-data';
import type { ConnectedProvider } from '../providers/twelve-data';
import { LiveSession } from '../providers/live-session';
import { useDashboard } from '../state/dashboard';
import { readCredential } from '../storage/provider-credential';

type LoadState =
  | { status: 'initial' | 'loading' | 'error' }
  | { status: 'ready'; dataset: Dataset };
export function App({
  demoLoader = loadDemo,
  repository,
  provider,
}: {
  demoLoader?: () => Promise<Dataset>;
  repository?: DatasetRepository;
  provider?: ConnectedProvider;
}) {
  const [store] = useState(() => repository ?? new DatasetRepository());
  const [connection, setConnection] = useState(() => {
    const saved = readCredential();
    return {
      saved,
      session: new LiveSession(
        provider ?? new TwelveDataProvider(),
        saved.credential,
      ),
    };
  });
  const live = connection.session;
  const [providerOpen, setProviderOpen] = useState(false);
  const [warmupBars, setWarmupBars] = useState(500);
  const [nativeWarmupBars, setNativeWarmupBars] = useState(500);
  const historyRequirement = useCallback((bars: number, nativeBars: number) => {
    setWarmupBars(bars);
    setNativeWarmupBars(nativeBars);
  }, []);
  const [library, setLibrary] = useState<LibrarySnapshot>(() =>
    store.snapshot(),
  );
  const [state, setState] = useState<LoadState>({ status: 'initial' });
  const [notice, setNotice] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeControl = useRef<HTMLDivElement>(null);
  const [working, setWorking] = useState(false);
  const [preferenceWarning, setPreferenceWarning] = useState('');
  const [preference, setPreference] = useState(readThemePreference);
  const generation = useRef(0);
  const theme = resolveTheme(preference.themeId);
  const preferenceSaved = useWorkspace((value) => value.preferenceSaved);
  useEffect(() => {
    applyTheme(theme, preference.reducedEffects);
  }, [theme, preference.reducedEffects]);
  useEffect(() => () => live.clearCache(), [live]);
  useEffect(() => {
    let cancelled = false;
    const token = generation.current;
    void store.initialize().then((snapshot) => {
      if (cancelled) return;
      setLibrary(snapshot);
      if (token !== generation.current) return;
      const selected = snapshot.datasets.find(
        (dataset) => dataset.metadata.id === snapshot.selectedId,
      );
      if (selected) setState({ status: 'ready', dataset: selected });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!themeOpen) return;
    themeControl.current
      ?.querySelector<HTMLInputElement>('input:checked')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!themeControl.current?.contains(event.target as Node))
        setThemeOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setThemeOpen(false);
      themeControl.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [themeOpen]);

  async function activate(dataset: Dataset, token = ++generation.current) {
    live.cancel();
    setProviderOpen(false);
    setState({ status: 'ready', dataset });
    setImportOpen(false);
    setWorking(true);
    try {
      await store.save(dataset);
      setLibrary(store.snapshot());
    } catch {
      if (token === generation.current)
        setNotice(
          'The dataset could not be added to the library. Please check its metadata.',
        );
    } finally {
      if (token === generation.current) setWorking(false);
    }
  }
  async function tryDemo() {
    live.cancel();
    setProviderOpen(false);
    const token = ++generation.current;
    setNotice('');
    setImportOpen(false);
    setState({ status: 'loading' });
    try {
      const dataset = await demoLoader();
      if (token === generation.current) await activate(dataset, token);
    } catch {
      if (token === generation.current) setState({ status: 'error' });
    }
  }
  async function libraryAction(
    operation: () => Promise<LibrarySnapshot>,
    action: () => void = () => {},
  ) {
    live.cancel();
    const token = ++generation.current;
    setWorking(true);
    try {
      await operation();
      setLibrary(store.snapshot());
      if (token === generation.current) {
        action();
      }
    } catch {
      if (token === generation.current)
        setNotice(
          'The library action could not be completed. Please try again.',
        );
    } finally {
      if (token === generation.current) setWorking(false);
    }
  }
  function home() {
    live.cancel();
    setProviderOpen(false);
    setState({ status: 'initial' });
    setImportOpen(false);
    setNotice('');
    void libraryAction(() => store.select(null));
  }
  const dataset = state.status === 'ready' ? state.dataset : null;
  function openImport() {
    live.cancel();
    setProviderOpen(false);
    ++generation.current;
    setWorking(false);
    setImportOpen(true);
    setNotice('');
  }
  function openProvider() {
    ++generation.current;
    setWorking(false);
    setProviderOpen(true);
    setImportOpen(false);
    setNotice('');
  }
  function connectionChanged() {
    ++generation.current;
    setWorking(false);
    setState((previous) =>
      previous.status === 'ready' && previous.dataset.metadata.mode === 'live'
        ? { status: 'initial' }
        : previous,
    );
  }
  function resetSavedPreferences() {
    const saved = resetPreferences();
    useDashboard.getState().reset();
    setPreference({
      version: 1,
      themeId: 'glass-light',
      reducedEffects: false,
    });
    useWorkspace.setState({
      chartStyle: defaultWorkspacePreference.chartStyle,
      range: defaultWorkspacePreference.range,
      resetRevision: useWorkspace.getState().resetRevision + 1,
      preferenceSaved: saved,
    });
    setPreferenceWarning(
      saved
        ? ''
        : 'Preferences reset for this session; browser storage is unavailable.',
    );
    setNotice(
      'Appearance, chart view, panel layout and parameter preferences reset. Saved datasets and the current selection were retained.',
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="FlipChart home"
          onClick={(event) => {
            event.preventDefault();
            home();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            F<span />
          </span>
          <span>
            FlipChart<span className="brand-caption">A clearer view</span>
          </span>
        </a>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true" />
          {dataset
            ? dataset.metadata.mode === 'demo'
              ? 'Synthetic demo'
              : dataset.metadata.mode === 'import'
                ? 'Imported CSV'
                : `${dataset.metadata.provider === 'alpha-vantage' ? 'Alpha Vantage' : 'Twelve Data'} · ${dataset.metadata.interval}`
            : 'No data loaded'}
          <span className="badge">
            {dataset?.metadata.mode === 'live' ? 'PROVIDER' : 'LOCAL'}
          </span>
        </div>
        <div className="header-actions">
          <div className="theme-control" ref={themeControl}>
            <button
              className="settings-button theme-button"
              aria-expanded={themeOpen}
              aria-controls="theme-menu"
              onClick={() => setThemeOpen(!themeOpen)}
            >
              <span className="theme-button-icon" aria-hidden="true" />
              Theme
            </button>
            {themeOpen && (
              <GlassPanel
                id="theme-menu"
                className="theme-popover"
                aria-label="Choose theme"
              >
                <div className="theme-popover-heading">
                  <div>
                    <h2>Choose a theme</h2>
                    <p className="small">{theme.name} · choose your finish</p>
                  </div>
                  <button
                    aria-label="Close theme picker"
                    onClick={() => {
                      setThemeOpen(false);
                      themeControl.current
                        ?.querySelector<HTMLButtonElement>('button')
                        ?.focus();
                    }}
                  >
                    ×
                  </button>
                </div>
                <fieldset className="theme-picker">
                  <legend>Theme</legend>
                  {Object.values(themes).map((option) => (
                    <label className="theme-option" key={option.id}>
                      <input
                        type="radio"
                        name="theme"
                        value={option.id}
                        checked={preference.themeId === option.id}
                        onChange={() => {
                          const next = { ...preference, themeId: option.id };
                          setPreference(next);
                          setPreferenceWarning(
                            writeThemePreference(next)
                              ? ''
                              : 'Browser storage is unavailable. Appearance applies for this session.',
                          );
                        }}
                      />
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={{
                          background: option.css['--surface-opaque'],
                          borderColor: option.css['--border'],
                        }}
                      >
                        <span style={{ background: option.css['--accent'] }} />
                      </span>
                      {option.name}
                    </label>
                  ))}
                </fieldset>
              </GlassPanel>
            )}
          </div>
          <button className="settings-button" onClick={openProvider}>
            Data connection
          </button>
          <button
            className="settings-button"
            aria-expanded={settingsOpen}
            aria-controls="appearance-settings"
            onClick={() => {
              setThemeOpen(false);
              setSettingsOpen(!settingsOpen);
            }}
          >
            Settings <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>
      {settingsOpen && (
        <GlassPanel
          id="appearance-settings"
          className="settings-panel"
          aria-label="Appearance and storage settings"
        >
          <div>
            <h2>Appearance</h2>
            <p>{theme.name} · calm surfaces, clear charts</p>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preference.reducedEffects}
              onChange={(event) => {
                const next = {
                  ...preference,
                  reducedEffects: event.target.checked,
                };
                setPreference(next);
                setPreferenceWarning(
                  writeThemePreference(next)
                    ? ''
                    : 'Browser storage is unavailable. Appearance applies for this session.',
                );
              }}
            />{' '}
            Reduce visual effects
          </label>
          <div className="storage-controls">
            <div>
              <h2>Local storage</h2>
              <p className="small">
                Clear Cache removes all saved demo/import datasets and recent
                listings plus the provider session cache. Saved keys are
                retained. Reset Preferences resets appearance, chart view, panel
                layout and parameters. Watchlist and credentials are retained.
              </p>
            </div>
            <button
              disabled={working}
              onClick={() =>
                void libraryAction(
                  () => {
                    live.clearCache();
                    return store.clear();
                  },
                  () => {
                    setState({ status: 'initial' });
                    setImportOpen(false);
                    setNotice(
                      'Dataset caches and recent listings cleared. Appearance, chart view and saved key preferences retained.',
                    );
                  },
                )
              }
            >
              Clear Cache
            </button>
            <button onClick={resetSavedPreferences}>Reset Preferences</button>
          </div>
        </GlassPanel>
      )}
      <main id="workspace" tabIndex={-1}>
        <PwaControls />
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">YOUR MARKET WORKSPACE</p>
            <h1>
              {dataset
                ? 'Price, in perspective.'
                : 'Start with a clearer view.'}
            </h1>
            <p className="intro">
              Explore price and volume. Follow the numbers at your own pace.
            </p>
          </div>
          <span className="phase-badge">
            Prices · volume · independent calculations
          </span>
        </div>
        {library.warning && (
          <div className="notice" role="status">
            {library.warning}
          </div>
        )}
        {(preferenceWarning || !preferenceSaved) && (
          <div className="notice" role="status">
            {preferenceWarning ||
              'Chart preferences apply for this session only; browser storage is unavailable.'}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="Dismiss message" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {library.datasets.length > 0 && (
          <GlassPanel
            className="recent-panel"
            aria-label="Recent datasets and listings"
          >
            <div className="panel-heading">
              <div>
                <h2>Recent datasets & listings</h2>
                <p className="small">
                  {library.persistent
                    ? 'Saved in this browser'
                    : 'Session only'}{' '}
                  · newest selected first · at most 10 datasets, 100,000 bars
                  and 20 MiB · oldest datasets evicted at limits
                </p>
              </div>
              <button onClick={openImport}>Import another CSV</button>
            </div>
            <div className="recent-list">
              {library.datasets.map((item) => (
                <div className="recent-item" key={item.metadata.id}>
                  <div>
                    <span className="badge">
                      {item.metadata.mode.toUpperCase()}
                    </span>
                    <strong>{item.metadata.listing.symbol}</strong>
                    <span className="small">
                      {item.metadata.listing.exchange ?? 'Exchange unavailable'}{' '}
                      ·{' '}
                      {item.metadata.listing.currency ?? 'Currency unavailable'}{' '}
                      · {item.candles.length.toLocaleString('en-US')} bars
                      {' · '}
                      {item.metadata.importConventions?.filename ??
                        'Synthetic demo'}
                      {' · '}
                      {item.metadata.latestCandleTime ?? 'Date unavailable'}
                    </span>
                  </div>
                  <div className="recent-actions">
                    <button
                      disabled={working}
                      aria-label={
                        'Open dataset ' +
                        item.metadata.listing.symbol +
                        ' ' +
                        item.metadata.mode
                      }
                      onClick={() =>
                        void libraryAction(
                          () => store.select(item.metadata.id),
                          () => {
                            setState({ status: 'ready', dataset: item });
                            setImportOpen(false);
                          },
                        )
                      }
                    >
                      {dataset?.metadata.id === item.metadata.id
                        ? 'Selected'
                        : 'Open'}
                    </button>
                    <button
                      disabled={working}
                      aria-label={
                        'Delete dataset ' +
                        item.metadata.listing.symbol +
                        ' ' +
                        item.metadata.mode
                      }
                      onClick={() =>
                        void libraryAction(
                          () => store.delete(item.metadata.id),
                          () => {
                            if (dataset?.metadata.id === item.metadata.id)
                              setState({ status: 'initial' });
                            setNotice(
                              'Deleted only this dataset from the local library.',
                            );
                          },
                        )
                      }
                    >
                      Delete Dataset
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        )}
        {importOpen && (
          <CsvImportPanel
            onImport={(item) => void activate(item)}
            onCancel={() => setImportOpen(false)}
          />
        )}
        {providerOpen && (
          <label className="provider-selector">
            Market data provider
            <select
              aria-label="Market data provider"
              value={live.provider.id}
              onChange={(event) => {
                live.disconnect();
                connectionChanged();
                const selectedProvider =
                  event.target.value === 'alpha-vantage'
                    ? new AlphaVantageProvider()
                    : new TwelveDataProvider();
                const saved = readCredential(selectedProvider.id);
                setConnection({
                  saved,
                  session: new LiveSession(selectedProvider, saved.credential),
                });
              }}
            >
              <option value="twelve-data">Twelve Data</option>
              <option value="alpha-vantage">Alpha Vantage</option>
            </select>
            <span className="small">
              Switching clears the old session, requests and loaded provider
              data. Remembered keys stay separate; memory-only keys must be
              entered again. No automatic fallback.
            </span>
          </label>
        )}
        <ProviderPanel
          key={live.provider.id}
          open={providerOpen}
          session={live}
          saved={connection.saved}
          activeDataset={dataset}
          warmupBars={warmupBars}
          nativeWarmupBars={nativeWarmupBars}
          onIntent={() => {
            const token = ++generation.current;
            setWorking(false);
            return token;
          }}
          onConnectionChanged={connectionChanged}
          onClose={() => setProviderOpen(false)}
          onDataset={(item, token) => {
            if (token !== generation.current) return;
            setState({ status: 'ready', dataset: item });
            setImportOpen(false);
            void store.select(null).then(() => setLibrary(store.snapshot()));
          }}
          onRefreshFailure={(token) => {
            if (token !== generation.current) return;
            setState((previous) =>
              previous.status === 'ready' &&
              previous.dataset.metadata.mode === 'live'
                ? {
                    status: 'ready',
                    dataset: {
                      ...previous.dataset,
                      metadata: {
                        ...previous.dataset.metadata,
                        freshness: 'stale',
                      },
                    },
                  }
                : previous,
            );
          }}
        />
        {state.status === 'initial' && !importOpen && !providerOpen && (
          <Landing
            onDemo={() => void tryDemo()}
            onImport={openImport}
            onProvider={openProvider}
          />
        )}
        {state.status === 'loading' && (
          <GlassPanel className="state-panel" role="status" aria-busy="true">
            <h2>Preparing the demo…</h2>
            <p>Loading bundled synthetic price and volume data.</p>
            <div className="skeleton" />
          </GlassPanel>
        )}
        {state.status === 'error' && (
          <GlassPanel className="state-panel" role="alert">
            <h2>Could not load the demo</h2>
            <p>An unexpected error interrupted loading. Please try again.</p>
            <button className="primary" onClick={() => void tryDemo()}>
              Try again
            </button>
          </GlassPanel>
        )}
        {dataset && (
          <DatasetWorkspace
            dataset={dataset}
            theme={theme}
            onChangeData={home}
            onHistoryRequirement={historyRequirement}
          />
        )}
      </main>
      <footer className="app-footer">
        <div>
          <strong>FlipChart</strong>
          <p>For informational purposes only. Not financial advice.</p>
        </div>
        <div className="source-note">
          <span>
            {dataset
              ? dataset.metadata.source
              : 'Start locally with the synthetic demo or a CSV import.'}
          </span>
          {dataset && (
            <>
              <span>
                {dataset.metadata.mode === 'live'
                  ? 'Fetched from provider:'
                  : 'Loaded locally:'}{' '}
                {new Date(dataset.metadata.retrievedAt).toISOString()} · Data
                date: {dataset.metadata.latestCandleTime ?? 'Unavailable'}
              </span>
              <span>
                Currency: {dataset.metadata.listing.currency ?? 'unavailable'} ·
                Timezone: {dataset.metadata.listing.timezone ?? 'unavailable'} ·
                Adjustment: {dataset.metadata.adjustment} · Delay:{' '}
                {dataset.metadata.delay}
              </span>
            </>
          )}
          {dataset?.metadata.mode === 'live' && (
            <a
              href={
                dataset.metadata.provider === 'alpha-vantage'
                  ? 'https://www.alphavantage.co/'
                  : 'https://twelvedata.com/'
              }
              target="_blank"
              rel="noreferrer"
            >
              {dataset.metadata.source}
            </a>
          )}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
          >
            Charts powered by TradingView Lightweight Charts™
          </a>
        </div>
        <div className="footer-attribution">
          <a href={`${import.meta.env.BASE_URL}license.txt`}>MIT license</a>
          <a href={`${import.meta.env.BASE_URL}third-party-notices.txt`}>
            Dependency notices
          </a>
        </div>
        <div id="offline-readiness" />
      </footer>
    </div>
  );
}
