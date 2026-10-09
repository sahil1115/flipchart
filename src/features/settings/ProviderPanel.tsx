import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from '../../components/GlassPanel';
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
  const providerName = alpha ? 'Alpha Vantage' : 'Twelve Data';
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
  const searchInput = useRef<HTMLInputElement>(null),
    operation = useRef(0),
    searchGeneration = useRef(0);
  useEffect(() => {
    if (!open || !connected || searchCollapsed || query.trim().length < 2)
      return;
    const generation = ++searchGeneration.current;
    const timer = setTimeout(() => {
      setSearchStatus('Searching Twelve Data…');
      void session
        .search(query)
        .then((matches) => {
          if (generation !== searchGeneration.current) return;
          setResults(matches);
          setSearchStatus(
            matches.length
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
  }, [open, connected, query, session, providerName, searchCollapsed]);
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
    setStatus('Testing Twelve Data connection…');
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
        : { ...baseRequest, interval, historySize };
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
      setStatus(
        `Loaded ${dataset.candles.length.toLocaleString('en-US')} ${dataset.metadata.interval} bars. Actual coverage ${dataset.metadata.coverage?.from} – ${dataset.metadata.coverage?.to}.`,
      );
    } catch (error) {
      if (
        localToken !== operation.current ||
        (error instanceof ProviderError && error.category === 'cancelled')
      )
        return;
      setError(safeError(error));
      setStatus('Loaded chart retained.');
      if (refresh) onRefreshFailure(token);
    } finally {
      if (localToken === operation.current) setBusy(false);
    }
  }
  return (
    <GlassPanel
      className="provider-panel"
      aria-label={`${providerName} connection`}
      hidden={!open}
    >
      <div className="panel-heading">
        <div>
          <h2>Connect {providerName}</h2>
          <p>
            Direct browser connection · use your own account within its data
            access and display rights.
          </p>
        </div>
        <button
          onClick={() => {
            cancel();
            setQuery('');
            onClose();
          }}
        >
          Close connection panel
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            operation.current++;
            session.useCredential(key);
            setConnected(true);
            setReport(null);
            setResults([]);
            setSelected(null);
            setQuery('');
            setBusy(false);
            setError('');
            setStatus(
              'Key set for this session. Test Connection or search a listing to check access.',
            );
            onConnectionChanged();
            setWarning(
              writeCredential(key, remember, session.provider.id)
                ? ''
                : remember
                  ? 'Could not save the key. Connection works for this session only.'
                  : 'Could not remove the saved key. Session use continues; remove this site’s storage before sharing the device.',
            );
          } catch (error) {
            setError(safeError(error));
          }
        }}
      >
        <label>
          API key
          <input
            aria-label={`${providerName} API key`}
            type={shown ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <div className="provider-actions">
          <button
            type="button"
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? 'Hide key' : 'Show key'}
          </button>
          <button type="submit">Use key</button>
          <button
            type="button"
            disabled={!connected || busy}
            onClick={() => void testConnection()}
          >
            Test Connection
          </button>
          <button
            type="button"
            disabled={!connected && !saved.remembered}
            onClick={() => {
              operation.current++;
              session.disconnect();
              setKey('');
              setShown(false);
              setRemember(false);
              setConnected(false);
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
        <label className="checkbox-label">
          <input
            type="checkbox"
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
        <p className="small">
          Keys stay in memory by default. Remember saves the key when you choose
          Use key; browser storage is not an OS credential vault. Test
          Connection, debounced search and history requests may consume provider
          credits. Nothing fetches automatically on reload or refreshes on
          focus.
        </p>
      </form>
      {warning && (
        <p className="notice" role="status">
          {warning}
        </p>
      )}
      <p className="small">
        {connected ? 'Key available' : 'Disconnected'} ·{' '}
        {report
          ? report.usage === null
            ? `Search test checked at ${report.checkedAt}. Usage, limits and account plan unavailable.`
            : `Provider-reported usage: ${report.usage}/${report.limit} for the minute when checked at ${report.checkedAt}. This is not a current remaining-credit counter.`
          : 'Account plan and listing access unverified.'}
      </p>
      <section aria-label="Local watchlist">
        <h3>Watchlist</h3>
        <p className="small">
          Up to 30 provider-specific listings, saved locally. Selecting an entry
          never fetches all symbols; choose Load history for the selected
          listing.
        </p>
        {selected && (
          <button
            disabled={
              watchlist.length >= 30 ||
              watchlist.some((entry) => entry.listing.id === selected.id)
            }
            onClick={() =>
              saveWatchlist([
                ...watchlist,
                { provider: session.provider.id, listing: selected },
              ])
            }
          >
            Add selected listing to watchlist
          </button>
        )}
        <ul>
          {watchlist
            .filter((entry) => entry.provider === session.provider.id)
            .map((entry) => (
              <li key={entry.listing.id}>
                <button
                  disabled={!connected}
                  onClick={() => {
                    cancel();
                    onIntent();
                    setSelected(entry.listing);
                    setQuery('');
                    setResults([]);
                    setError('');
                    setStatus(
                      'Watchlist listing selected. Choose Load history to request data.',
                    );
                  }}
                >
                  Select watchlist {entry.listing.symbol}
                </button>
                <button
                  aria-label={`Remove watchlist ${entry.listing.symbol}`}
                  onClick={() =>
                    saveWatchlist(
                      watchlist.filter(
                        (item) => item.listing.id !== entry.listing.id,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
        </ul>
      </section>
      <div className="provider-search">
        <label>
          Search symbol or company
          <input
            ref={searchInput}
            aria-label="Search symbol or company"
            placeholder="Type at least 2 characters"
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
        </label>
        <p className="small">
          Search waits for a pause in typing. Press / outside an input to focus
          search. Choose an exchange match; search results do not prove
          subscription access.
        </p>
      </div>
      {searchStatus && <p role="status">{searchStatus}</p>}
      {searchError && <p role="alert">{searchError}</p>}
      <ul className="provider-results">
        {results.map((listing) => (
          <li key={listing.id}>
            <button
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
          </li>
        ))}
      </ul>
      {selected && (
        <p>
          Selected:{' '}
          <strong>
            {selected.symbol} ·{' '}
            {selected.exchange ??
              selected.mic ??
              (selected.region
                ? `Region: ${selected.region}`
                : 'Exchange unavailable')}
          </strong>
        </p>
      )}
      {alpha && (
        <div className="provider-history">
          <label>
            Provider interval
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
          </label>
          <label>
            Daily history access
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
          </label>
        </div>
      )}
      <div className="provider-history">
        <label>
          History window
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
        </label>
        <label>
          Provider price adjustment
          <select
            aria-label="Provider price adjustment"
            value={adjustment}
            disabled={alpha}
            onChange={(event) => {
              if (busy) cancel();
              setAdjustment(event.target.value as 'raw' | 'adjusted');
            }}
          >
            <option value="raw">Raw · adjust=none</option>
            <option value="adjusted">Adjusted OHLC · adjust=all</option>
          </select>
        </label>
      </div>
      <p className="small">
        {alpha
          ? 'Daily compact: latest 100 bars; full daily requires premium. Weekly/monthly endpoints use native last-trading-day labels. Adjusted-close feeds are excluded. Keys are required in the request query; browser developer tools can see them.'
          : `Daily only - up to 5,000 bars per request - warm-up allowance ${warmupBars.toLocaleString('en-US')} observed bars plus calendar margin.`}{' '}
        Actual coverage decides availability. Controls do not fetch; choose Load
        history explicitly.
      </p>
      {selected && (
        <ul className="small">
          {session.provider
            .getCapabilities(selected, session.accessProfile)
            .unavailableFeatures.map((value) => (
              <li key={value}>{value}</li>
            ))}
        </ul>
      )}
      <div className="provider-actions">
        <button
          className="primary"
          disabled={!connected || !selected || busy}
          onClick={() => void load()}
        >
          Load history
        </button>
        <button
          disabled={
            !connected || activeDataset?.metadata.mode !== 'live' || busy
          }
          onClick={() => void load(true)}
        >
          Refresh loaded data
        </button>
        {busy && <button onClick={cancel}>Cancel provider request</button>}
      </div>
      {status && (
        <p role="status" aria-busy={busy}>
          {status}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="small">
        Session cache only: at most five datasets, 25,000 bars and 20 MiB. Load
        may reuse a matching dataset fetched in the same exchange date; Refresh
        bypasses reuse. No automatic retries, provider indicator endpoints or
        shared credentials. Use your own account within its data/display rights.{' '}
        <a
          href={
            alpha
              ? 'https://www.alphavantage.co/premium/'
              : 'https://twelvedata.com/pricing'
          }
          target="_blank"
          rel="noreferrer"
        >
          Provider access and pricing
        </a>{' '}
        ·{' '}
        <a
          href={
            alpha
              ? 'https://www.alphavantage.co/terms_of_service/'
              : 'https://twelvedata.com/terms'
          }
          target="_blank"
          rel="noreferrer"
        >
          Provider terms
        </a>
      </p>
    </GlassPanel>
  );
}
