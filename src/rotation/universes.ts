import type { MarketId } from '../correlation/markets';

export type RotationUniverseId = 'us' | 'india';
export interface RotationSector {
  /** Short chart label. */
  label: string;
  name: string;
  /** Yahoo ticker without the market suffix. */
  ticker: string;
}
export interface RotationUniverse {
  id: RotationUniverseId;
  name: string;
  /** Market used to fetch and validate the tickers. */
  marketId: MarketId;
  benchmark: { ticker: string; name: string };
  sectors: RotationSector[];
  note: string;
}

/**
 * Sectors are represented by exchange-traded funds. Yahoo serves complete
 * daily history for them, but not for most NSE sector indices (only Bank, IT
 * and Pharma are complete), so India uses NSE-listed sector ETFs instead.
 */
export const rotationUniverses: RotationUniverse[] = [
  {
    id: 'us',
    name: 'US sectors vs S&P 500',
    marketId: 'sp500',
    benchmark: { ticker: 'SPY', name: 'S&P 500 (SPY)' },
    note: 'Select Sector SPDR funds compared with SPY.',
    sectors: [
      { label: 'XLK', name: 'Technology', ticker: 'XLK' },
      { label: 'XLC', name: 'Communication Services', ticker: 'XLC' },
      { label: 'XLY', name: 'Consumer Discretionary', ticker: 'XLY' },
      { label: 'XLP', name: 'Consumer Staples', ticker: 'XLP' },
      { label: 'XLE', name: 'Energy', ticker: 'XLE' },
      { label: 'XLF', name: 'Financials', ticker: 'XLF' },
      { label: 'XLV', name: 'Health Care', ticker: 'XLV' },
      { label: 'XLI', name: 'Industrials', ticker: 'XLI' },
      { label: 'XLB', name: 'Materials', ticker: 'XLB' },
      { label: 'XLRE', name: 'Real Estate', ticker: 'XLRE' },
      { label: 'XLU', name: 'Utilities', ticker: 'XLU' },
    ],
  },
  {
    id: 'india',
    name: 'India sectors vs Nifty 50',
    marketId: 'nse',
    benchmark: { ticker: 'NIFTYBEES', name: 'Nifty 50 (NIFTYBEES)' },
    note: 'NSE-listed sector ETFs compared with the Nifty 50 ETF.',
    sectors: [
      { label: 'Bank', name: 'Nifty Bank', ticker: 'BANKBEES' },
      { label: 'PSU Bank', name: 'Nifty PSU Bank', ticker: 'PSUBNKBEES' },
      { label: 'IT', name: 'Nifty IT', ticker: 'ITBEES' },
      { label: 'Pharma', name: 'Nifty Pharma', ticker: 'PHARMABEES' },
      { label: 'Auto', name: 'Nifty Auto', ticker: 'AUTOBEES' },
      { label: 'FMCG', name: 'Nifty FMCG', ticker: 'FMCGIETF' },
      { label: 'Metal', name: 'Nifty Metal', ticker: 'METALIETF' },
      { label: 'Oil & Gas', name: 'Nifty Oil & Gas', ticker: 'OILIETF' },
      {
        label: 'Consumption',
        name: 'Nifty India Consumption',
        ticker: 'CONSUMBEES',
      },
      { label: 'Realty', name: 'Nifty Realty', ticker: 'MOREALTY' },
    ],
  },
];

export function findUniverse(id: RotationUniverseId): RotationUniverse {
  return rotationUniverses.find((item) => item.id === id)!;
}
