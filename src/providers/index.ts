import { MarketDataProvider } from './base';
import { PolygonProvider } from './polygon';
import { AlpacaProvider } from './alpaca';
import { FinnhubProvider } from './finnhub';
import { TwelveDataProvider } from './twelvedata';
import { BinanceProvider } from './binance';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

export type { MarketDataProvider, Quote } from './base';

const log = createComponentLogger('providers');

const STOCK_PROVIDERS: MarketDataProvider[] = [
  new PolygonProvider(),
  new AlpacaProvider(),
  new FinnhubProvider(),
  new TwelveDataProvider(),
];

const CRYPTO_PROVIDERS: MarketDataProvider[] = [
  new BinanceProvider(),
];

let _activeStockProvider: MarketDataProvider | null = null;
let _activeCryptoProvider: MarketDataProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (_activeStockProvider) return _activeStockProvider;

  const preferred = config.marketData.provider.toLowerCase();
  const preferredProvider = STOCK_PROVIDERS.find(
    (p) => p.name === preferred && p.isConfigured()
  );

  if (preferredProvider) {
    log.info(`Using preferred stock market data provider: ${preferredProvider.name}`);
    _activeStockProvider = preferredProvider;
    return _activeStockProvider;
  }

  const fallback = STOCK_PROVIDERS.find((p) => p.isConfigured());
  if (fallback) {
    log.warn(`Preferred stock provider "${preferred}" not configured. Falling back to: ${fallback.name}`);
    _activeStockProvider = fallback;
    return _activeStockProvider;
  }

  throw new Error(
    'No stock market data provider is configured. Please set at least one API key (POLYGON_API_KEY, ALPACA_API_KEY, FINNHUB_API_KEY, or TWELVE_DATA_API_KEY).'
  );
}

export function getCryptoProvider(): MarketDataProvider {
  if (_activeCryptoProvider) return _activeCryptoProvider;

  if (!config.crypto.enabled) {
    throw new Error('Crypto provider requested but ENABLE_CRYPTO is disabled');
  }

  const preferred = config.crypto.provider.toLowerCase();
  const preferredProvider = CRYPTO_PROVIDERS.find(
    (p) => p.name === preferred && p.isConfigured()
  );

  if (preferredProvider) {
    log.info(`Using crypto market data provider: ${preferredProvider.name}`);
    _activeCryptoProvider = preferredProvider;
    return _activeCryptoProvider;
  }

  const fallback = CRYPTO_PROVIDERS.find((p) => p.isConfigured());
  if (fallback) {
    log.warn(`Preferred crypto provider "${preferred}" not configured. Falling back to: ${fallback.name}`);
    _activeCryptoProvider = fallback;
    return _activeCryptoProvider;
  }

  throw new Error('No crypto market data provider is configured. Please set CRYPTO_PROVIDER=binance.');
}

export function getProviderStatus(): { name: string; configured: boolean }[] {
  return [
    ...STOCK_PROVIDERS.map((p) => ({ name: p.name, configured: p.isConfigured() })),
    ...CRYPTO_PROVIDERS.map((p) => ({ name: p.name, configured: p.isConfigured() })),
  ];
}

export async function getQuoteWithFailover(
  ticker: string,
  marketType: 'stocks' | 'crypto' = 'stocks'
) {
  const providers = marketType === 'crypto' ? CRYPTO_PROVIDERS : STOCK_PROVIDERS;
  const configured = providers.filter((p) => p.isConfigured());

  for (const provider of configured) {
    try {
      const quote = await provider.getQuote(ticker);
      if (quote && quote.price > 0) {
        if ((marketType === 'stocks' ? _activeStockProvider : _activeCryptoProvider)?.name !== provider.name) {
          log.warn(`Provider failover activated for ${ticker}: ${provider.name}`);
          if (marketType === 'stocks') {
            _activeStockProvider = provider;
          } else {
            _activeCryptoProvider = provider;
          }
        }
        return quote;
      }
    } catch (error) {
      log.warn('Provider quote failed, trying fallback', {
        provider: provider.name,
        ticker,
        err: (error as Error).message,
      });
    }
  }

  return null;
}

export async function getCandlesWithFailover(
  ticker: string,
  timeframe: string,
  limit: number,
  marketType: 'stocks' | 'crypto' = 'stocks'
) {
  const providers = marketType === 'crypto' ? CRYPTO_PROVIDERS : STOCK_PROVIDERS;
  const configured = providers.filter((p) => p.isConfigured());

  for (const provider of configured) {
    try {
      const candles = await provider.getCandles(ticker, timeframe, limit);
      if (candles.length > 0) {
        if ((marketType === 'stocks' ? _activeStockProvider : _activeCryptoProvider)?.name !== provider.name) {
          log.warn(`Provider failover activated for candles ${ticker}: ${provider.name}`);
          if (marketType === 'stocks') {
            _activeStockProvider = provider;
          } else {
            _activeCryptoProvider = provider;
          }
        }
        return candles;
      }
    } catch (error) {
      log.warn('Provider candles failed, trying fallback', {
        provider: provider.name,
        ticker,
        timeframe,
        err: (error as Error).message,
      });
    }
  }

  return [];
}
