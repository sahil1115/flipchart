"""Developer-only oracle; install TA-Lib into verification/reference-tooling.
Run: python tests/fixtures/generate-indicator-reference.py
No FlipChart calculation code is imported.
"""
import sys
from pathlib import Path
import json
from datetime import date, timedelta

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'verification/reference-tooling'))
import numpy as np
import talib

bars = []
day = date(2025, 1, 1)
for i in range(240):
    while day.weekday() >= 5:
        day += timedelta(days=1)
    # Fixed integer-cent movements, including flat/equal closes and gaps.
    close = (10000 + i * 7 + ((i % 11) - 5) * 43) / 100
    opening = close + ((i % 3) - 1) * .3
    bars.append(dict(time=day.isoformat(), open=opening,
                     high=max(opening, close) + .5 + (i % 4) * .1,
                     low=min(opening, close) - .4,
                     close=close, volume=0 if i % 17 == 0 else 1000 + i * 13))
    day += timedelta(days=1 if i % 29 else 3)

c = np.array([b['close'] for b in bars], dtype=float)
h = np.array([b['high'] for b in bars], dtype=float)
l = np.array([b['low'] for b in bars], dtype=float)
v = np.array([b['volume'] for b in bars], dtype=float)
def clean(values):
    return [float(value) if np.isfinite(value) else None for value in values]
def reference(p):
    upper, middle, lower = talib.BBANDS(c, timeperiod=p['bbPeriod'], nbdevup=p['bbDeviation'], nbdevdn=p['bbDeviation'], matype=0)
    line, signal, histogram = talib.MACD(c, fastperiod=p['macdFast'], slowperiod=p['macdSlow'], signalperiod=p['macdSignal'])
    return dict(smaShort=clean(talib.SMA(c,p['smaShort'])), smaMedium=clean(talib.SMA(c,p['smaMedium'])), smaLong=clean(talib.SMA(c,p['smaLong'])),
                emaFast=clean(talib.EMA(c,p['emaFast'])), emaSlow=clean(talib.EMA(c,p['emaSlow'])),
                volumeAverage=clean(talib.SMA(v,p['volumePeriod'])),
                bollinger=dict(upper=clean(upper),middle=clean(middle),lower=clean(lower)),
                rsi=clean(talib.RSI(c,p['rsiPeriod'])), atr=clean(talib.ATR(h,l,c,p['atrPeriod'])), obv=clean(talib.OBV(c,v)),
                macd=dict(line=clean(line),signal=clean(signal),histogram=clean(histogram)))
default = dict(smaShort=20,smaMedium=50,smaLong=200,emaFast=12,emaSlow=26,bbPeriod=20,bbDeviation=2,rsiPeriod=14,macdFast=12,macdSlow=26,macdSignal=9,atrPeriod=14,volumePeriod=20)
small = dict(smaShort=3,smaMedium=5,smaLong=9,emaFast=3,emaSlow=7,bbPeriod=5,bbDeviation=1.5,rsiPeriod=4,macdFast=3,macdSlow=7,macdSignal=4,atrPeriod=4,volumePeriod=5)
output = dict(reference=dict(implementation='TA-Lib Python',version=talib.__version__,cLibrary=talib.__ta_version__.decode(),numpy=np.__version__,absoluteTolerance=1e-8,relativeTolerance=1e-10,generated='2026-10-09',conventions='Default compatibility; unstable periods zero; SMA-seeded EMA; Wilder RSI/ATR; population BB variance; TA-Lib aligned MACD seeds; OBV first-volume baseline'), candles=bars,cases=[dict(parameters=p,expected=reference(p)) for p in [default,small]])
(ROOT / 'tests/fixtures/indicator-reference.json').write_text(json.dumps(output, indent=2)+'\n', encoding='utf-8')
print(output['reference'])
