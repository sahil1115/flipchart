import type { ChartStyle, DisplayRange } from '../state/workspace';
export interface WorkspacePreference {
  version: 1;
  chartStyle: ChartStyle;
  range: DisplayRange;
}
const key = 'flipchart:workspace';
const styles: readonly string[] = ['candles', 'line', 'area'];
const ranges: readonly string[] = ['1M', '3M', '6M', '1Y', 'ALL'];
export const defaultWorkspacePreference: WorkspacePreference = {
  version: 1,
  chartStyle: 'candles',
  range: '6M',
};
export function readWorkspacePreference(): WorkspacePreference {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      typeof saved !== 'object' ||
      saved === null ||
      !('version' in saved) ||
      saved.version !== 1 ||
      !('chartStyle' in saved) ||
      typeof saved.chartStyle !== 'string' ||
      !styles.includes(saved.chartStyle) ||
      !('range' in saved) ||
      typeof saved.range !== 'string' ||
      !ranges.includes(saved.range)
    )
      return { ...defaultWorkspacePreference };
    return {
      version: 1,
      chartStyle: saved.chartStyle as ChartStyle,
      range: saved.range as DisplayRange,
    };
  } catch {
    return { ...defaultWorkspacePreference };
  }
}
export function writeWorkspacePreference(value: WorkspacePreference): boolean {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        chartStyle: value.chartStyle,
        range: value.range,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function resetPreferences(): boolean {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem('flipchart:appearance');
    return true;
  } catch {
    return false;
  }
}
