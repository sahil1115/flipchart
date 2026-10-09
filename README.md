# FlipChart

**Version: v0.1.0**

FlipChart is a stock-chart dashboard that runs in your browser. Explore prices, volume, and 15 technical indicators using demo data, your own CSV files, or a market-data API.

## Run locally

Install [Node.js](https://nodejs.org/) 22.12 or newer, then run:

```sh
git clone https://github.com/sahil1115/flipchart.git
cd flipchart
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

No backend, database server, or API key is needed for demo data or CSV imports.

## Use the dashboard

- Choose **Try Demo** to explore the charts immediately.
- Choose **Import CSV** to load daily price data from a file.
- Pan and zoom the chart, change the date range, and adjust indicator settings.
- Save listings to your watchlist and export chart data as CSV.
- Open Settings to choose Glass Light, Soft Clay, or Midnight Clay and reduce visual effects.

Imported datasets and dashboard preferences stay in this browser when storage is available.

## Connect market data

1. Get your own API key from [Twelve Data](https://twelvedata.com/) or [Alpha Vantage](https://www.alphavantage.co/support/#api-key).
2. Open Settings and choose your provider.
3. Enter the key and select **Use key**.
4. Optionally test the connection, then search for a listing and load its history.

Requests use your provider account and its limits. A connection test can use API credits. Available markets and history depend on your subscription; data refreshes when you request it.

Keys stay in memory unless you select **Remember on this device**. Remembered keys use browser storage. Disconnect removes the saved key. Never commit API keys to Git.

## Build and preview

```sh
npm run build
npm run preview
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The `dist/` folder can be deployed to static hosting; see [deployment instructions](docs/deployment.md).

The production app supports offline reopening of demo and imported data after an initial online visit. Provider requests require internet access, and live provider data is kept only for the current session. Installation is optional and depends on browser support.

## Development checks

```sh
npm run check
```

For browser tests:

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
npm run test:subpath
```

## More information

- [Calculation details](docs/calculations.md)
- [CSV and data format](docs/data-contract.md)
- [Provider setup and limitations](docs/providers.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Contributor

Created and maintained by [Sahil (@sahil1115)](https://github.com/sahil1115).

## License

FlipChart is [MIT licensed](LICENSE). Charts use [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts); third-party notices are included in the app. Market data remains subject to the provider's terms.
