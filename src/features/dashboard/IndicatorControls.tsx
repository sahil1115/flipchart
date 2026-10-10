import { useState } from 'react';
import { defaults, validateParameters } from '../../indicators/core';
import type { Parameters } from '../../indicators/core';
import type {
  IndicatorDefinition,
  Visibility,
} from '../../indicators/presentation';

const labels: Record<keyof Parameters, string> = {
  smaShort: 'SMA short period',
  smaMedium: 'SMA medium period',
  smaLong: 'SMA long period',
  emaFast: 'EMA fast period',
  emaSlow: 'EMA slow period',
  bbPeriod: 'Band period',
  bbDeviation: 'Band deviation',
  rsiPeriod: 'RSI period',
  macdFast: 'MACD fast period',
  macdSlow: 'MACD slow period',
  macdSignal: 'MACD signal period',
  atrPeriod: 'ATR period',
  volumePeriod: 'Volume average period',
  stochasticPeriod: 'Stochastic lookback',
  stochasticK: 'Stochastic K smoothing',
  stochasticD: 'Stochastic D smoothing',
  adxPeriod: 'ADX period',
  cciPeriod: 'CCI period',
  williamsPeriod: 'Williams R period',
  rocPeriod: 'ROC period',
  volatilityPeriod: 'Volatility return window',
};
export function IndicatorControls({
  parameters,
  onParameters,
  visible,
  onVisibility,
  items,
  hideVisibility = false,
}: {
  parameters: Parameters;
  onParameters: (p: Parameters) => void;
  visible: Visibility;
  onVisibility: (v: Visibility) => void;
  items: IndicatorDefinition[];
  hideVisibility?: boolean;
}) {
  const [draft, setDraft] = useState(parameters);
  const [previous, setPrevious] = useState(parameters);
  if (parameters !== previous) {
    setPrevious(parameters);
    setDraft(parameters);
  }
  const [error, setError] = useState('');
  return (
    <div className="indicator-controls">
      {!hideVisibility && <h3>Indicators</h3>}
      <p className="small">
        Calculated from full finalized history. Display range changes only the
        view. Layout and valid parameters are saved in this browser when storage
        is available.
      </p>
      {!hideVisibility && (
        <div className="indicator-groups">
          {(['Price & Trend', 'Momentum', 'Volatility', 'Volume'] as const).map(
            (group) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {items
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <label className="checkbox-label" key={item.id}>
                      <input
                        type="checkbox"
                        checked={visible[item.id]}
                        onChange={(event) =>
                          onVisibility({
                            ...visible,
                            [item.id]: event.target.checked,
                          })
                        }
                      />
                      {item.name}
                    </label>
                  ))}
              </fieldset>
            ),
          )}
        </div>
      )}
      <details>
        <summary>Calculation parameters</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const invalid = validateParameters(draft);
            if (invalid) {
              setError(invalid);
              return;
            }
            onParameters({ ...draft });
            setError('');
          }}
        >
          <div className="parameter-grid">
            {(Object.keys(labels) as (keyof Parameters)[]).map((key) => (
              <label key={key}>
                {labels[key]}
                <input
                  aria-label={labels[key]}
                  type="number"
                  step={key === 'bbDeviation' ? 'any' : 1}
                  value={Number.isNaN(draft[key]) ? '' : draft[key]}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [key]:
                        event.target.value === ''
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          {error && (
            <p role="alert">
              {error} Last valid calculations remain displayed.
            </p>
          )}
          <div className="indicator-actions">
            <button type="submit">Apply parameters</button>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...defaults });
                onParameters({ ...defaults });
                setError('');
              }}
            >
              Reset calculation parameters
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
