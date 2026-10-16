import { useState } from 'react';
import {
  defaultTypography,
  fontOptions,
  writeTypographyPreference,
} from '../storage/typography-preference';
import type { TypographyPreference } from '../storage/typography-preference';

/** Font and text-size controls, shown inline in the Settings menu. */
export function TypographyControls({
  value,
  onChange,
}: {
  value: TypographyPreference;
  onChange: (value: TypographyPreference) => void;
}) {
  const [saved, setSaved] = useState(true);
  const change = (next: TypographyPreference) => {
    onChange(next);
    setSaved(writeTypographyPreference(next));
  };
  return (
    <div className="text-controls" role="group" aria-label="Text settings">
      <label className="menu-row">
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
      <div className="menu-row">
        <span>Size</span>
        <div className="text-size-controls" role="group" aria-label="Text size">
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
      </div>
      <div className="menu-row">
        <span />
        <button
          className="link-button"
          onClick={() => change({ ...defaultTypography })}
        >
          Default
        </button>
      </div>
      {!saved && (
        <p className="small" role="status">
          Text settings apply for this session; browser storage is unavailable.
        </p>
      )}
    </div>
  );
}
