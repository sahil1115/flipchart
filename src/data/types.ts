/** Daily bars retain their source date; never convert these into local timestamps. */
export type TradingDate = `${number}-${number}-${number}`;
export interface Candle {
  time: TradingDate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  incomplete?: boolean;
}
export interface Listing {
  region?: string | null;
  id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  mic: string | null;
  currency: string | null;
  timezone: string | null;
}
export interface Dataset {
  candles: Candle[];
  metadata: {
    id: string;
    revision: string;
    mode: 'demo' | 'import' | 'live';
    source: string;
    provider: string | null;
    listing: Listing;
    interval: 'daily' | 'weekly' | 'monthly';
    adjustment: 'synthetic' | 'raw' | 'adjusted' | 'unknown';
    requestedRange: { from: TradingDate; to: TradingDate } | null;
    coverage: { from: TradingDate; to: TradingDate } | null;
    retrievedAt: string;
    latestCandleTime: TradingDate | null;
    freshness:
      'historical-demo' | 'historical-import' | 'fresh' | 'stale' | 'unknown';
    delay: 'synthetic' | 'end-of-day' | 'delayed' | 'unknown';
    aggregation: string | null;
    importConventions?: {
      filename: string;
      dateFormat: string;
      numberFormat: string;
      timezoneInterpretation: string;
    };
    aggregationDetails?: {
      sourceInterval: 'daily';
      sourceCoverage: { from: TradingDate; to: TradingDate } | null;
      calendar: 'UTC weekdays; exchange holidays unverified';
      groups: {
        time: TradingDate;
        from: TradingDate;
        to: TradingDate;
        count: number;
        partial: boolean;
      }[];
    };
  };
}
