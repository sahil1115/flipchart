import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PwaControls } from '../pwa/PwaControls';
import { GlassPanel } from '../components/GlassPanel';
import { SettingsMenu } from '../components/SettingsMenu';
import { TypographyContext } from '../themes/TypographyContext';
import {
  applyTypography,
  defaultTypography,
  readTypographyPreference,
} from '../storage/typography-preference';
import type { Dataset } from '../data/types';
import { loadDemo } from '../demo/load';
import { useWorkspace } from '../state/workspace';
import {
  applyTheme,
  loadThemeFont,
  resolveTheme,
  themeFontReady,
} from '../themes/themes';
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
import { CorrelationPage } from '../features/correlation/CorrelationPage';
import { RotationPage } from '../features/rotation/RotationPage';
import { AlphaVantageProvider } from '../providers/alpha-vantage';
import { TwelveDataProvider } from '../providers/twelve-data';
import { YahooFinanceProvider } from '../providers/yahoo-finance';
import type { ConnectedProvider } from '../providers/twelve-data';
import { LiveSession } from '../providers/live-session';
import { useDashboard } from '../state/dashboard';
import { readCredential } from '../storage/provider-credential';

type LoadState =
  | { status: 'initial' | 'loading' | 'error' }
  | { status: 'ready'; dataset: Dataset };
