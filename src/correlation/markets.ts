/**
 * Curated index members by industry, largest (approximate market cap) first.
 * There is no reliable free source for live constituents or market caps, so
 * these lists are static and dated; users can edit the tickers before loading.
 */
export const constituentsAsOf = 'June 2026';

export type MarketId = 'dow' | 'sp500' | 'nasdaq100' | 'nse';
export interface Industry {
  id: string;
  name: string;
  symbols: string[];
}
export interface Market {
  id: MarketId;
  name: string;
  currency: 'USD' | 'INR';
  timezone: 'America/New_York' | 'Asia/Kolkata';
  /** Yahoo suffix appended to each ticker when fetching. */
  suffix: '' | '.NS';
  tickerPattern: RegExp;
  industries: Industry[];
}

const us = {
  currency: 'USD',
  timezone: 'America/New_York',
  suffix: '',
  tickerPattern: /^[A-Z][A-Z0-9-]{0,9}$/,
} as const;

export const markets: Market[] = [
  {
    id: 'dow',
    name: 'Dow Jones Industrial Average',
    ...us,
    industries: [
      {
        id: 'all',
        name: 'All sectors (largest members)',
        symbols: [
          'NVDA',
          'MSFT',
          'AAPL',
          'AMZN',
          'JPM',
          'V',
          'WMT',
          'JNJ',
          'HD',
          'PG',
        ],
      },
      {
        id: 'technology',
        name: 'Technology',
        symbols: ['NVDA', 'MSFT', 'AAPL', 'CSCO', 'IBM', 'CRM'],
      },
      {
        id: 'financials',
        name: 'Financials',
        symbols: ['JPM', 'V', 'GS', 'AXP', 'TRV'],
      },
      {
        id: 'health-care',
        name: 'Health care',
        symbols: ['JNJ', 'UNH', 'MRK', 'AMGN'],
      },
      {
        id: 'consumer',
        name: 'Consumer',
        symbols: ['AMZN', 'WMT', 'HD', 'PG', 'KO', 'MCD', 'DIS', 'NKE'],
      },
      {
        id: 'industrials',
        name: 'Industrials & materials',
        symbols: ['CAT', 'HON', 'BA', 'SHW', 'MMM'],
      },
      {
        id: 'energy-telecom',
        name: 'Energy & telecom',
        symbols: ['CVX', 'VZ'],
      },
    ],
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    ...us,
    industries: [
      {
        id: 'all',
        name: 'All sectors (largest members)',
        symbols: [
          'NVDA',
          'MSFT',
          'AAPL',
          'AMZN',
          'GOOGL',
          'META',
          'AVGO',
          'BRK-B',
          'TSLA',
          'JPM',
        ],
      },
      {
        id: 'information-technology',
        name: 'Information technology',
        symbols: [
          'NVDA',
          'MSFT',
          'AAPL',
          'AVGO',
          'ORCL',
          'AMD',
          'CRM',
          'CSCO',
          'IBM',
          'ADBE',
        ],
      },
      {
        id: 'communication-services',
        name: 'Communication services',
        symbols: [
          'GOOGL',
          'META',
          'NFLX',
          'TMUS',
          'DIS',
          'T',
          'VZ',
          'CMCSA',
          'CHTR',
          'EA',
        ],
      },
      {
        id: 'consumer-discretionary',
        name: 'Consumer discretionary',
        symbols: [
          'AMZN',
          'TSLA',
          'HD',
          'MCD',
          'BKNG',
          'TJX',
          'LOW',
          'SBUX',
          'NKE',
          'ORLY',
        ],
      },
      {
        id: 'consumer-staples',
        name: 'Consumer staples',
        symbols: [
          'WMT',
          'COST',
          'PG',
          'KO',
          'PEP',
          'PM',
          'MO',
          'MDLZ',
          'CL',
          'KMB',
        ],
      },
      {
        id: 'financials',
        name: 'Financials',
        symbols: [
          'BRK-B',
          'JPM',
          'V',
          'MA',
          'BAC',
          'WFC',
          'GS',
          'MS',
          'AXP',
          'C',
        ],
      },
      {
        id: 'health-care',
        name: 'Health care',
        symbols: [
          'LLY',
          'JNJ',
          'UNH',
          'ABBV',
          'MRK',
          'TMO',
          'ABT',
          'ISRG',
          'AMGN',
          'PFE',
        ],
      },
      {
        id: 'industrials',
        name: 'Industrials',
        symbols: [
          'GE',
          'CAT',
          'RTX',
          'HON',
          'UNP',
          'BA',
          'DE',
          'LMT',
          'ETN',
          'UPS',
        ],
      },
      {
        id: 'energy',
        name: 'Energy',
        symbols: [
          'XOM',
          'CVX',
          'COP',
          'EOG',
          'WMB',
          'SLB',
          'MPC',
          'PSX',
          'OKE',
          'KMI',
        ],
      },
      {
        id: 'utilities',
        name: 'Utilities',
        symbols: [
          'NEE',
          'SO',
          'DUK',
          'CEG',
          'AEP',
          'SRE',
          'D',
          'EXC',
          'XEL',
          'PCG',
        ],
      },
      {
        id: 'real-estate',
        name: 'Real estate',
        symbols: [
          'PLD',
          'AMT',
          'EQIX',
          'WELL',
          'SPG',
          'PSA',
          'O',
          'DLR',
          'CCI',
          'CBRE',
        ],
      },
      {
        id: 'materials',
        name: 'Materials',
        symbols: [
          'LIN',
          'SHW',
          'APD',
          'ECL',
          'FCX',
          'NEM',
          'CTVA',
          'NUE',
          'DD',
          'DOW',
        ],
      },
    ],
  },
  {
    id: 'nasdaq100',
    name: 'Nasdaq-100',
    ...us,
    industries: [
      {
        id: 'all',
        name: 'All sectors (largest members)',
        symbols: [
          'NVDA',
          'MSFT',
          'AAPL',
          'AMZN',
          'GOOGL',
          'META',
          'AVGO',
          'TSLA',
          'NFLX',
          'COST',
        ],
      },
      {
        id: 'semiconductors',
        name: 'Semiconductors',
        symbols: [
          'NVDA',
          'AVGO',
          'AMD',
          'QCOM',
          'TXN',
          'MU',
          'AMAT',
          'LRCX',
          'KLAC',
          'ADI',
        ],
      },
      {
        id: 'software-hardware',
        name: 'Software & hardware',
        symbols: [
          'MSFT',
          'AAPL',
          'PLTR',
          'CSCO',
          'INTU',
          'ADBE',
          'PANW',
          'CRWD',
          'SNPS',
          'CDNS',
        ],
      },
      {
        id: 'communication-services',
        name: 'Communication services',
        symbols: [
          'GOOGL',
          'META',
          'NFLX',
          'TMUS',
          'CMCSA',
          'EA',
          'TTWO',
          'CHTR',
          'WBD',
        ],
      },
      {
        id: 'consumer',
        name: 'Consumer',
        symbols: [
          'AMZN',
          'TSLA',
          'COST',
          'BKNG',
          'PEP',
          'SBUX',
          'MAR',
          'ORLY',
          'MDLZ',
          'ABNB',
        ],
      },
      {
        id: 'health-care',
        name: 'Health care',
        symbols: [
          'ISRG',
          'AMGN',
          'GILD',
          'VRTX',
          'REGN',
          'IDXX',
          'DXCM',
          'GEHC',
          'BIIB',
          'MRNA',
        ],
      },
      {
        id: 'industrials',
        name: 'Industrials',
        symbols: [
          'HON',
          'ADP',
          'PAYX',
          'CSX',
          'CTAS',
          'ODFL',
          'FAST',
          'PCAR',
          'CPRT',
          'VRSK',
        ],
      },
    ],
  },
  {
    id: 'nse',
    name: 'NSE India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    suffix: '.NS',
    tickerPattern: /^[A-Z0-9][A-Z0-9&_-]{0,39}$/,
    industries: [
      {
        id: 'all',
        name: 'All sectors (largest companies)',
        symbols: [
          'RELIANCE',
          'HDFCBANK',
          'BHARTIARTL',
          'TCS',
          'ICICIBANK',
          'SBIN',
          'INFY',
          'BAJFINANCE',
          'HINDUNILVR',
          'LICI',
        ],
      },
      {
        id: 'banking',
        name: 'Banking',
        symbols: [
          'HDFCBANK',
          'ICICIBANK',
          'SBIN',
          'KOTAKBANK',
          'AXISBANK',
          'BANKBARODA',
          'PNB',
          'CANBK',
          'INDUSINDBK',
          'FEDERALBNK',
        ],
      },
      {
        id: 'financial-services',
        name: 'Financial services',
        symbols: [
          'BAJFINANCE',
          'LICI',
          'BAJAJFINSV',
          'JIOFIN',
          'SBILIFE',
          'HDFCLIFE',
          'SHRIRAMFIN',
          'CHOLAFIN',
          'PFC',
          'RECLTD',
        ],
      },
      {
        id: 'it',
        name: 'Information technology',
        symbols: [
          'TCS',
          'INFY',
          'HCLTECH',
          'WIPRO',
          'TECHM',
          'LTIM',
          'PERSISTENT',
          'COFORGE',
          'MPHASIS',
          'OFSS',
        ],
      },
      {
        id: 'energy',
        name: 'Oil, gas & power',
        symbols: [
          'RELIANCE',
          'NTPC',
          'ONGC',
          'POWERGRID',
          'COALINDIA',
          'IOC',
          'BPCL',
          'ADANIGREEN',
          'TATAPOWER',
          'GAIL',
        ],
      },
      {
        id: 'fmcg',
        name: 'FMCG',
        symbols: [
          'HINDUNILVR',
          'ITC',
          'NESTLEIND',
          'BRITANNIA',
          'TATACONSUM',
          'GODREJCP',
          'VBL',
          'DABUR',
          'MARICO',
          'COLPAL',
        ],
      },
      {
        id: 'auto',
        name: 'Automobile',
        symbols: [
          'MARUTI',
          'M&M',
          'BAJAJ-AUTO',
          'EICHERMOT',
          'TVSMOTOR',
          'HYUNDAI',
          'HEROMOTOCO',
          'BOSCHLTD',
          'MOTHERSON',
          'ASHOKLEY',
        ],
      },
      {
        id: 'pharma',
        name: 'Pharma & healthcare',
        symbols: [
          'SUNPHARMA',
          'DIVISLAB',
          'CIPLA',
          'DRREDDY',
          'APOLLOHOSP',
          'TORNTPHARM',
          'MANKIND',
          'LUPIN',
          'ZYDUSLIFE',
          'AUROPHARMA',
        ],
      },
      {
        id: 'metals',
        name: 'Metals & mining',
        symbols: [
          'JSWSTEEL',
          'TATASTEEL',
          'HINDALCO',
          'VEDL',
          'HINDZINC',
          'JINDALSTEL',
          'NMDC',
          'SAIL',
          'NATIONALUM',
          'APLAPOLLO',
        ],
      },
      {
        id: 'capital-goods',
        name: 'Capital goods & infrastructure',
        symbols: [
          'LT',
          'ADANIPORTS',
          'ULTRACEMCO',
          'HAL',
          'BEL',
          'SIEMENS',
          'ABB',
          'GRASIM',
          'CGPOWER',
          'SHREECEM',
        ],
      },
    ],
  },
];

export function findMarket(id: MarketId): Market {
  return markets.find((market) => market.id === id)!;
}

/** Parses an edited ticker list: upper-case, split on commas/spaces, deduplicated. */
export function parseTickers(market: Market, text: string) {
  const tickers = [
    ...new Set(
      text
        .toUpperCase()
        .split(/[\s,]+/)
        .map((value) =>
          market.suffix && value.endsWith(market.suffix)
            ? value.slice(0, -market.suffix.length)
            : value,
        )
        .filter(Boolean),
    ),
  ];
  return {
    tickers: tickers.filter((ticker) => market.tickerPattern.test(ticker)),
    invalid: tickers.filter((ticker) => !market.tickerPattern.test(ticker)),
  };
}
