import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, Listing, TradingDate } from '../../data/types';
import { LiveSession } from '../../providers/live-session';
import { exchangeDate, MAX_PROVIDER_BARS } from '../../providers/twelve-data';
import { ProviderError } from '../../providers/types';
import type { HistoryRequest } from '../../providers/types';
import { YahooFinanceProvider } from '../../providers/yahoo-finance';

const countries = {
  india: {
    label: 'India (NSE)',
    placeholder: 'Company or NSE symbol, e.g. Reliance',
  },
  us: {
    label: 'United States (NASDAQ · NYSE)',
    placeholder: 'Company or ticker, e.g. Apple or AAPL',
  },
} as const;
type Country = keyof typeof countries;
const spans = [3, 5, 10, 15] as const;
type Span = (typeof spans)[number];

const listingLabel = (listing: Listing) =>
  `${listing.symbol} · ${listing.exchange ?? listing.mic ?? 'Exchange unavailable'}`;
const safeError = (error: unknown) =>
  error instanceof ProviderError
    ? error.message
    : 'The request failed. Nothing was loaded.';

/** Daily history ending today, going back `years`, within the provider's bar cap. */
function request(
  listing: Listing,
  years: Span,
  session: LiveSession,
): HistoryRequest {
  const to = exchangeDate(listing.timezone);
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  // A month earlier, so the first month shown still has a previous close.
  from.setUTCDate(from.getUTCDate() - 35);
  const oldest = new Date(`${to}T12:00:00Z`);
  oldest.setUTCDate(
    oldest.getUTCDate() - Math.floor((MAX_PROVIDER_BARS * 7) / 5) + 7,
  );
  if (from < oldest) from.setTime(oldest.getTime());
  return {
    listing,
    interval: 'daily',
    adjustment: 'unknown',
    from: from.toISOString().slice(0, 10) as TradingDate,
    to,
    accessProfile: session.accessProfile,
  };
}

/**
 * Finds a stock and loads its daily history for the Monthly returns page. It
 * has its own Yahoo session, so choosing a stock here never changes the Chart
 * page, and the Chart page never changes this one.
 */
export function MonthlyStockPicker({
  loaded,
  chartDataset,
  onDataset,
}: {
  /** The stock currently shown on this page. */
  loaded: Dataset | null;
  /** The Chart page's stock, offered as a one-time copy, never as a link. */
  chartDataset: Dataset | null;
  onDataset: (dataset: Dataset) => void;
}) {
  const session = useMemo(
    () => new LiveSession(new YahooFinanceProvider()),
    [],
  );
  const [country, setCountry] = useState<Country>('india');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [years, setYears] = useState<Span>(10);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const operation = useRef(0);
  useEffect(() => () => session.cancel(), [session]);

  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const current = ++generation.current;
    const timer = setTimeout(() => {
      setStatus('Searching Yahoo Finance…');
      void session
        .search(query, { market: country })
        .then((matches) => {
          if (current !== generation.current) return;
          setResults(matches);
          setError('');
          setStatus(
            matches.length
              ? `${matches.length} stock/ETF matches. Select one, then Load monthly returns.`
              : 'No supported stock/ETF matches. Try another symbol or company name.',
          );
        })
        .catch((failure) => {
          if (
            current !== generation.current ||
            (failure instanceof ProviderError &&
              failure.category === 'cancelled')
          )
            return;
          setStatus('');
          setError(safeError(failure));
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      generation.current = current + 1;
      session.cancelSearch();
    };
  }, [query, country, selected, session]);

  async function load() {
    if (!selected) return;
    const token = ++operation.current;
    session.cancelSearch();
    setBusy(true);
    setError('');
    setStatus('Loading daily history…');
    try {
      const dataset = await session.load(request(selected, years, session));
      if (token !== operation.current) return;
      onDataset(dataset);
      setStatus(
        `Loaded ${dataset.candles.length.toLocaleString('en-US')} daily bars, ${dataset.metadata.coverage?.from} – ${dataset.metadata.coverage?.to}.`,
      );
    } catch (failure) {
      if (
        token !== operation.current ||
        (failure instanceof ProviderError && failure.category === 'cancelled')
      )
        return;
      setError(safeError(failure));
      setStatus(
        loaded
          ? 'History was not loaded. The monthly returns shown are unchanged.'
          : 'History was not loaded.',
      );
    } finally {
      if (token === operation.current) setBusy(false);
    }
  }

  const copyable =
    chartDataset &&
    chartDataset.metadata.interval === 'daily' &&
    chartDataset.metadata.id !== loaded?.metadata.id
      ? chartDataset
      : null;

  return (
    <form
      className="correlation-controls seasonality-picker"
      onSubmit={(event) => {
        event.preventDefault();
        void load();
      }}
    >
      <label>
        Country
        <select
          aria-label="Country"
          value={country}
          onChange={(event) => {
            operation.current++;
            session.cancel();
            setBusy(false);
            setCountry(event.target.value as Country);
            setResults([]);
            setSelected(null);
            setStatus('');
            setError('');
          }}
        >
          {Object.entries(countries).map(([id, item]) => (
            <option key={id} value={id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="seasonality-search">
        Stock
        <input
          aria-label="Search stock for monthly returns"
          placeholder={countries[country].placeholder}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            operation.current++;
            setBusy(false);
            setQuery(event.target.value);
            setResults([]);
            setSelected(null);
            setStatus('');
            setError('');
          }}
        />
      </label>
      <label>
        History
        <select
          aria-label="History length"
          value={years}
          onChange={(event) => setYears(Number(event.target.value) as Span)}
        >
          {spans.map((span) => (
            <option key={span} value={span}>
              {span} years
            </option>
          ))}
        </select>
      </label>
      {status && (
        <p className="small seasonality-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="seasonality-status" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul className="provider-results seasonality-results">
          {results.map((listing) => (
            <li key={listing.id}>
              <button
                type="button"
                aria-pressed={selected?.id === listing.id}
                onClick={() => {
                  setSelected(listing);
                  setResults([listing]);
                  setStatus(
                    'Stock selected. Choose Load monthly returns to request its history.',
                  );
                }}
              >
                {listingLabel(listing)}
                {listing.name && <span>{listing.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="provider-actions">
        <button className="primary" type="submit" disabled={!selected || busy}>
          Load monthly returns
        </button>
        {copyable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              operation.current++;
              session.cancel();
              setBusy(false);
              onDataset(copyable);
              setSelected(null);
              setResults([]);
              setQuery('');
              setError('');
              setStatus(
                `Copied ${copyable.metadata.listing.symbol} from the Chart tab. Changing it there will not change this page.`,
              );
            }}
          >
            Copy {copyable.metadata.listing.symbol} from the Chart tab
          </button>
        )}
      </div>
    </form>
  );
}
