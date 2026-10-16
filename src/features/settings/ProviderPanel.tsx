import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Dataset, Listing } from '../../data/types';
import type { HistoryRequest } from '../../providers/types';
import { ProviderError } from '../../providers/types';
import { historyRequest } from '../../providers/live-session';
import type { HistoryWindow, LiveSession } from '../../providers/live-session';
import type { ConnectionReport } from '../../providers/twelve-data';
import { exchangeDate } from '../../providers/twelve-data';
import { readWatchlist, writeWatchlist } from '../../storage/watchlist';
import type { WatchEntry } from '../../storage/watchlist';
import { writeCredential } from '../../storage/provider-credential';
import type { SavedCredential } from '../../storage/provider-credential';

const providerOptions = [
  { id: 'twelve-data', label: 'Twelve Data' },
  { id: 'alpha-vantage', label: 'Alpha Vantage' },
  { id: 'yahoo-finance', label: 'Yahoo · NSE' },
] as const;
const listingLabel = (listing: Listing) =>
  `${listing.symbol} · ${listing.exchange ?? listing.mic ?? listing.region ?? 'Exchange unavailable'}`;
function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
    </svg>
  );
}
function safeError(error: unknown): string {
  return error instanceof ProviderError
    ? `${error.message}${error.retryAt ? ` Provider supplied retry time: ${error.retryAt}.` : ''}`
    : 'The provider action failed. No response was loaded.';
}
export function ProviderPanel({
  open,
  session,
  saved,
  activeDataset,
  warmupBars,
  nativeWarmupBars = 500,
  onIntent,
  onDataset,
  onRefreshFailure,
  onConnectionChanged,
  onClose,
  onProvider,
}: {
  open: boolean;
  session: LiveSession;
  saved: SavedCredential;
  activeDataset: Dataset | null;
  warmupBars: number;
  nativeWarmupBars?: number;
  onIntent: () => number;
  onDataset: (dataset: Dataset, token: number) => void;
  onRefreshFailure: (token: number) => void;
  onConnectionChanged: () => void;
  onClose: () => void;
  onProvider: (id: string) => void;
}) {
  const [watchlist, setWatchlist] = useState<WatchEntry[]>(readWatchlist);
  function saveWatchlist(entries: WatchEntry[]) {
    setWatchlist(entries);
    if (!writeWatchlist(entries))
      setWarning(
        'Watchlist applies for this session only; browser storage is unavailable.',
      );
  }
  const alpha = session.provider.id === 'alpha-vantage';
  const yahoo = session.provider.id === 'yahoo-finance';
  const providerName = yahoo
    ? 'Yahoo Finance'
    : alpha
      ? 'Alpha Vantage'
      : 'Twelve Data';
  const [interval, setInterval] =
    useState<Dataset['metadata']['interval']>('daily');
  const [historySize, setHistorySize] = useState<'compact' | 'full'>('compact');
  const [key, setKey] = useState(saved.credential),
    [remember, setRemember] = useState(saved.remembered),
    [shown, setShown] = useState(false);
  const [connected, setConnected] = useState(session.connected),
    [warning, setWarning] = useState(saved.warning);
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Listing[]>([]),
    [selected, setSelected] = useState<Listing | null>(null);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [searchStatus, setSearchStatus] = useState(''),
    [searchError, setSearchError] = useState(''),
    [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [report, setReport] = useState<ConnectionReport | null>(null);
  const [window, setWindow] = useState<HistoryWindow>('1Y'),
    [adjustment, setAdjustment] = useState<'raw' | 'adjusted'>('raw');
  const loadedRequest = useRef<HistoryRequest | null>(null);
  const drawer = useRef<HTMLElement>(null);
  const [managingKey, setManagingKey] = useState(!session.connected);
  const [showAllSaved, setShowAllSaved] = useState(false);
  // Focus the drawer's first control when it opens (also after a provider
  // switch remounts it) so keyboard users land inside the dialog.
  useEffect(() => {
    if (open)
      drawer.current
        ?.querySelector<HTMLInputElement>('input[name="provider"]:checked')
        ?.focus();
  }, [open]);
  const searchInput = useRef<HTMLInputElement>(null),
    operation = useRef(0),
    searchGeneration = useRef(0);
  useEffect(() => {
    if (!open || !connected || searchCollapsed || query.trim().length < 2)
      return;
    const generation = ++searchGeneration.current;
    const timer = setTimeout(() => {
      setSearchStatus(
        yahoo ? 'Preparing NSE symbol…' : `Searching ${providerName}…`,
      );
      void session
        .search(query)
        .then((matches) => {
          if (generation !== searchGeneration.current) return;
          setResults(matches);
          setSearchStatus(
            yahoo
              ? 'NSE symbol candidate. Select it, then Load history to verify availability.'
              : matches.length
                ? `${matches.length} stock/ETF matches. Select the exchange you need.`
                : 'No supported stock/ETF matches. Try another symbol or company name.',
          );
        })
        .catch((error) => {
          if (
            generation !== searchGeneration.current ||
            (error instanceof ProviderError && error.category === 'cancelled')
          )
            return;
          setSearchStatus('');
          setSearchError(safeError(error));
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      searchGeneration.current = generation + 1;
      session.cancelSearch();
    };
  }, [open, connected, query, session, providerName, yahoo, searchCollapsed]);
  useEffect(() => {
    if (!open) return;
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [open]);
  function cancel() {
    operation.current++;
    session.cancel();
    setBusy(false);
    setStatus('Request cancelled. Loaded data retained.');
  }
  async function testConnection() {
    const token = ++operation.current;
    setBusy(true);
    setError('');
    setStatus(`Testing ${providerName} connection…`);
    try {
      const report = await session.testConnection();
      if (token !== operation.current) return;
      setReport(report);
      setStatus(
        alpha
          ? 'Search endpoint accepted the request. History access and account plan remain unverified.'
          : 'Key accepted by the usage endpoint. Listing/history access still depends on your account.',
      );
    } catch (error) {
      if (
        token === operation.current &&
        !(error instanceof ProviderError && error.category === 'cancelled')
      ) {
        setError(safeError(error));
        setStatus('');
      }
    } finally {
      if (token === operation.current) setBusy(false);
    }
  }
  async function load(refresh = false) {
    const live = activeDataset?.metadata.mode === 'live' ? activeDataset : null;
    const listing = refresh ? live?.metadata.listing : selected;
    if (!listing) return;
    if (!refresh) {
      searchGeneration.current++;
      session.cancelSearch();
      setSearchCollapsed(true);
      setResults([listing]);
      setSearchStatus(
        'Showing selected stock. Search again to choose another listing.',
      );
      setSearchError('');
    }
    const baseRequest =
      refresh && live?.metadata.requestedRange
        ? {
            listing,
            interval: live.metadata.interval,
            historySize,
            adjustment: live.metadata.adjustment,
            from: live.metadata.requestedRange.from,
            to: exchangeDate(listing.timezone),
            accessProfile: session.accessProfile,
          }
        : historyRequest(
            listing,
            window,
            adjustment,
            session.accessProfile,
            warmupBars,
          );
    const request =
      refresh && loadedRequest.current
        ? {
            ...loadedRequest.current,
            to: exchangeDate(listing.timezone),
            accessProfile: session.accessProfile,
          }
        : {
            ...baseRequest,
            interval,
            historySize,
            ...(yahoo ? { adjustment: 'unknown' as const } : {}),
          };
    if (alpha && !refresh && interval !== 'daily') {
      const start = new Date(`${request.to}T12:00:00Z`);
      start.setUTCFullYear(
        start.getUTCFullYear() - Number(window.slice(0, -1)),
      );
      start.setUTCDate(
        start.getUTCDate() -
          Math.ceil(nativeWarmupBars * (interval === 'weekly' ? 7 : 31)) -
          30,
      );
      request.from = start.toISOString().slice(0, 10) as HistoryRequest['from'];
    }
    const localToken = ++operation.current,
      token = onIntent();
    setBusy(true);
    setError('');
    setStatus(
      refresh ? 'Refreshing loaded history…' : 'Loading daily history…',
    );
    try {
      const dataset = await session.load(request, refresh);
      if (localToken !== operation.current) return;
      loadedRequest.current = request;
      onDataset(dataset, token);
      onClose();
      setStatus(
        `Loaded ${dataset.candles.length.toLocaleString('en-US')} ${dataset.metadata.interval} bars. Actual coverage ${dataset.metadata.coverage?.from} – ${dataset.metadata.coverage?.to}.${dataset.metadata.skippedSessions ? ` ${dataset.metadata.skippedSessions.toLocaleString('en-US')} ${dataset.metadata.skippedSessions === 1 ? 'session' : 'sessions'} with missing prices skipped.` : ''}`,
      );
    } catch (error) {
      if (
        localToken !== operation.current ||
        (error instanceof ProviderError && error.category === 'cancelled')
      )
        return;
      setError(safeError(error));
      setStatus(
        activeDataset
          ? 'History was not loaded. Your current chart is unchanged.'
          : 'History was not loaded. No chart data is available yet.',
      );
      if (refresh) onRefreshFailure(token);
    } finally {
      if (localToken === operation.current) setBusy(false);
    }
  }
  const close = () => {
    cancel();
    setQuery('');
    onClose();
  };
  /** Keep Tab inside the open dialog; Escape closes it. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !drawer.current) return;
    const focusable = [
      ...drawer.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary',
      ),
    ].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  const savedHere = watchlist.filter(
    (entry) => entry.provider === session.provider.id,
  );
  const visibleSaved = showAllSaved ? savedHere : savedHere.slice(0, 3);
  const isSaved = (listing: Listing) =>
    watchlist.some((entry) => entry.listing.id === listing.id);
  const toggleSaved = (listing: Listing) =>
    saveWatchlist(
      isSaved(listing)
        ? watchlist.filter((entry) => entry.listing.id !== listing.id)
        : [...watchlist, { provider: session.provider.id, listing }],
    );
  const keyStep = yahoo ? 0 : 1;
  const usage =
    report && report.usage !== null
      ? ` · ${report.usage} of ${report.limit} calls this minute`
      : '';
  return (
    <div className="drawer-layer" hidden={!open}>
      <div className="drawer-scrim" aria-hidden="true" onClick={close} />
      <aside
        id="data-source"
        ref={drawer}
        className="provider-panel drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-source-title"
        onKeyDown={onKeyDown}
      >
        <div className="drawer-head">
          <h2 id="data-source-title">Data source</h2>
          <button
            className="icon-button"
            aria-label="Close connection panel"
            onClick={close}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="drawer-body">
          {warning && (
            <p className="notice" role="status">
              {warning}
            </p>
          )}
          <section className="drawer-step" aria-labelledby="step-provider">
            <h3 className="step-title" id="step-provider">
              <span className="step-num done">
                <Check />
              </span>
              Provider
            </h3>
            <div
              className="segmented-control"
              role="radiogroup"
              aria-label="Market data provider"
            >
              {providerOptions.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="provider"
                    value={option.id}
                    checked={session.provider.id === option.id}
                    onChange={() => onProvider(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="small step-note">
              {yahoo
                ? 'NSE India · no API key · unofficial Yahoo Finance history for personal use.'
                : `Your own ${providerName} account and its data rights. Switching clears this session.`}
            </p>
          </section>
          {!yahoo && (
            <section className="drawer-step" aria-labelledby="step-key">
              <h3 className="step-title" id="step-key">
                <span className={`step-num${connected ? ' done' : ''}`}>
                  {connected ? <Check /> : 2}
                </span>
                API key
              </h3>
              {connected && !managingKey ? (
                <div className="done-card">
                  <div>
                    <span className="small">
                      {remember
                        ? 'Remembered on this device'
                        : 'Kept in memory for this session'}
                    </span>
                    <strong className="ok-text">Connected{usage}</strong>
                  </div>
                  <button
                    className="link-button"
                    onClick={() => setManagingKey(true)}
                  >
                    Manage
                  </button>
                </div>
              ) : (
                <form
                  className="key-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      operation.current++;
                      session.useCredential(key);
                      setConnected(true);
                      setManagingKey(false);
                      setReport(null);
                      setResults([]);
                      setSelected(null);
                      setQuery('');
                      setBusy(false);
                      setError('');
                      setStatus(
                        'Key set for this session. Search a listing to check access.',
                      );
                      onConnectionChanged();
                      setWarning(
                        writeCredential(key, remember, session.provider.id)
                          ? ''
                          : remember
                            ? 'Could not save the key. Connection works for this session only.'
                            : 'Could not remove the saved key. Session use continues; remove this site’s storage before sharing the device.',
                      );
                    } catch (failure) {
                      setError(safeError(failure));
                    }
                  }}
                >
                  <div className="field-with-icon">
                    <input
                      aria-label={`${providerName} API key`}
                      placeholder="Paste your API key"
                      type={shown ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={shown ? 'Hide key' : 'Show key'}
                      aria-pressed={shown}
                      onClick={() => setShown(!shown)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                  <div className="key-row">
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        className="switch"
                        checked={remember}
                        onChange={(event) => {
                          setRemember(event.target.checked);
                          if (!event.target.checked)
                            setWarning(
                              writeCredential('', false, session.provider.id)
                                ? ''
                                : 'Saved-key removal failed; browser storage is unavailable.',
                            );
                        }}
                      />
                      Remember on this device
                    </label>
                    <button type="submit" className="primary small-primary">
                      Use key
                    </button>
                  </div>
                </form>
              )}
              {(connected || saved.remembered) && (
                <div className="link-row">
                  <button
                    type="button"
                    className="link-button"
                    disabled={!connected || busy}
                    onClick={() => void testConnection()}
                  >
                    Test Connection
                  </button>
                  <button
                    type="button"
                    className="link-button danger"
                    disabled={!connected && !saved.remembered}
                    onClick={() => {
                      operation.current++;
                      session.disconnect();
                      setKey('');
                      setShown(false);
                      setRemember(false);
                      setConnected(false);
                      setManagingKey(true);
                      setReport(null);
                      setResults([]);
                      setSelected(null);
                      setQuery('');
                      setError('');
                      setBusy(false);
                      setStatus('Disconnected. Demo/import library retained.');
                      onConnectionChanged();
                      setWarning(
                        writeCredential('', false, session.provider.id)
                          ? ''
                          : 'Session disconnected, but saved-key deletion failed. Remove this site’s storage before sharing the device.',
                      );
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </section>
          )}
          <section className="drawer-step" aria-labelledby="step-find">
            <h3 className="step-title" id="step-find">
              <span className={`step-num${selected ? ' done' : ''}`}>
                {selected ? <Check /> : 2 + keyStep}
              </span>
              Find a stock
            </h3>
            <div className="field-with-icon search-field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchInput}
                aria-label={
                  yahoo ? 'NSE trading symbol' : 'Search symbol or company'
                }
                placeholder={
                  yahoo
                    ? 'NSE symbol, e.g. RELIANCE'
                    : 'Search symbol or company'
                }
                maxLength={80}
                disabled={!connected}
                value={query}
                onChange={(event) => {
                  if (busy) cancel();
                  setSearchCollapsed(false);
                  setQuery(event.target.value);
                  setResults([]);
                  setSelected(null);
                  setSearchStatus('');
                  setSearchError('');
                  setError('');
                }}
              />
              <kbd aria-hidden="true">/</kbd>
            </div>
            {!connected && (
              <p className="small step-note">Add your API key first.</p>
            )}
            {savedHere.length > 0 && (
              <div
                className="saved-chips"
                role="group"
                aria-label="Saved stocks"
              >
                <span className="small">Saved</span>
                {visibleSaved.map((entry) => (
                  <span className="chip" key={entry.listing.id}>
                    <button
                      aria-label={`Select saved ${listingLabel(entry.listing)}`}
                      disabled={!connected}
                      onClick={() => {
                        cancel();
                        onIntent();
                        setSelected(entry.listing);
                        setQuery('');
                        setResults([entry.listing]);
                        setError('');
                        setStatus(
                          'Saved listing selected. Choose Load history to request data.',
                        );
                      }}
                    >
                      <Star />
                      {listingLabel(entry.listing)}
                    </button>
                    <button
                      className="chip-remove"
                      aria-label={`Remove saved ${listingLabel(entry.listing)}`}
                      onClick={() =>
                        saveWatchlist(
                          watchlist.filter(
                            (item) => item.listing.id !== entry.listing.id,
                          ),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {savedHere.length > visibleSaved.length && (
                  <button
                    className="chip"
                    onClick={() => setShowAllSaved(true)}
                  >
                    +{savedHere.length - visibleSaved.length} more
                  </button>
                )}
              </div>
            )}
            {searchStatus && (
              <p className="small" role="status">
                {searchStatus}
              </p>
            )}
            {searchError && <p role="alert">{searchError}</p>}
            {results.length > 0 && (
              <ul className="provider-results">
                {results.map((listing) => (
                  <li
                    key={listing.id}
                    className={selected?.id === listing.id ? 'selected' : ''}
                  >
                    <button
                      className="result-main"
                      aria-pressed={selected?.id === listing.id}
                      onClick={() => {
                        cancel();
                        onIntent();
                        setSelected(listing);
                        setError('');
                        setStatus(
                          'Listing selected. Choose Load history to request data.',
                        );
                      }}
                    >
                      <strong>
                        {listing.symbol} ·{' '}
                        {listing.exchange ??
                          listing.mic ??
                          (listing.region
                            ? `Region: ${listing.region}`
                            : 'Exchange unavailable')}
                      </strong>
                      <span>
                        {listing.name ?? 'Name unavailable'} ·{' '}
                        {listing.mic ?? 'MIC unavailable'} ·{' '}
                        {listing.currency ?? 'Currency unavailable'} ·{' '}
                        {listing.timezone ?? 'Timezone unavailable'}
                      </span>
                    </button>
                    <button
                      className="star-button"
                      aria-label={`Save ${listingLabel(listing)}`}
                      aria-pressed={isSaved(listing)}
                      disabled={!isSaved(listing) && watchlist.length >= 30}
                      onClick={() => toggleSaved(listing)}
                    >
                      <Star />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="drawer-step" aria-labelledby="step-load">
            <h3 className="step-title" id="step-load">
              <span className="step-num">{3 + keyStep}</span>
              Load history
              {selected && (
                <span className="step-meta">{listingLabel(selected)}</span>
              )}
            </h3>
            {alpha && (
              <div className="two-up">
                <select
                  aria-label="Provider interval"
                  value={interval}
                  onChange={(event) => {
                    if (busy) cancel();
                    setInterval(
                      event.target.value as Dataset['metadata']['interval'],
                    );
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly - native</option>
                  <option value="monthly">Monthly - native</option>
                </select>
                <select
                  aria-label="Daily history access"
                  value={historySize}
                  disabled={interval !== 'daily'}
                  onChange={(event) => {
                    if (busy) cancel();
                    setHistorySize(event.target.value as 'compact' | 'full');
                  }}
                >
                  <option value="compact">Compact - latest 100 bars</option>
                  <option value="full">Full - premium required</option>
                </select>
              </div>
            )}
            <div className="two-up">
              <select
                aria-label="History window"
                value={window}
                onChange={(event) => {
                  if (busy) cancel();
                  setWindow(event.target.value as HistoryWindow);
                }}
              >
                <option value="1Y">1 year + warm-up</option>
                <option value="3Y">3 years + warm-up</option>
                <option value="5Y">5 years + warm-up</option>
              </select>
              <select
                aria-label="Provider price adjustment"
                value={adjustment}
                disabled={alpha || yahoo}
                onChange={(event) => {
                  if (busy) cancel();
                  setAdjustment(event.target.value as 'raw' | 'adjusted');
                }}
              >
                <option value="raw">
                  {yahoo ? 'Yahoo OHLC · unverified' : 'Raw prices'}
                </option>
                {!yahoo && <option value="adjusted">Adjusted prices</option>}
              </select>
            </div>
            <button
              className="primary load-button"
              disabled={!connected || !selected || busy}
              onClick={() => void load()}
            >
              Load history
            </button>
            <div className="link-row">
              <button
                className="link-button"
                disabled={
                  !connected || activeDataset?.metadata.mode !== 'live' || busy
                }
                onClick={() => void load(true)}
              >
                Refresh loaded data
              </button>
              {busy ? (
                <button className="link-button" onClick={cancel}>
                  Cancel provider request
                </button>
              ) : (
                <span className="small">
                  {yahoo
                    ? 'Fetched only when you load'
                    : 'Uses provider credits'}
                </span>
              )}
            </div>
            {status && (
              <p className="small" role="status" aria-busy={busy}>
                {status}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </div>
        <div className="drawer-foot">
          <details>
            <summary>Details &amp; limits</summary>
            <div className="details-body small">
              {yahoo ? (
                <p>
                  Enter an NSE trading symbol, such as RELIANCE, TCS, or INFY;
                  .NS is added automatically. Company-name lookup is not
                  supported. Yahoo requests use the local app connection
                  included in npm run dev and npm run preview. Static hosting
                  alone does not include this connection. A symbol candidate is
                  not proof of available Yahoo history; Load history checks it.
                </p>
              ) : (
                <>
                  <p>
                    Keys stay in memory by default. Remember saves the key when
                    you choose Use key; browser storage is not an OS credential
                    vault. Test Connection, debounced search and history
                    requests may consume provider credits. Nothing fetches
                    automatically on reload or refreshes on focus.
                  </p>
                  <p>
                    {connected ? 'Key available' : 'Disconnected'} ·{' '}
                    {report
                      ? report.usage === null
                        ? `Search test checked at ${report.checkedAt}. Usage, limits and account plan unavailable.`
                        : `Provider-reported usage: ${report.usage}/${report.limit} for the minute when checked at ${report.checkedAt}. This is not a current remaining-credit counter.`
                      : 'Account plan and listing access unverified.'}{' '}
                    Search results do not prove subscription access.
                  </p>
                </>
              )}
              <p>
                {alpha
                  ? 'Daily compact: latest 100 bars; full daily requires premium. Weekly/monthly endpoints use native last-trading-day labels. Adjusted-close feeds are excluded. Keys are required in the request query; browser developer tools can see them.'
                  : `Daily only - up to 5,000 bars per request - warm-up allowance ${warmupBars.toLocaleString('en-US')} observed bars plus calendar margin.`}{' '}
                Actual coverage decides availability. Controls do not fetch;
                choose Load history explicitly.
              </p>
              {selected && (
                <ul>
                  {session.provider
                    .getCapabilities(selected, session.accessProfile)
                    .unavailableFeatures.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                </ul>
              )}
              <p>
                Session cache only: at most five datasets, 25,000 bars and 20
                MiB. Load may reuse a matching dataset fetched in the same
                exchange date; Refresh bypasses reuse. No automatic retries,
                provider indicator endpoints or shared credentials. Saved
                stocks: up to 30, kept in this browser.{' '}
                {yahoo
                  ? 'Use Yahoo data only within your permitted personal-use rights.'
                  : 'Use your own account within its data/display rights.'}
              </p>
            </div>
          </details>
          <span className="foot-links small">
            <a
              href={
                yahoo
                  ? 'https://finance.yahoo.com/'
                  : alpha
                    ? 'https://www.alphavantage.co/premium/'
                    : 'https://twelvedata.com/pricing'
              }
              target="_blank"
              rel="noreferrer"
            >
              {yahoo ? 'Yahoo Finance' : 'Pricing'}
            </a>{' '}
            ·{' '}
            <a
              href={
                yahoo
                  ? 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html'
                  : alpha
                    ? 'https://www.alphavantage.co/terms_of_service/'
                    : 'https://twelvedata.com/terms'
              }
              target="_blank"
              rel="noreferrer"
            >
              Terms
            </a>
          </span>
        </div>
      </aside>
    </div>
  );
}
