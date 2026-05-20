import axios from 'axios';
import { Candle } from '../utils/indicators';
import { MarketDataProvider, Quote } from './base';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('provider:twelvedata');
const BASE_URL = 'https://api.twelvedata.com';

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
};

export class TwelveDataProvider implements MarketDataProvider {
  name = 'twelvedata';

  isConfigured(): boolean {
    return !!config.marketData.twelveDataApiKey;
  }

  async getCandles(ticker: string, timeframe: string, limit = 100): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const interval = INTERVAL_MAP[timeframe] ?? '15min';
    try {
      const resp = await axios.get(`${BASE_URL}/time_series`, {
        params: {
          symbol: ticker,
          interval,
          outputsize: limit,
          format: 'JSON',
          apikey: config.marketData.twelveDataApiKey,
        },
        timeout: 10000,
      });
      const values = resp.data?.values;
      if (!Array.isArray(values)) return [];
      // Twelve Data returns candles newest-first. Use [...values].reverse() to avoid
      // mutating the original response array (Array.prototype.reverse() mutates in place).
      return [...values].reverse().map((v: Record<string, string>) => ({
        time: new Date(v.datetime).getTime(),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume ?? '0'),
      }));
    } catch (err: unknown) {
      log.error('getCandles failed', { ticker, timeframe, err: (err as Error).message });
      return [];
    }
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await axios.get(`${BASE_URL}/price`, {
        params: { symbol: ticker, apikey: config.marketData.twelveDataApiKey },
        timeout: 8000,
      });
      const price = parseFloat(resp.data?.price);
      if (isNaN(price) || price <= 0) return null;
      return {
        ticker,
        price,
        bid: price,
        ask: price,
        volume: 0,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      log.error('getQuote failed', { ticker, err: (err as Error).message });
      return null;
    }
  }

  async getMultipleQuotes(tickers: string[]): Promise<Map<string, Quote>> {
    if (!this.isConfigured()) return new Map();
    try {
      const resp = await axios.get(`${BASE_URL}/price`, {
        params: {
          symbol: tickers.join(','),
          apikey: config.marketData.twelveDataApiKey,
        },
        timeout: 10000,
      });
      const map = new Map<string, Quote>();
      const data = resp.data;
      if (tickers.length === 1) {
        const price = parseFloat(data?.price);
        if (!isNaN(price) && price > 0) {
          map.set(tickers[0], {
            ticker: tickers[0],
            price,
            bid: price,
            ask: price,
            volume: 0,
            timestamp: Date.now(),
          });
        }
      } else {
        for (const ticker of tickers) {
          const price = parseFloat(data[ticker]?.price);
          if (!isNaN(price) && price > 0) {
            map.set(ticker, {
              ticker,
              price,
              bid: price,
              ask: price,
              volume: 0,
              timestamp: Date.now(),
            });
          }
        }
      }
      return map;
    } catch (err: unknown) {
      log.error('getMultipleQuotes failed', { err: (err as Error).message });
      return new Map();
    }
  }
}
