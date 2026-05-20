import type { StrategyResult } from '../strategies/base';

export interface ExecutionQualityParams {
  spreadPct: number;
  latencyMs: number;
  volatility: number;
}

export interface ExecutionQualityResult {
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number | null;
  slippagePct: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function estimateSlippage(params: ExecutionQualityParams): number {
  const latencyImpact = Math.min(0.02, params.latencyMs / 2000);
  const volatilityImpact = Math.min(0.03, params.volatility / 10);
  const spreadImpact = params.spreadPct / 100;
  return clamp(spreadImpact + latencyImpact + volatilityImpact, 0, 0.08);
}

export function applyExecutionQuality(
  result: StrategyResult,
  params: ExecutionQualityParams
): ExecutionQualityResult {
  const slippagePct = estimateSlippage(params);
  const adjustment = 1 + slippagePct * (result.direction === 'SELL' || result.side === 'SHORT' ? -1 : 1);
  const entryPrice = Number((result.entry * adjustment).toFixed(4));
  const stopLoss = Number((result.stopLoss * adjustment).toFixed(4));
  const takeProfit1 = Number((result.takeProfit1 * adjustment).toFixed(4));
  const takeProfit2 = result.takeProfit2 ? Number((result.takeProfit2 * adjustment).toFixed(4)) : null;

  return {
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    slippagePct: Number((slippagePct * 100).toFixed(2)),
  };
}
