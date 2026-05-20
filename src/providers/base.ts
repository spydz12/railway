import { Candle } from '../utils/indicators';

export interface Quote {
  ticker: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: number;
}

export interface MarketDataProvider {
  name: string;
  isConfigured(): boolean;
  getCandles(ticker: string, timeframe: string, limit: number): Promise<Candle[]>;
  getQuote(ticker: string): Promise<Quote | null>;
  getMultipleQuotes(tickers: string[]): Promise<Map<string, Quote>>;
}

export function candleTimeframeToProviderParam(timeframe: string): string {
  return timeframe;
}
