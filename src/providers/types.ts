import type { Dataset, Listing, TradingDate } from '../data/types';

export type ProviderErrorCategory =
  | 'missing-key'
  | 'invalid-key'
  | 'quota-exhausted'
  | 'unsupported-listing'
  | 'unsupported-interval'
  | 'unsupported-endpoint'
  | 'insufficient-history'
  | 'empty-response'
  | 'network-cors'
  | 'provider-outage'
  | 'malformed-response'
  | 'cancelled';
export class ProviderError extends Error {
  constructor(
    public readonly category: ProviderErrorCategory,
    safeMessage: string,
    public readonly retryAt: string | null = null,
  ) {
    super(safeMessage);
    this.name = 'ProviderError';
  }
}
/** Credential arguments are memory-only inputs, never part of dataset metadata. */
export interface AccessProfile {
  sessionId: string;
  plan: string | null;
}
export interface ProviderCapabilities {
  intervals: Dataset['metadata']['interval'][];
  adjustmentModes: Dataset['metadata']['adjustment'][];
  historyLimit: { maxBars: number | null; earliestDate: TradingDate | null };
  unavailableFeatures: string[];
  access: 'known' | 'unknown';
}
export interface HistoryRequest {
  historySize?: 'compact' | 'full';
  listing: Listing;
  interval: Dataset['metadata']['interval'];
  adjustment: Dataset['metadata']['adjustment'];
  from: TradingDate;
  to: TradingDate;
  accessProfile: AccessProfile;
}
export interface MarketDataProvider {
  readonly id: string;
  searchSymbol(
    query: string,
    credential: string,
    abortSignal: AbortSignal,
  ): Promise<Listing[]>;
  getCapabilities(
    listing: Listing,
    accessProfile: AccessProfile,
  ): ProviderCapabilities;
  getOHLCV(
    request: HistoryRequest,
    credential: string,
    abortSignal: AbortSignal,
  ): Promise<Dataset>;
}
