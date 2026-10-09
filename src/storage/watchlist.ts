import { object, validateListing } from '../data/validate';
import type { Listing } from '../data/types';
export interface WatchEntry {
  provider: string;
  listing: Listing;
}
export function validateWatchlist(input: unknown): WatchEntry[] {
  const raw = object(input, 'watchlist');
  if (
    raw.version !== 1 ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 30
  )
    throw new Error('Invalid watchlist');
  const entries = raw.entries.map((value) => {
    const entry = object(value, 'watch entry');
    if (!['alpha-vantage', 'twelve-data'].includes(String(entry.provider)))
      throw new Error('Unknown provider');
    const listing = validateListing(entry.listing);
    if (!listing.id.startsWith(`live:${String(entry.provider)}:`))
      throw new Error('Provider identity mismatch');
    return { provider: String(entry.provider), listing };
  });
  return entries.filter(
    (entry, index) =>
      entries.findIndex((item) => item.listing.id === entry.listing.id) ===
      index,
  );
}
export function readWatchlist(): WatchEntry[] {
  try {
    return validateWatchlist(
      JSON.parse(localStorage.getItem('flipchart:watchlist') ?? 'null'),
    );
  } catch {
    return [];
  }
}
export function writeWatchlist(entries: WatchEntry[]): boolean {
  try {
    localStorage.setItem(
      'flipchart:watchlist',
      JSON.stringify({
        version: 1,
        entries: validateWatchlist({ version: 1, entries }),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
