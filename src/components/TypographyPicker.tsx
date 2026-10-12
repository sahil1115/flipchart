import { useEffect, useRef, useState } from 'react';
import { GlassPanel } from './GlassPanel';
import {
  defaultTypography,
  fontOptions,
  writeTypographyPreference,
} from '../storage/typography-preference';
import type { TypographyPreference } from '../storage/typography-preference';

export function TypographyPicker({
  value,
  onChange,
}: {
  value: TypographyPreference;
  onChange: (value: TypographyPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const control = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    control.current?.querySelector<HTMLSelectElement>('select')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!control.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      control.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const change = (next: TypographyPreference) => {
    onChange(next);
    setSaved(writeTypographyPreference(next));
  };
  return (
    <div className="font-control" ref={control}>
      <button
        className="settings-button text-button"
        aria-expanded={open}
        aria-controls="text-menu"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">Aa</span> Text
      </button>
      {open && (
        <GlassPanel
          id="text-menu"
          className="text-popover"
          aria-label="Text settings"
        >
          <div className="text-popover-heading">
            <h2>Text</h2>
            <button
              aria-label="Close text settings"
              onClick={() => {
                setOpen(false);
                control.current
                  ?.querySelector<HTMLButtonElement>('button')
                  ?.focus();
              }}
            >
              ×
            </button>
          </div>
          <label className="font-select">
            Font
            <select
              aria-label="Font style"
              value={value.font}
              onChange={(event) =>
                change({
                  ...value,
                  font: event.target.value as TypographyPreference['font'],
                })
              }
            >
              {Object.entries(fontOptions).map(([id, font]) => (
                <option key={id} value={id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <div
            className="text-size-controls"
            role="group"
            aria-label="Text size"
          >
            <button
              aria-label="Decrease font size"
              disabled={value.size <= 90}
              onClick={() => change({ ...value, size: value.size - 10 })}
            >
              A−
            </button>
            <output aria-label="Font size" aria-live="polite">
              {value.size}%
            </output>
            <button
              aria-label="Increase font size"
              disabled={value.size >= 140}
              onClick={() => change({ ...value, size: value.size + 10 })}
            >
              A+
            </button>
          </div>
          <button
            className="text-default"
            onClick={() => change({ ...defaultTypography })}
          >
            Default
          </button>
          {!saved && (
            <p className="small" role="status">
              Text settings apply for this session; browser storage is
              unavailable.
            </p>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
