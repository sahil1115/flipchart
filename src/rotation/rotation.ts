import type { TradingDate } from '../data/types';
import type { CloseSeries } from '../correlation/history';
import type { RotationUniverse } from './universes';

/**
 * Sector rotation on weekly bars, built from openly documented steps (it is
 * not the proprietary Relative Rotation Graph calculation, so values will not
 * match other tools):
 *
 *   RS           = 100 × sector close ÷ benchmark close
 *   RS-Ratio     = 100 × RS ÷ average of the last 10 weekly RS values
 *   RS-Momentum  = 100 × RS-Ratio ÷ RS-Ratio four weeks earlier
 *
 * Both are centred on 100: a ratio above 100 means the sector is beating its
 * own recent relative average, and a momentum above 100 means that is getting
 * stronger.
 *
 * Only completed weeks are used. A part-week bar holds fewer days of movement
 * than the others, which bends the averages and can flip a sector's quadrant,
 * so the week in progress is left out until it ends.
 */
export const trendWeeks = 10;
export const momentumWeeks = 4;
/** Readings drawn per sector: the latest week plus five before it. */
export const tailPoints = 6;
export const minimumWeeks = trendWeeks - 1 + momentumWeeks + tailPoints;
/** About 44 weeks of calendar history, comfortably above the minimum. */
export const rotationLookbackDays = 310;

export type Quadrant = 'leading' | 'weakening' | 'lagging' | 'improving';
export const quadrantOf = (ratio: number, momentum: number): Quadrant =>
  ratio >= 100
    ? momentum >= 100
      ? 'leading'
      : 'weakening'
    : momentum >= 100
      ? 'improving'
      : 'lagging';

export interface WeeklyClose {
  /** Last finalized session of the week. */
  date: TradingDate;
  close: number;
}
export interface RotationPoint {
  /** Last session of the week (the later of sector and benchmark). */
  week: TradingDate;
  ratio: number;
  momentum: number;
}
export interface SectorRotation {
  label: string;
  name: string;
  ticker: string;
  /** Oldest first; the last point is the latest week. */
  points: RotationPoint[];
  quadrant: Quadrant;
}
export interface RotationResult {
  universe: string;
  benchmark: string;
  asOf: TradingDate;
  sectors: SectorRotation[];
  skipped: { label: string; reason: string }[];
}

export class RotationHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RotationHistoryError';
  }
}

/** Monday of the week containing a date, as a stable week key. */
function weekStart(date: TradingDate): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * One close per Monday-to-Friday week: its last finalized session. Weeks whose
 * Friday has not yet passed on `today` (the exchange date) are still in
 * progress and are left out.
 */
export function weeklyCloses(
  closes: Map<TradingDate, number>,
  today: TradingDate,
): Map<string, WeeklyClose> {
  const weeks = new Map<string, WeeklyClose>();
  const sessions = [...closes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [date, close] of sessions)
    weeks.set(weekStart(date), { date, close });
  for (const start of [...weeks.keys()])
    if (addDays(start, 4) >= today) weeks.delete(start);
  return weeks;
}

/** The latest `tailPoints` readings of a sector against the benchmark. */
export function rotationPoints(
  sector: Map<TradingDate, number>,
  benchmark: Map<TradingDate, number>,
  today: TradingDate,
): RotationPoint[] {
  const sectorWeeks = weeklyCloses(sector, today);
  const benchmarkWeeks = weeklyCloses(benchmark, today);
  const weeks = [...sectorWeeks.keys()]
    .filter((week) => benchmarkWeeks.has(week))
    .sort();
  if (weeks.length < minimumWeeks)
    throw new RotationHistoryError(
      `only ${weeks.length} weeks in common with the benchmark; ${minimumWeeks} are needed`,
    );
  const relative = weeks.map(
    (week) =>
      (100 * sectorWeeks.get(week)!.close) / benchmarkWeeks.get(week)!.close,
  );
  const ratio: number[] = [];
  for (let i = trendWeeks - 1; i < relative.length; i++) {
    const window = relative.slice(i - trendWeeks + 1, i + 1);
    ratio[i] =
      (100 * relative[i]!) /
      (window.reduce((sum, v) => sum + v, 0) / trendWeeks);
  }
  const points: RotationPoint[] = [];
  for (let i = trendWeeks - 1 + momentumWeeks; i < relative.length; i++) {
    const week = weeks[i]!;
    const a = sectorWeeks.get(week)!.date;
    const b = benchmarkWeeks.get(week)!.date;
    points.push({
      week: a > b ? a : b,
      ratio: ratio[i]!,
      momentum: (100 * ratio[i]!) / ratio[i - momentumWeeks]!,
    });
  }
  return points.slice(-tailPoints);
}

/** Computes every sector that loaded and has enough history, and says why others were left out. */
export function buildRotation(
  universe: RotationUniverse,
  series: CloseSeries[],
  today: TradingDate,
): RotationResult {
  const benchmark = series.find(
    (item) => item.symbol === universe.benchmark.ticker,
  );
  if (!benchmark)
    throw new RotationHistoryError(
      `${universe.benchmark.name} did not load, so sectors cannot be compared with the market.`,
    );
  const computed: SectorRotation[] = [];
  const skipped: RotationResult['skipped'] = [];
  for (const sector of universe.sectors) {
    const loaded = series.find((item) => item.symbol === sector.ticker);
    if (!loaded) continue;
    try {
      const points = rotationPoints(loaded.closes, benchmark.closes, today);
      const last = points.at(-1)!;
      computed.push({
        ...sector,
        points,
        quadrant: quadrantOf(last.ratio, last.momentum),
      });
    } catch (error) {
      if (!(error instanceof RotationHistoryError)) throw error;
      skipped.push({ label: sector.label, reason: error.message });
    }
  }
  const asOf = computed
    .map((sector) => sector.points.at(-1)!.week)
    .reduce((latest, week) => (week > latest ? week : latest), '');
  const current = computed.filter(
    (sector) => sector.points.at(-1)!.week === asOf,
  );
  for (const sector of computed)
    if (!current.includes(sector))
      skipped.push({
        label: sector.label,
        reason: 'its latest week is missing, so it is out of date',
      });
  if (!current.length)
    throw new RotationHistoryError(
      'No sector had enough weekly history to show a rotation.',
    );
  return {
    universe: universe.name,
    benchmark: universe.benchmark.name,
    asOf: asOf as TradingDate,
    sectors: current,
    skipped,
  };
}
