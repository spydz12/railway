import axios from 'axios';
import { Candle } from '../utils/indicators';
import { MarketDataProvider, Quote } from './base';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('provider:alpaca');
const DATA_URL = 'https://data.alpaca.markets/v2';
const PAPER_HEADERS = () => ({
  'APCA-API-KEY-ID': config.marketData.alpacaApiKey,
  'APCA-API-SECRET-KEY': config.marketData.alpacaApiSecret,
});

const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '4h': '4Hour',
  '1d': '1Day',
};

export class AlpacaProvider implements MarketDataProvider {
  name = 'alpaca';

  isConfigured(): boolean {
    return !!(config.marketData.alpacaApiKey && config.marketData.alpacaApiSecret);
  }

  async getCandles(ticker: string, timeframe: string, limit = 100): Promise<Candle[]> {
    if (!this.isConfigured()) return [];
    const tf = TIMEFRAME_MAP[timeframe] ?? '15Min';
    try {
      const resp = await axios.get(`${DATA_URL}/stocks/${ticker}/bars`, {
        headers: PAPER_HEADERS(),
        params: {
          timeframe: tf,
          limit,
          adjustment: 'raw',
          feed: 'sip',
        },
        timeout: 10000,
      });
      const bars = resp.data?.bars ?? [];
      return bars.map((b: Record<string, number | string>) => ({
        time: new Date(b.t as string).getTime(),
        open: b.o as number,
        high: b.h as number,
        low: b.l as number,
        close: b.c as number,
        volume: b.v as number,
      }));
    } catch (err: unknown) {
      log.error('getCandles failed', { ticker, timeframe, err: (err as Error).message });
      return [];
    }
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    if (!this.isConfigured()) return null;
    try {
      const resp = await axios.get(`${DATA_URL}/stocks/${ticker}/quotes/latest`, {
        headers: PAPER_HEADERS(),
        params: { feed: 'sip' },
        timeout: 8000,
      });
      const q = resp.data?.quote;
      if (!q) return null;
      const mid = (q.ap + q.bp) / 2;
      return {
        ticker,
        price: mid,
        bid: q.bp,
        ask: q.ap,
        volume: 0,
        timestamp: new Date(q.t).getTime(),
      };
    } catch (err: unknown) {
      log.error('getQuote failed', { ticker, err: (err as Error).message });
      return null;
    }
  }

  async getMultipleQuotes(tickers: string[]): Promise<Map<string, Quote>> {
    if (!this.isConfigured()) return new Map();
    try {
      const resp = await axios.get(`${DATA_URL}/stocks/quotes/latest`, {
        headers: PAPER_HEADERS(),
        params: { symbols: tickers.join(','), feed: 'sip' },
        timeout: 10000,
      });
      const quotes = resp.data?.quotes ?? {};
      const map = new Map<string, Quote>();
      for (const [ticker, q] of Object.entries(quotes) as [string, Record<string, number | string>][]) {
        map.set(ticker, {
          ticker,
          price: ((q.ap as number) + (q.bp as number)) / 2,
          bid: q.bp as number,
          ask: q.ap as number,
          volume: 0,
          timestamp: new Date(q.t as string).getTime(),
        });
      }
      return map;
    } catch (err: unknown) {
      log.error('getMultipleQuotes failed', { err: (err as Error).message });
      return new Map();
    }
  }
}
