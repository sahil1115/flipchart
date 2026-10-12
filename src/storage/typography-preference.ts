export const fontOptions = {
  system: {
    name: 'System',
    family: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  arial: { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  verdana: { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
} as const;
export interface TypographyPreference {
  version: 1;
  font: keyof typeof fontOptions;
  size: number;
}
export const typographyKey = 'flipchart:typography';
export const defaultTypography: TypographyPreference = {
  version: 1,
  font: 'system',
  size: 100,
};
function validated(value: unknown): TypographyPreference {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('font' in value) ||
    typeof value.font !== 'string' ||
    !Object.hasOwn(fontOptions, value.font) ||
    !('size' in value) ||
    typeof value.size !== 'number' ||
    !Number.isInteger(value.size) ||
    value.size < 90 ||
    value.size > 140 ||
    value.size % 10 !== 0
  )
    return { ...defaultTypography };
  return {
    version: 1,
    font: value.font as TypographyPreference['font'],
    size: value.size,
  };
}
export function readTypographyPreference(): TypographyPreference {
  try {
    return validated(JSON.parse(localStorage.getItem(typographyKey) ?? 'null'));
  } catch {
    return { ...defaultTypography };
  }
}
export function writeTypographyPreference(
  value: TypographyPreference,
): boolean {
  try {
    localStorage.setItem(typographyKey, JSON.stringify(validated(value)));
    return true;
  } catch {
    return false;
  }
}
export function applyTypography(value: TypographyPreference) {
  const root = document.documentElement;
  root.style.setProperty(
    '--app-font-family',
    value.font === 'system'
      ? `var(--theme-font-family, ${fontOptions.system.family})`
      : fontOptions[value.font].family,
  );
  root.style.setProperty('--text-scale', String(value.size / 100));
}