type Page = 'workspace' | 'correlation' | 'rotation';
const routePage = (): Page =>
  location.hash === '#correlation'
    ? 'correlation'
    : location.hash === '#rotation'
      ? 'rotation'
      : 'workspace';

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
  const headerRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const [working, setWorking] = useState(false);
  const [preferenceWarning, setPreferenceWarning] = useState('');
  const [preference, setPreference] = useState(readThemePreference);
  const [typography, setTypography] = useState(readTypographyPreference);
  const generation = useRef(0);
  // Bumped when a theme's web font finishes loading; the fresh theme object
  // makes the canvas charts re-apply their font with real glyph metrics.
  const [fontRevision, setFontRevision] = useState(0);
  const theme = useMemo(
    () => ({
      ...resolveTheme(preference.themeId, preference.terminal),
      fontRevision,
    }),
    [preference.themeId, preference.terminal, fontRevision],
  );
  useEffect(() => {
    if (themeFontReady(theme)) return;
    let current = true;
    void loadThemeFont(theme).then(() => {
      // Only re-render once the font is usable; a failed load must not loop.
      if (current && themeFontReady(theme))
        setFontRevision((revision) => revision + 1);
    });
    return () => {
      current = false;
    };
  }, [theme]);
  const preferenceSaved = useWorkspace((value) => value.preferenceSaved);
  const [page, setPage] = useState<Page>(routePage);
  useEffect(() => {
    const sync = () => setPage(routePage());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  function showPage(next: Page) {
    const hash = next === 'workspace' ? '' : `#${next}`;
    if (location.hash !== hash)
      history.pushState(
        null,
        '',
        `${location.pathname}${location.search}${hash}`,
      );
    setPage(next);
  }
  useEffect(() => {
    applyTheme(theme, preference.reducedEffects);
  }, [theme, preference.reducedEffects]);
  useEffect(() => applyTypography(typography), [typography]);
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

  // The data-source drawer sits directly below the sticky header.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () =>
      document.documentElement.style.setProperty(
        '--header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
    showPage('workspace');
    live.cancel();
    setProviderOpen(false);
    setState({ status: 'initial' });
    setImportOpen(false);
    setNotice('');
    void libraryAction(() => store.select(null));
  }
  const dataset = state.status === 'ready' ? state.dataset : null;
  const source: {
    name: string;
    symbol: string | null;
    tone: 'live' | 'local' | 'idle';
  } = !dataset
    ? { name: 'Connect data', symbol: null, tone: 'idle' }
    : dataset.metadata.mode === 'live'
      ? {
          name:
            dataset.metadata.provider === 'yahoo-finance'
              ? 'Yahoo Finance'
              : dataset.metadata.provider === 'alpha-vantage'
                ? 'Alpha Vantage'
                : 'Twelve Data',
          symbol: dataset.metadata.listing.symbol,
          tone: 'live',
        }
      : {
          name: dataset.metadata.mode === 'demo' ? 'Demo' : 'CSV',
          symbol: dataset.metadata.listing.symbol,
          tone: 'local',
        };
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
  function closeProvider() {
    setProviderOpen(false);
    pillRef.current?.focus();
  }
  function switchProvider(id: string) {
    if (id === live.provider.id) return;
    live.disconnect();
    connectionChanged();
    const selectedProvider =
      id === 'yahoo-finance'
        ? new YahooFinanceProvider()
        : id === 'alpha-vantage'
          ? new AlphaVantageProvider()
          : new TwelveDataProvider();
    const saved = readCredential(selectedProvider.id);
    setConnection({
      saved,
      session: new LiveSession(selectedProvider, saved.credential),
    });
  }
  function updatePreference(next: typeof preference) {
    setPreference(next);
    setPreferenceWarning(
      writeThemePreference(next)
        ? ''
        : 'Browser storage is unavailable. Appearance applies for this session.',
    );
  }
  function clearCache() {
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
    );
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
    setTypography({ ...defaultTypography });
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
    <TypographyContext value={typography}>
      <div className={`app-shell${dataset ? ' has-dataset' : ''}`}>
        <a className="skip-link" href="#workspace">
          Skip to workspace
        </a>
        <header className="app-header" ref={headerRef}>
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
          <nav className="page-tabs" aria-label="Pages">
            <a
              href="#"
              aria-current={page === 'workspace' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                showPage('workspace');
              }}
            >
              Chart
            </a>
            <a
              href="#correlation"
              aria-current={page === 'correlation' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                showPage('correlation');
              }}
            >
              Correlation
            </a>
            <a
              href="#rotation"
              aria-current={page === 'rotation' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                showPage('rotation');
              }}
            >
              Sector rotation
            </a>
          </nav>
          <div className="header-actions">
            <button
              ref={pillRef}
              className={`source-pill ${source.tone}${source.symbol ? ' has-symbol' : ''}`}
              aria-label={`Data source: ${source.name}${source.symbol ? ` · ${source.symbol}` : ''}`}
              aria-expanded={providerOpen}
              aria-controls="data-source"
              onClick={() => (providerOpen ? closeProvider() : openProvider())}
            >
              <span className="status-dot" aria-hidden="true" />
              <span className="source-name">{source.name}</span>
              {source.symbol && (
                <>
                  <span className="source-sep" aria-hidden="true">
                    ·
                  </span>
                  <strong>{source.symbol}</strong>
                </>
              )}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <SettingsMenu
              theme={theme}
              preference={preference}
              onPreference={updatePreference}
              typography={typography}
              onTypography={setTypography}
              working={working}
              onResetPreferences={resetSavedPreferences}
              onClearCache={clearCache}
            />
          </div>
        </header>
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
          onClose={closeProvider}
          onProvider={switchProvider}
          onDataset={(item, token) => {
            if (token !== generation.current) return;
            setState({ status: 'ready', dataset: item });
            setImportOpen(false);
            showPage('workspace');
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
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          )}
          {page === 'correlation' && (
            <CorrelationPage
              onBack={() => showPage('workspace')}
              palette={preference.heatmapPalette}
            />
          )}
          {page === 'rotation' && (
            <RotationPage onBack={() => showPage('workspace')} />
          )}
          <div className="workspace-view" hidden={page !== 'workspace'}>
            {importOpen && (
              <CsvImportPanel
                onImport={(item) => void activate(item)}
                onCancel={() => setImportOpen(false)}
              />
            )}
            {state.status === 'initial' && !importOpen && (
              <Landing
                onDemo={() => void tryDemo()}
                onImport={openImport}
                onProvider={openProvider}
              />
            )}
            {state.status === 'loading' && (
              <GlassPanel
                className="state-panel"
                role="status"
                aria-busy="true"
              >
                <h2>Preparing the demo…</h2>
                <p>Loading bundled synthetic price and volume data.</p>
                <div className="skeleton" />
              </GlassPanel>
            )}
            {state.status === 'error' && (
              <GlassPanel className="state-panel" role="alert">
                <h2>Could not load the demo</h2>
                <p>
                  An unexpected error interrupted loading. Please try again.
                </p>
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
                      · newest selected first · at most 10 datasets, 100,000
                      bars and 20 MiB · oldest datasets evicted at limits
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
                          {item.metadata.listing.exchange ??
                            'Exchange unavailable'}{' '}
                          ·{' '}
                          {item.metadata.listing.currency ??
                            'Currency unavailable'}{' '}
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
          </div>
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
                  Currency: {dataset.metadata.listing.currency ?? 'unavailable'}{' '}
                  · Timezone:{' '}
                  {dataset.metadata.listing.timezone ?? 'unavailable'} ·
                  Adjustment: {dataset.metadata.adjustment} · Delay:{' '}
                  {dataset.metadata.delay}
                </span>
              </>
            )}
            {dataset?.metadata.mode === 'live' && (
              <a
                href={
                  dataset.metadata.provider === 'yahoo-finance'
                    ? 'https://finance.yahoo.com/'
                    : dataset.metadata.provider === 'alpha-vantage'
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
          <p className="footer-disclaimer">
            <strong>Disclaimer:</strong> FlipChart is for informational and
            educational purposes only and is not financial advice. Data and
            indicator calculations may be delayed, incomplete, or inaccurate.
            Independently verify prices and results with reliable sources before
            making any investment decision. You are responsible for your
            decisions; FlipChart and its contributors accept no responsibility
            for losses arising from use of this app.
          </p>
        </footer>
      </div>
    </TypographyContext>
  );
}
