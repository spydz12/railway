import axios from 'axios';
import { Candle } from '../utils/indicators';
import { MarketDataProvider, Quote } from './base';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('provider:finnhub');
const BASE_URL = 'https://finnhub.io/api/v1';

const RESOLUTION_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': 'D',
  '1d': 'D',
};

export class FinnhubProvider implements MarketDataProvider {
  name = 'finnhub';

  isConfigured(): boolean {
    return !!config.marketData.finnhubApiKey;
  }

  async getCandles(ticker: string, timeframe: string, limit = 100): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const resolution = RESOLUTION_MAP[timeframe] ?? '15';
    const to = Math.floor(Date.now() / 1000);
    const msPerCandle = this.resolutionToMs(resolution);
    const from = Math.floor((Date.now() - limit * msPerCandle * 1.5) / 1000);

    try {
      const resp = await axios.get(`${BASE_URL}/stock/candle`, {
        params: {
          symbol: ticker,
          resolution,
          from,
          to,
          token: config.marketData.finnhubApiKey,
        },
        timeout: 10000,
      });
      const data = resp.data;
      if (data.s !== 'ok' || !data.c) return [];
      return data.c.map((_: number, i: number) => ({
        time: data.t[i] * 1000,
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i],
      }));
    } catch (err: unknown) {
      log.error('getCandles failed', { ticker, timeframe, err: (err as Error).message });
      return [];
    }
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await axios.get(`${BASE_URL}/quote`, {
        params: { symbol: ticker, token: config.marketData.finnhubApiKey },
        timeout: 8000,
      });
      const q = resp.data;
      if (!q || !q.c) return null;
      return {
        ticker,
        price: q.c,
        bid: q.c,
        ask: q.c,
        volume: q.v ?? 0,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      log.error('getQuote failed', { ticker, err: (err as Error).message });
      return null;
    }
  }

  async getMultipleQuotes(tickers: string[]): Promise<Map<string, Quote>> {
    const map = new Map<string, Quote>();
    for (const ticker of tickers) {
      const q = await this.getQuote(ticker);
      if (q) map.set(ticker, q);
      await new Promise((r) => setTimeout(r, 100));
    }
    return map;
  }

  private resolutionToMs(resolution: string): number {
    const map: Record<string, number> = {
      '1': 60000, '5': 300000, '15': 900000,
      '30': 1800000, '60': 3600000, 'D': 86400000,
    };
    return map[resolution] ?? 900000;
  }
}
