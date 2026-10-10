import { create } from 'zustand';
import { defaults, validateParameters } from '../indicators/core';
import type { Parameters } from '../indicators/core';
import { defaultVisibility } from '../indicators/presentation';
import type { Visibility, IndicatorId } from '../indicators/presentation';
import { object } from '../data/validate';

export interface DashboardPreference {
  version: 2;
  parameters: Parameters;
  visible: Visibility;
  collapsed: Visibility;
  expanded: IndicatorId | null;
  activePane: IndicatorId;
}
const ids = Object.keys(defaultVisibility) as IndicatorId[];
export function defaultDashboard(): DashboardPreference {
  return {
    version: 2,
    parameters: { ...defaults },
    visible: { ...defaultVisibility },
    collapsed: Object.fromEntries(ids.map((id) => [id, false])) as Visibility,
    expanded: null,
    activePane: 'rsi',
  };
}
/** v1 contained visibility only; migrate it and supply validated defaults. */
export function validateDashboard(value: unknown): DashboardPreference {
  const raw = object(value, 'dashboard preferences');
  if (raw.version !== 1 && raw.version !== 2)
    throw new Error('Unknown preference version');
  const base = defaultDashboard();
  const flags = (value: unknown): Visibility => {
    const source = object(value, 'visibility');
    return Object.fromEntries(
      ids.map((id) => {
        if (typeof source[id] !== 'boolean')
          throw new Error('Invalid visibility');
        return [id, source[id]];
      }),
    ) as Visibility;
  };
  base.visible = flags(raw.visible);
  if (raw.version === 2) {
    const parameters = object(raw.parameters, 'parameters');
    base.parameters = Object.fromEntries(
      Object.keys(defaults).map((key) => {
        if (typeof parameters[key] !== 'number')
          throw new Error('Invalid period');
        return [key, parameters[key]];
      }),
    ) as unknown as Parameters;
    const error = validateParameters(base.parameters);
    if (error) throw new Error(error);
    base.collapsed = flags(raw.collapsed);
    if (raw.expanded !== null && !ids.includes(raw.expanded as IndicatorId))
      throw new Error('Invalid expanded panel');
    base.expanded = raw.expanded as IndicatorId | null;
    if (raw.activePane !== undefined) {
      if (
        !ids.includes(raw.activePane as IndicatorId) ||
        ['sma', 'ema', 'bands', 'volumeAverage'].includes(
          raw.activePane as string,
        )
      )
        throw new Error('Invalid active indicator pane');
      base.activePane = raw.activePane as IndicatorId;
    }
  }
  return base;
}
export function readDashboard(): DashboardPreference {
  try {
    return validateDashboard(
      JSON.parse(localStorage.getItem('flipchart:dashboard') ?? 'null'),
    );
  } catch {
    return defaultDashboard();
  }
}
export function writeDashboard(value: DashboardPreference): boolean {
  try {
    localStorage.setItem(
      'flipchart:dashboard',
      JSON.stringify(validateDashboard(value)),
    );
    return true;
  } catch {
    return false;
  }
}
interface DashboardState extends DashboardPreference {
  saved: boolean;
  update: (patch: Partial<Omit<DashboardPreference, 'version'>>) => void;
  reset: () => void;
}
export const useDashboard = create<DashboardState>((set) => ({
  ...readDashboard(),
  saved: true,
  update: (patch) =>
    set((state) => {
      const next = validateDashboard({ ...state, ...patch });
      return { ...next, saved: writeDashboard(next) };
    }),
  reset: () =>
    set(() => {
      const next = defaultDashboard();
      return { ...next, saved: writeDashboard(next) };
    }),
}));
