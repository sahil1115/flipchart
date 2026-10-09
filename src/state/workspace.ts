import { create } from 'zustand';
import {
  readWorkspacePreference,
  writeWorkspacePreference,
} from '../storage/workspace-preference';
export type ChartStyle = 'candles' | 'line' | 'area';
export type DisplayRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
interface WorkspaceState {
  chartStyle: ChartStyle;
  range: DisplayRange;
  resetRevision: number;
  preferenceSaved: boolean;
  setChartStyle: (style: ChartStyle) => void;
  setRange: (range: DisplayRange) => void;
  resetChart: () => void;
}
export const useWorkspace = create<WorkspaceState>((set) => ({
  ...readWorkspacePreference(),
  resetRevision: 0,
  preferenceSaved: true,
  setChartStyle: (chartStyle) =>
    set((state) => ({
      chartStyle,
      preferenceSaved: writeWorkspacePreference({
        version: 1,
        chartStyle,
        range: state.range,
      }),
    })),
  setRange: (range) =>
    set((state) => ({
      range,
      preferenceSaved: writeWorkspacePreference({
        version: 1,
        chartStyle: state.chartStyle,
        range,
      }),
    })),
  resetChart: () =>
    set((state) => ({ resetRevision: state.resetRevision + 1 })),
}));
