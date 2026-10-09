import { requireOnline } from '../pwa/network';
import { QueryClient, isCancelledError } from '@tanstack/react-query';
import type { Dataset, Listing, TradingDate } from '../data/types';
import type { HistoryRequest, AccessProfile } from './types';
import { ProviderError } from './types';
import type { ConnectedProvider } from './twelve-data';
import { exchangeDate, validateCredential } from './twelve-data';

export type HistoryWindow = '1Y' | '3Y' | '5Y';
export function historyRequest(
  listing: Listing,
  window: HistoryWindow,
  adjustment: 'raw' | 'adjusted',
  accessProfile: AccessProfile,
  warmupBars: number,
  now: Date = new Date(),
): HistoryRequest {
  const to = exchangeDate(listing.timezone, now),
    date = new Date(`${to}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - Number(window.slice(0, -1)));
  // Approximate calendar allowance for observed sessions, not a fabricated
  // exchange calendar. Returned coverage/count decide actual availability.
  date.setUTCDate(
    date.getUTCDate() -
      Math.ceil((Math.min(5300, Math.max(300, warmupBars)) * 7) / 5) -
      30,
  );
  return {
    listing,
    interval: 'daily',
    adjustment,
    from: date.toISOString().slice(0, 10) as TradingDate,
    to,
    accessProfile,
  };
}
export function historyKey(
  providerId: string,
  request: HistoryRequest,
  sessionDate: TradingDate,
) {
  return [
    'provider-history',
    providerId,
    request.accessProfile.sessionId,
    request.accessProfile.plan,
    request.listing.id,
    request.listing.symbol,
    request.listing.exchange,
    request.listing.mic,
    request.listing.currency,
    request.listing.timezone,
    request.interval,
    request.from,
    request.to,
    request.adjustment,
    request.historySize ?? null,
    sessionDate,
  ] as const;
}
export class LiveSession {
  readonly queries = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
      },
    },
  });
  private credential = '';
  private profile: AccessProfile = {
    sessionId: crypto.randomUUID(),
    plan: null,
  };
  private epoch = 0;
  private searchController: AbortController | null = null;
  private testController: AbortController | null = null;
  private active: { key: string; promise: Promise<Dataset> } | null = null;
  constructor(
    readonly provider: ConnectedProvider,
    credential = '',
  ) {
    if (credential) this.credential = validateCredential(credential);
  }
  get connected() {
    return this.credential !== '';
  }
  get accessProfile(): AccessProfile {
    return { ...this.profile };
  }
  useCredential(value: string) {
    const credential = validateCredential(value);
    this.cancel();
    this.queries.clear();
    this.credential = credential;
    this.profile = { sessionId: crypto.randomUUID(), plan: null };
  }
  cancelSearch() {
    this.searchController?.abort();
    this.searchController = null;
  }
  cancel() {
    this.epoch++;
    this.cancelSearch();
    this.testController?.abort();
    this.testController = null;
    this.active = null;
    void this.queries.cancelQueries({ queryKey: ['provider-history'] });
  }
  clearCache() {
    this.cancel();
    this.queries.clear();
  }
  disconnect() {
    this.clearCache();
    this.credential = '';
    this.profile = { sessionId: crypto.randomUUID(), plan: null };
  }
  async search(query: string) {
    requireOnline();
    this.cancelSearch();
    const controller = new AbortController();
    this.searchController = controller;
    const epoch = this.epoch;
    const result = await this.provider.searchSymbol(
      query,
      this.credential,
      controller.signal,
    );
    if (controller.signal.aborted || epoch !== this.epoch)
      throw new ProviderError(
        'cancelled',
        'The obsolete search was cancelled.',
      );
    return result;
  }
  async testConnection() {
    requireOnline();
    this.testController?.abort();
    const controller = new AbortController();
    this.testController = controller;
    const epoch = this.epoch;
    const result = await this.provider.testConnection(
      this.credential,
      controller.signal,
    );
    if (controller.signal.aborted || epoch !== this.epoch)
      throw new ProviderError(
        'cancelled',
        'The obsolete connection test was cancelled.',
      );
    this.profile.plan = result.plan;
    return result;
  }
  load(request: HistoryRequest, refresh = false): Promise<Dataset> {
    try {
      requireOnline();
    } catch (error) {
      return Promise.reject(error);
    }
    // Profiles are session-owned; callers cannot accidentally reuse another key's cache.
    const scoped = { ...request, accessProfile: this.accessProfile };
    const key = historyKey(
      this.provider.id,
      scoped,
      exchangeDate(scoped.listing.timezone),
    );
    const serialized = JSON.stringify(key);
    if (this.active?.key === serialized) return this.active.promise;
    this.cancelSearch();
    this.testController?.abort();
    this.epoch++;
    const epoch = this.epoch;
    void this.queries.cancelQueries({ queryKey: ['provider-history'] });
    const promise = (async () => {
      if (refresh)
        await this.queries.invalidateQueries({
          queryKey: key,
          exact: true,
          refetchType: 'none',
        });
      let result: Dataset;
      try {
        result = await this.queries.fetchQuery({
          queryKey: key,
          queryFn: ({ signal }) =>
            this.provider.getOHLCV(scoped, this.credential, signal),
        });
      } catch (error) {
        if (epoch !== this.epoch || isCancelledError(error))
          throw new ProviderError(
            'cancelled',
            'The obsolete history request was cancelled.',
          );
        throw error;
      }
      if (epoch !== this.epoch)
        throw new ProviderError(
          'cancelled',
          'The obsolete history request was cancelled.',
        );
      this.queries.setQueryData(key, result);
      return result;
    })();
    this.active = { key: serialized, promise };
    void promise
      .finally(() => {
        if (this.active?.promise === promise) this.active = null;
        this.prune();
      })
      .catch(() => {});
    return promise;
  }
  private prune() {
    const queries = this.queries
      .getQueryCache()
      .getAll()
      .sort(
        (a, b) =>
          Math.max(b.state.dataUpdatedAt, b.state.errorUpdatedAt) -
          Math.max(a.state.dataUpdatedAt, a.state.errorUpdatedAt),
      );
    let bars = 0,
      bytes = 0;
    queries.forEach((query, index) => {
      const data = query.state.data as Dataset | undefined;
      bars += data?.candles.length ?? 0;
      bytes += data ? JSON.stringify(data).length * 2 : 0;
      if (index >= 5 || bars > 25000 || bytes > 20 * 1024 * 1024)
        this.queries.removeQueries({ queryKey: query.queryKey, exact: true });
    });
  }
}
