import { describe, expect, it } from 'vitest';
import type { Candle, TradingDate } from '../data/types';
import {
  colourScale,
  formatReturn,
  formatShare,
  monthlyReturns,
  SeasonalityError,
} from './seasonality';

const bar = (time: string, close: number, incomplete = false): Candle => ({
  time: time as TradingDate,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
  ...(incomplete ? { incomplete: true } : {}),
});
/** One close in the middle of a month and a last close at its end. */
const month = (year: number, m: number, middle: number, last: number) => [
  bar(`${year}-${String(m).padStart(2, '0')}-10`, middle),
  bar(`${year}-${String(m).padStart(2, '0')}-27`, last),
];
const far = '2099-01-01';

describe('monthly returns', () => {
  it('measures each month from the previous month’s last close', () => {
    const result = monthlyReturns(
      [
        ...month(2024, 1, 90, 100),
        ...month(2024, 2, 120, 110),
        ...month(2024, 3, 105, 99),
      ],
      far,
    );
    const [row] = result.years;
    expect(row!.months[0]!.value).toBeNull(); // no previous close for the first month
    expect(row!.months[1]!.value).toBeCloseTo(10, 10); // 110 / 100
    expect(row!.months[2]!.value).toBeCloseTo(-10, 10); // 99 / 110
    expect(row!.months[3]!.value).toBeNull();
    expect(result.from).toBe('2024-01-27');
    expect(result.to).toBe('2024-03-27');
  });

  it('never bridges a missing month', () => {
    const result = monthlyReturns(
      [
        ...month(2024, 1, 100, 100),
        ...month(2024, 2, 100, 110),
        // March is missing from the data.
        ...month(2024, 4, 100, 121),
      ],
      far,
    );
    expect(result.years[0]!.months[1]!.value).toBeCloseTo(10, 10);
    expect(result.years[0]!.months[3]!.value).toBeNull();
  });

  it('ignores provisional candles', () => {
    const result = monthlyReturns(
      [
        ...month(2024, 1, 100, 100),
        bar('2024-02-12', 110),
        bar('2024-02-28', 110),
        bar('2024-02-29', 500, true),
      ],
      far,
    );
    expect(result.years[0]!.months[1]!.value).toBeCloseTo(10, 10);
    expect(result.to).toBe('2024-02-28');
  });

  it('flags the month in progress and leaves it out of the statistics', () => {
    const closes: Candle[] = [];
    // Four Decembers of +1% each, then a fifth still in progress at +50%.
    for (let year = 2010; year <= 2013; year++) {
      closes.push(...month(year, 11, 100, 100), ...month(year, 12, 100, 101));
    }
    closes.push(...month(2014, 11, 100, 100), ...month(2014, 12, 100, 150));
    const result = monthlyReturns(closes, '2014-12-15');
    const december = result.years.at(-1)!.months[11]!;
    expect(december.partial).toBe(true);
    expect(december.value).toBeCloseTo(50, 10);
    expect(result.statistics[11]!.count).toBe(4);
    expect(result.statistics[11]!.average).toBeCloseTo(1, 10);
    expect(result.years.at(-1)!.partial).toBe(true);
  });

  it('needs three complete months before it gives an average or share', () => {
    const closes: Candle[] = [...month(2020, 11, 100, 100)];
    closes.push(...month(2020, 12, 100, 110));
    closes.push(...month(2021, 11, 100, 100), ...month(2021, 12, 100, 99));
    const two = monthlyReturns(closes, far);
    expect(two.statistics[11]!.count).toBe(2);
    expect(two.statistics[11]!.average).toBeNull();
    expect(two.statistics[11]!.upShare).toBeNull();
    closes.push(...month(2022, 11, 100, 100), ...month(2022, 12, 100, 105));
    const three = monthlyReturns(closes, far);
    // December moves, each against that year's November close: +10%, −1%, +5%.
    expect(three.statistics[11]!.count).toBe(3);
    expect(three.statistics[11]!.average).toBeCloseTo((10 - 1 + 5) / 3, 10);
    expect(three.statistics[11]!.upShare).toBeCloseTo(200 / 3, 10);
  });

  it('measures a year from the previous December and marks unfinished years', () => {
    const result = monthlyReturns(
      [
        ...month(2022, 11, 100, 100),
        ...month(2022, 12, 100, 100),
        ...month(2023, 6, 100, 110),
        ...month(2023, 12, 100, 120),
        ...month(2024, 3, 100, 90),
      ],
      far,
    );
    const [first, second, third] = result.years;
    expect(first!.total).toBeNull(); // no 2021 close
    expect(second!.total).toBeCloseTo(20, 10); // 120 / 100
    expect(second!.partial).toBe(false);
    expect(third!.total).toBeCloseTo(-25, 10); // 90 / 120
    expect(third!.partial).toBe(true); // ends in March, so year to date
  });

  it('does not bridge a missing year when measuring a year', () => {
    const result = monthlyReturns(
      [...month(2021, 12, 100, 100), ...month(2023, 5, 100, 120)],
      far,
    );
    expect(result.years.find((row) => row.year === 2023)!.total).toBeNull();
  });

  it('explains when there is too little history', () => {
    expect(() => monthlyReturns([], far)).toThrow(SeasonalityError);
    expect(() => monthlyReturns(month(2024, 1, 1, 2), far)).toThrow(
      /two calendar months/,
    );
  });
});

describe('colour scale and formatting', () => {
  it('picks a round scale that covers nine in ten readings', () => {
    const make = (values: number[]) => {
      const closes: Candle[] = [];
      let price = 100;
      closes.push(...month(2020, 1, price, price));
      values.forEach((change, index) => {
        price *= 1 + change / 100;
        closes.push(
          ...month(
            2020 + Math.floor((index + 1) / 12),
            ((index + 1) % 12) + 1,
            price,
            price,
          ),
        );
      });
      return monthlyReturns(closes, far);
    };
    expect(colourScale(make([1, -2, 3, -1, 2, 1, -3, 2, 1, -1]))).toBe(5);
    expect(colourScale(make([8, -9, 7, -6, 9, 8, -7, 9, 8, -8]))).toBe(10);
    expect(colourScale(make([40, -35, 45, -40, 38]))).toBe(50);
  });

  it('prints a true minus, one decimal and never "-0.0"', () => {
    expect(formatReturn(4.26)).toBe('+4.3');
    expect(formatReturn(-4.26)).toBe('−4.3');
    expect(formatReturn(-0.04)).toBe('0.0');
    expect(formatReturn(0.04)).toBe('0.0');
    expect(formatReturn(null)).toBe('–');
    expect(formatShare(66.67)).toBe('67%');
    expect(formatShare(null)).toBe('–');
  });
});
