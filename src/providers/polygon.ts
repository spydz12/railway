import axios from 'axios';
import { Candle } from '../utils/indicators';
import { MarketDataProvider, Quote } from './base';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('provider:polygon');
const BASE_URL = 'https://api.polygon.io';
const POLYGON_REQUEST_INTERVAL_MS = parseInt(process.env.POLYGON_REQUEST_INTERVAL_MS || '1500', 10);
const CANDLE_CACHE_TTL_MS = 2 * 60 * 1000;

const TIMEFRAME_MAP: Record<string, { multiplier: number; timespan: string }> = {
  '1m': { multiplier: 1, timespan: 'minute' },
  '5m': { multiplier: 5, timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '30m': { multiplier: 30, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '4h': { multiplier: 4, timespan: 'hour' },
  '1d': { multiplier: 1, timespan: 'day' },
};

type CandleCacheEntry = {
  expiresAt: number;
  candles: Candle[];
};

class RateLimitedQueue {
  private queue: Array<() => void> = [];
  private lastExecution = 0;
  private running = false;

  constructor(private readonly minIntervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const runTask = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.queue.shift();
          this.next();
        }
      };

      this.queue.push(runTask);
      if (!this.running) {
        this.running = true;
        this.next();
      }
    });
  }

  private next(): void {
    const nextTask = this.queue[0];
    if (!nextTask) {
      this.running = false;
      return;
    }

    const elapsed = Date.now() - this.lastExecution;
    const wait = Math.max(0, this.minIntervalMs - elapsed);
    if (wait > 0) {
      setTimeout(() => {
        this.lastExecution = Date.now();
        nextTask();
      }, wait);
    } else {
      this.lastExecution = Date.now();
      nextTask();
    }
  }
}

const polygonRequestQueue = new RateLimitedQueue(POLYGON_REQUEST_INTERVAL_MS);
const candleCache = new Map<string, CandleCacheEntry>();

export class PolygonProvider implements MarketDataProvider {
  name = 'polygon';

  isConfigured(): boolean {
    return !!config.marketData.polygonApiKey;
  }

  private createCacheKey(ticker: string, timeframe: string, limit: number): string {
    return `${ticker}:${timeframe}:${limit}`.toLowerCase();
  }

  private async request<T>(task: () => Promise<T>): Promise<T> {
    return polygonRequestQueue.schedule(task);
  }

  private async fetchCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]> {
    const tf = TIMEFRAME_MAP[timeframe] ?? TIMEFRAME_MAP['15m'];
    const to = new Date();
    const from = new Date(to.getTime() - limit * this.tfToMs(tf) * 1.5);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const makeRequest = async () =>
      axios.get(
        `${BASE_URL}/v2/aggs/ticker/${ticker}/range/${tf.multiplier}/${tf.timespan}/${fromStr}/${toStr}`,
        {
          params: { adjusted: true, sort: 'asc', limit, apiKey: config.marketData.polygonApiKey },
          timeout: 30000,
        }
      );

    try {
      const resp = await this.request(makeRequest);
      const results = resp.data?.results ?? [];
      return results.map((r: Record<string, number>) => ({
        time: r.t,
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
      }));
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        log.warn('Polygon request timed out, retrying once after delay', { ticker, timeframe });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          const resp = await this.request(makeRequest);
          const results = resp.data?.results ?? [];
          return results.map((r: Record<string, number>) => ({
            time: r.t,
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
          }));
        } catch (retryErr: unknown) {
          log.error('getCandles failed after retry', { ticker, timeframe, err: (retryErr as Error).message });
          return [];
        }
      }
      throw err;
    }
  }

  async getCandles(ticker: string, timeframe: string, limit = 100): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const cacheKey = this.createCacheKey(ticker, timeframe, limit);
    const cached = candleCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      log.info(`[provider:polygon] candles fetched ${ticker} ${timeframe} (cache)`);
      return [...cached.candles];
    }

    try {
      const candles = await this.fetchCandles(ticker, timeframe, limit);
      candleCache.set(cacheKey, { candles, expiresAt: Date.now() + CANDLE_CACHE_TTL_MS });
      log.info(`[provider:polygon] candles fetched ${ticker} ${timeframe}`);
      return candles;
    } catch (err: unknown) {
      log.error('getCandles failed', { ticker, timeframe, err: (err as Error).message });
      return [];
    }
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await this.request(() =>
        axios.get(`${BASE_URL}/v2/last/trade/${ticker}`, {
          params: { apiKey: config.marketData.polygonApiKey },
          timeout: 8000,
        })
      );
      const result = resp.data?.results;
      if (!result) return null;
      return {
        ticker,
        price: result.p,
        bid: result.p,
        ask: result.p,
        volume: result.s ?? 0,
        timestamp: result.t,
      };
    } catch (err: unknown) {
      log.error('getQuote failed', { ticker, err: (err as Error).message });
      return null;
    }
  }

  async getMultipleQuotes(tickers: string[]): Promise<Map<string, Quote>> {
    const map = new Map<string, Quote>();
    for (const ticker of tickers) {
      const quote = await this.getQuote(ticker);
      if (quote) map.set(ticker, quote);
    }
    return map;
  }

  private tfToMs(tf: { multiplier: number; timespan: string }): number {
    const base: Record<string, number> = {
      minute: 60000,
      hour: 3600000,
      day: 86400000,
    };
    return tf.multiplier * (base[tf.timespan] ?? 60000);
  }
}
