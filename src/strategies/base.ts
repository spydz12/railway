import { Candle } from '../utils/indicators';

export interface StrategyResult {
  valid: boolean;
  strategy: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  riskReward: number;
  reasons: string[];
  timeframe: string;
  volumeConfirmation: boolean;
  marketCondition: string;
  // Legacy fields for backward compatibility
  strategySlug?: string;
  strategyName?: string;
  direction?: 'BUY' | 'SELL' | 'SHORT';
  entryPrice?: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  trailingRule?: string;
  invalidationRule?: string;
  confidenceScore?: number;
  reason?: string;
}

export const EMPTY_RESULT: StrategyResult = {
  valid: false,
  strategy: '',
  symbol: '',
  side: 'LONG',
  confidence: 0,
  entry: 0,
  stopLoss: 0,
  takeProfit1: 0,
  riskReward: 0,
  reasons: [],
  timeframe: '15m',
  volumeConfirmation: false,
  marketCondition: 'neutral',
};

export interface Strategy {
  slug: string;
  name: string;
  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult;
}
