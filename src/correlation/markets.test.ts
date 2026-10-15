import { expect, it } from 'vitest';
import { relaySymbolPattern } from '../server/yahoo-relay';
import { findMarket, markets, parseTickers } from './markets';

it('offers the four markets, each starting with an all-sector list of ten', () => {
  expect(markets.map((market) => market.id)).toEqual([
    'dow',
    'sp500',
    'nasdaq100',
    'nse',
  ]);
  for (const market of markets) {
    expect(market.industries[0]!.id).toBe('all');
    expect(market.industries[0]!.symbols).toHaveLength(10);
  }
});

it('keeps every curated ticker valid, unique and fetchable through the relay', () => {
  for (const market of markets)
    for (const industry of market.industries) {
      expect(industry.symbols.length).toBeGreaterThanOrEqual(2);
      expect(industry.symbols.length).toBeLessThanOrEqual(10);
      expect(new Set(industry.symbols).size).toBe(industry.symbols.length);
      for (const ticker of industry.symbols) {
        expect(ticker).toMatch(market.tickerPattern);
        expect(`${ticker}${market.suffix}`).toMatch(relaySymbolPattern);
      }
    }
});

it('parses edited tickers, strips the NSE suffix and reports invalid entries', () => {
  expect(parseTickers(findMarket('nse'), 'tcs.ns, infy  m&m,TCS')).toEqual({
    tickers: ['TCS', 'INFY', 'M&M'],
    invalid: [],
  });
  expect(parseTickers(findMarket('sp500'), 'aapl brk-b ../x 1ABC')).toEqual({
    tickers: ['AAPL', 'BRK-B'],
    invalid: ['../X', '1ABC'],
  });
});
