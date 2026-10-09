"""Independent Phase 5 oracle: TA-Lib and NumPy, no application imports.
Run python tests/fixtures/generate-extended-reference.py; packages remain ignored.
"""
import sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'verification/reference-tooling'))
import numpy as np
import talib
base = json.loads((ROOT / 'tests/fixtures/indicator-reference.json').read_text())
def clean(values):
    return [float(v) if np.isfinite(v) else None for v in values]
def oracle(bars, p):
    c = np.array([b['close'] for b in bars], dtype=float)
    h = np.array([b['high'] for b in bars], dtype=float)
    l = np.array([b['low'] for b in bars], dtype=float)
    k, d = talib.STOCH(h,l,c,fastk_period=p['stochasticPeriod'],slowk_period=p['stochasticK'],slowk_matype=0,slowd_period=p['stochasticD'],slowd_matype=0)
    vol = {}
    for interval, factor in [('daily',252),('weekly',52),('monthly',12)]:
        result = [None] * len(c)
        returns = np.diff(np.log(c))
        n = p['volatilityPeriod']
        for i in range(n,len(c)):
            result[i] = float(np.std(returns[i-n:i],ddof=1)*np.sqrt(factor)*100)
        vol[interval] = result
    return dict(stochastic=dict(k=clean(k),d=clean(d)),directional=dict(adx=clean(talib.ADX(h,l,c,p['adxPeriod'])),plus=clean(talib.PLUS_DI(h,l,c,p['adxPeriod'])),minus=clean(talib.MINUS_DI(h,l,c,p['adxPeriod']))),cci=clean(talib.CCI(h,l,c,p['cciPeriod'])),williams=clean(talib.WILLR(h,l,c,p['williamsPeriod'])),roc=clean(talib.ROC(c,p['rocPeriod'])),volatility=vol)
default = dict(stochasticPeriod=14,stochasticK=3,stochasticD=3,adxPeriod=14,cciPeriod=20,williamsPeriod=14,rocPeriod=12,volatilityPeriod=20)
small = dict(stochasticPeriod=5,stochasticK=2,stochasticD=4,adxPeriod=4,cciPeriod=5,williamsPeriod=7,rocPeriod=3,volatilityPeriod=4)
bars = base['candles']
flat = [dict(b,open=10,high=10,low=10,close=10,volume=0) for b in bars[:80]]
output = dict(reference=dict(implementation='TA-Lib Python plus NumPy std(ddof=1) of log returns',version=talib.__version__,cLibrary=talib.__ta_version__.decode(),numpy=np.__version__,generated='2026-10-09',absoluteTolerance=1e-8,relativeTolerance=1e-10,conventions='TA-Lib default compatibility and zero unstable periods; stochastic SMA smoothing and aligned starts; Wilder ADX/DI; CCI mean absolute deviation; sample log-return volatility'),cases=[dict(candles=b,parameters=p,expected=oracle(b,p)) for b,p in [(bars,default),(bars,small),(flat,default)]])
(ROOT / 'tests/fixtures/extended-reference.json').write_text(json.dumps(output,indent=2)+'\n',encoding='utf-8')
print(output['reference'])
