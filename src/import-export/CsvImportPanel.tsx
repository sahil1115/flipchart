import { useRef, useState } from 'react';
import { GlassPanel } from '../components/GlassPanel';
import type { Dataset } from '../data/types';
import {
  CSV_TEMPLATE,
  CsvImportError,
  importCsv,
  MAX_FILE_BYTES,
  parseCsv,
  suggestMapping,
} from './csv';
import type {
  ColumnMapping,
  CsvField,
  DateFormat,
  ImportOptions,
  NumberFormat,
  ParsedCsv,
} from './csv';

interface Props {
  onImport: (dataset: Dataset) => void;
  onCancel: () => void;
}
const fields: CsvField[] = ['date', 'open', 'high', 'low', 'close', 'volume'];
const defaults: ImportOptions = {
  symbol: '',
  name: '',
  exchange: '',
  currency: '',
  timezone: '',
  adjustment: 'unknown',
  dateFormat: 'iso-date',
  numberFormat: 'dot',
};
const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

export function CsvImportPanel({ onImport, onCancel }: Props) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: -1,
    open: -1,
    high: -1,
    low: -1,
    close: -1,
    volume: -1,
  });
  const [options, setOptions] = useState(defaults);
  const [delimiter, setDelimiter] = useState(',');
  const [issues, setIssues] = useState<string[]>([]);
  const [review, setReview] = useState<{
    dataset: Dataset;
    warnings: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const errorMessages = (error: unknown) =>
    error instanceof CsvImportError
      ? error.issues
      : [
          error instanceof Error
            ? error.message
            : 'The file could not be read.',
        ];
  function parse(text: string, separator: string) {
    setReview(null);
    setIssues([]);
    try {
      const next = parseCsv(text, separator);
      setParsed(next);
      setMapping(suggestMapping(next.headers));
    } catch (error) {
      setParsed(null);
      setIssues(errorMessages(error));
    }
  }
  async function readFile(selected: File | undefined) {
    const token = ++generation.current;
    setParsed(null);
    setReview(null);
    setIssues([]);
    setFile(null);
    if (!selected) return;
    if (selected.size > MAX_FILE_BYTES) {
      setIssues([
        'File exceeds the 10 MiB limit. Split the history into smaller files.',
      ]);
      return;
    }
    setBusy(true);
    try {
      const text = await selected.text();
      if (token !== generation.current) return;
      setFile({ name: selected.name, text });
      parse(text, delimiter);
    } catch {
      if (token === generation.current)
        setIssues(['Could not read the local file. Choose the file again.']);
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function updateOption<K extends keyof ImportOptions>(
    key: K,
    value: ImportOptions[K],
  ) {
    setOptions({ ...options, [key]: value });
    setReview(null);
    setIssues([]);
  }
  function validate() {
    if (!parsed || !file) return;
    setIssues([]);
    try {
      setReview(
        importCsv(
          parsed,
          mapping,
          options,
          file.name,
          crypto.randomUUID(),
          new Date().toISOString(),
        ),
      );
    } catch (error) {
      setReview(null);
      setIssues(errorMessages(error));
    }
  }
  return (
    <GlassPanel className="import-panel" aria-label="CSV import">
      <div className="panel-heading">
        <div>
          <span className="badge">LOCAL IMPORT</span>
          <h2>Bring your own daily data</h2>
          <p>
            The file stays in this browser. Preview and validate before loading.
          </p>
        </div>
        <button onClick={onCancel}>Cancel import</button>
      </div>
      <div className="import-upload">
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <label>
          Delimiter
          <select
            aria-label="Delimiter"
            value={delimiter}
            onChange={(event) => {
              setDelimiter(event.target.value);
              if (file) parse(file.text, event.target.value);
            }}
          >
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value={'\t'}>Tab</option>
          </select>
        </label>
        <a href={templateUrl} download="flipchart-daily-template.csv">
          Download CSV template
        </a>
      </div>
      <p className="small">
        UTF-8 with a header · maximum 10 MiB and 50,000 rows · required date,
        open, high, low, close · optional volume. Empty volume stays unknown.
        Blank records are skipped; errors use CSV record numbers, with the
        header as record 1.
      </p>
      {busy && <p role="status">Reading your local file…</p>}
      {issues.length > 0 && (
        <div className="import-errors" role="alert">
          <h3>Check the file or import settings</h3>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
          <p className="small">
            No partial data was loaded. Up to 20 errors are shown.
          </p>
        </div>
      )}
      {parsed && (
        <>
          <h3>1. Map the columns</h3>
          <div className="mapping-grid">
            {fields.map((field) => (
              <label key={field}>
                {field === 'volume'
                  ? 'Volume (optional)'
                  : `${field[0]!.toUpperCase()}${field.slice(1)} column`}
                <select
                  aria-label={
                    field === 'volume' ? 'Volume column' : `${field} column`
                  }
                  value={mapping[field]}
                  onChange={(event) => {
                    setMapping({
                      ...mapping,
                      [field]: Number(event.target.value),
                    });
                    setReview(null);
                    setIssues([]);
                  }}
                >
                  <option value={-1}>
                    {field === 'volume'
                      ? 'Unavailable / not included'
                      : 'Choose a column'}
                  </option>
                  {parsed.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h3>2. Declare the data conventions</h3>
          <div className="import-options">
            <label>
              Listing symbol
              <input
                value={options.symbol}
                maxLength={80}
                placeholder="Your symbol or label"
                onChange={(event) => updateOption('symbol', event.target.value)}
              />
            </label>
            <label>
              Listing name (optional)
              <input
                value={options.name}
                maxLength={200}
                onChange={(event) => updateOption('name', event.target.value)}
              />
            </label>
            <label>
              Exchange (optional)
              <input
                value={options.exchange}
                maxLength={100}
                placeholder="Unavailable if blank"
                onChange={(event) =>
                  updateOption('exchange', event.target.value)
                }
              />
            </label>
            <label>
              Currency
              <input
                value={options.currency}
                maxLength={3}
                placeholder="USD, INR, …"
                onChange={(event) =>
                  updateOption('currency', event.target.value.toUpperCase())
                }
              />
            </label>
            <label>
              Exchange timezone
              <input
                value={options.timezone}
                maxLength={100}
                placeholder="America/New_York, Asia/Kolkata, UTC"
                onChange={(event) =>
                  updateOption('timezone', event.target.value)
                }
              />
            </label>
            <label>
              Input interval
              <select
                aria-label="Input interval"
                value="daily"
                onChange={() => {}}
              >
                <option value="daily">Daily</option>
                <option disabled>
                  Weekly · aggregate after loading daily CSV
                </option>
                <option disabled>
                  Monthly · aggregate after loading daily CSV
                </option>
              </select>
            </label>
            <label>
              Date format
              <select
                aria-label="Date format"
                value={options.dateFormat}
                onChange={(event) =>
                  updateOption('dateFormat', event.target.value as DateFormat)
                }
              >
                <option value="iso-date">YYYY-MM-DD (date only)</option>
                <option value="day-first">
                  DD/MM/YYYY (explicit day first)
                </option>
                <option value="month-first">
                  MM/DD/YYYY (explicit month first)
                </option>
                <option value="iso-timestamp">
                  ISO timestamp with explicit offset
                </option>
              </select>
            </label>
            <label>
              Number format
              <select
                aria-label="Number format"
                value={options.numberFormat}
                onChange={(event) =>
                  updateOption(
                    'numberFormat',
                    event.target.value as NumberFormat,
                  )
                }
              >
                <option value="dot">Dot decimal · no thousands</option>
                <option value="comma">Comma decimal · no thousands</option>
              </select>
            </label>
            <label>
              Price adjustment
              <select
                aria-label="Price adjustment"
                value={options.adjustment}
                onChange={(event) =>
                  updateOption(
                    'adjustment',
                    event.target.value as ImportOptions['adjustment'],
                  )
                }
              >
                <option value="unknown">Unknown (declared)</option>
                <option value="raw">Raw / unadjusted</option>
                <option value="adjusted">All OHLC consistently adjusted</option>
              </select>
            </label>
          </div>
          <p className="small">
            Date-only values are preserved. ISO timestamps must include Z or an
            offset and are converted to your exchange date. Offset-free local
            timestamps and intraday files are unsupported. Declare adjustments
            for the entire OHLC series; adjusted close alone is not enough.
          </p>
          <label className="checkbox-label import-finalization">
            <input
              type="checkbox"
              checked={options.trailingIncomplete ?? false}
              onChange={(event) =>
                updateOption('trailingIncomplete', event.target.checked)
              }
            />{' '}
            Last daily candle is incomplete
          </label>
          <p className="small">
            Daily candles are treated as finalized unless the last candle is
            marked incomplete. Mark it if its session is still in progress.
          </p>
          <h3>3. Preview the input</h3>
          <p className="small">
            {parsed.rows.length.toLocaleString('en-US')} data records · first
            five shown exactly as parsed; validation and chronological sorting
            happen below. Scroll the preview horizontally on narrow screens.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            aria-label="CSV preview, scroll horizontally if needed"
          >
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  {parsed.headers.map((header, i) => (
                    <th key={i}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row) => (
                  <tr key={row.record}>
                    <th>{row.record}</th>
                    {row.values.map((value, i) => (
                      <td key={i}>{value === '' ? '—' : value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-actions">
            <button className="primary" onClick={validate}>
              Validate data
            </button>
            <span className="small">
              Validation never repairs OHLC errors, fills missing sessions, or
              guesses locale formats.
            </span>
          </div>
        </>
      )}
      {review && (
        <div className="import-review" role="status">
          <h3>
            Ready to load{' '}
            {review.dataset.candles.length.toLocaleString('en-US')} daily bars
          </h3>
          <p>
            {review.dataset.metadata.listing.symbol} ·{' '}
            {review.dataset.metadata.listing.currency} ·{' '}
            {review.dataset.metadata.listing.timezone} ·{' '}
            {review.dataset.metadata.adjustment} prices
          </p>
          <p>
            Coverage {review.dataset.metadata.coverage?.from} –{' '}
            {review.dataset.metadata.coverage?.to}
          </p>
          {review.warnings.length > 0 && (
            <ul>
              {review.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <button className="primary" onClick={() => onImport(review.dataset)}>
            Load imported data
          </button>
        </div>
      )}
    </GlassPanel>
  );
}
