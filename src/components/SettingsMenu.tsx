import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from './GlassPanel';
import { TerminalSettings } from './TerminalSettings';
import { TypographyControls } from './TypographyPicker';
import { themes } from '../themes/themes';
import { legendGradient } from '../correlation/heatmap';
import type { HeatmapPalette } from '../correlation/heatmap';
import type { ThemeDefinition } from '../themes/themes';
import type { ThemePreference } from '../storage/theme-preference';
import type { TypographyPreference } from '../storage/typography-preference';

const heatmapOptions: { id: HeatmapPalette; label: string }[] = [
  { id: 'blue-orange', label: 'Blue & orange' },
  { id: 'green-red', label: 'Green & red' },
];

/** One gear menu for appearance, text and local storage actions. */
export function SettingsMenu({
  theme,
  preference,
  onPreference,
  typography,
  onTypography,
  working,
  onResetPreferences,
  onClearCache,
}: {
  theme: ThemeDefinition;
  preference: ThemePreference;
  onPreference: (next: ThemePreference) => void;
  typography: TypographyPreference;
  onTypography: (next: TypographyPreference) => void;
  working: boolean;
  onResetPreferences: () => void;
  onClearCache: () => void;
}) {
  const [open, setOpen] = useState(false);
  const control = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    control.current
      ?.querySelector<HTMLInputElement>('input[name="theme"]:checked')
      ?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const swatch = (option: ThemeDefinition) =>
    (option.id === theme.id ? theme : option).css;
  return (
    <div className="settings-control" ref={control}>
      <button
        ref={toggle}
        className="icon-button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="settings-menu"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && (
        <GlassPanel
          id="settings-menu"
          className="settings-menu"
          aria-label="Settings"
        >
          <div className="menu-heading">
            <h2>Settings</h2>
            <button
              className="icon-button"
              aria-label="Close settings"
              onClick={close}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <fieldset className="theme-picker">
            <legend className="menu-label">Theme</legend>
            {Object.values(themes).map((option) => (
              <label className="theme-option" key={option.id}>
                <input
                  type="radio"
                  name="theme"
                  value={option.id}
                  checked={preference.themeId === option.id}
                  onChange={() =>
                    onPreference({ ...preference, themeId: option.id })
                  }
                />
                <span
                  className="theme-swatch"
                  aria-hidden="true"
                  style={{
                    background: swatch(option)['--surface-opaque'],
                    borderColor: swatch(option)['--border'],
                  }}
                >
                  <span style={{ background: swatch(option)['--accent'] }} />
                </span>
                {option.name}
              </label>
            ))}
          </fieldset>
          {theme.id === 'terminal-amber' && (
            <TerminalSettings
              value={preference.terminal}
              onChange={(terminal) => onPreference({ ...preference, terminal })}
            />
          )}
          <div className="menu-section">
            <h3 className="menu-label">Text</h3>
            <TypographyControls value={typography} onChange={onTypography} />
          </div>
          <div
            className="menu-section heatmap-colors"
            role="radiogroup"
            aria-labelledby="heatmap-colors-label"
          >
            <h3 className="menu-label" id="heatmap-colors-label">
              Heatmap colors
            </h3>
            {heatmapOptions.map((option) => (
              <label className="heatmap-option" key={option.id}>
                <input
                  type="radio"
                  name="heatmap-palette"
                  value={option.id}
                  checked={
                    (preference.heatmapPalette ?? 'blue-orange') === option.id
                  }
                  onChange={() =>
                    onPreference({ ...preference, heatmapPalette: option.id })
                  }
                />
                <span
                  className="heatmap-swatch"
                  aria-hidden="true"
                  style={{ background: legendGradient(option.id) }}
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="menu-section">
            <label className="menu-row">
              Reduce visual effects
              <input
                type="checkbox"
                className="switch"
                checked={preference.reducedEffects}
                onChange={(event) =>
                  onPreference({
                    ...preference,
                    reducedEffects: event.target.checked,
                  })
                }
              />
            </label>
          </div>
          <div className="menu-section menu-footer">
            <button className="link-button" onClick={onResetPreferences}>
              Reset Preferences
            </button>
            <button
              className="link-button danger"
              disabled={working}
              onClick={onClearCache}
            >
              Clear Cache
            </button>
          </div>
          <p className="small menu-note">
            Clear Cache removes saved demo/CSV datasets and the provider session
            cache. Keys and the watchlist stay. Reset Preferences restores
            appearance, chart view, layout and parameters.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
