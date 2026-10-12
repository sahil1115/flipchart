export function yahooHistory(count = 300) {
  const timestamp = Array.from(
    { length: count },
    (_, index) => Date.UTC(2025, 0, 1 + index, 3, 45) / 1000,
  );
  const close = timestamp.map((_, index) => 100 + index * 0.1);
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol: 'FIXTURE.NS',
            currency: 'INR',
            exchangeName: 'NSI',
            exchangeTimezoneName: 'Asia/Kolkata',
            instrumentType: 'EQUITY',
            dataGranularity: '1d',
            longName: 'Fictional NSE Company',
          },
          timestamp,
          indicators: {
            quote: [
              {
                open: close.map((value) => value - 1),
                high: close.map((value) => value + 2),
                low: close.map((value) => value - 2),
                close,
                volume: close.map((_, index) =>
                  index === 0 ? 0 : 1000 + index,
                ),
              },
            ],
            adjclose: [{ adjclose: close.map((value) => value / 2) }],
          },
        },
      ],
    },
  };
}
