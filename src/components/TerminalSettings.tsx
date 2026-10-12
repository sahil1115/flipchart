import { defaultTerminalPreference, terminalAccents } from '../themes/themes';
import type { TerminalPreference } from '../themes/themes';
export function TerminalSettings({
  value = defaultTerminalPreference,
  onChange,
}: {
  value?: TerminalPreference;
  onChange: (value: TerminalPreference) => void;
}) {
  return (
    <div className="terminal-settings">
      <fieldset className="terminal-modes">
        <legend>Background</legend>
        {(['dark', 'white'] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="terminal-mode"
              checked={value.mode === mode}
              onChange={() => onChange({ ...value, mode })}
            />
            {mode === 'dark' ? 'Dark' : 'White'}
          </label>
        ))}
      </fieldset>
      <fieldset className="terminal-colors">
        <legend>Accent color</legend>
        {Object.entries(terminalAccents).map(([accent, color]) => (
          <label key={accent}>
            <input
              type="radio"
              name="terminal-accent"
              aria-label={`${color.name} accent`}
              checked={value.accent === accent}
              onChange={() =>
                onChange({
                  ...value,
                  accent: accent as TerminalPreference['accent'],
                })
              }
            />
            <span
              className="terminal-color-dot"
              aria-hidden="true"
              style={{ background: color[value.mode] }}
            />
            <span className="terminal-color-name">{color.name}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
