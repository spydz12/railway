import { StrategyResult } from '../strategies/base';
import { round2 } from '../utils/indicators';
import { config } from '../config';

export interface RiskProfile {
  riskRewardRatio: number;
  riskPct: number;
  isAcceptable: boolean;
}

export function calculateRiskProfile(result: StrategyResult): RiskProfile {
  const entryPrice = result.entry || result.entryPrice || 0;
  const risk = entryPrice - result.stopLoss;
  const reward = result.takeProfit1 - entryPrice;
  const riskRewardRatio = risk > 0 ? round2(reward / risk) : 0;
  const riskPct = entryPrice > 0 ? round2((risk / entryPrice) * 100) : 0;

  // Hard limit: stop loss must never be more than 5% from entry.
  // This prevents extremely wide stops that can result from bad ATR values
  // or mis-calculated levels.
  const MAX_STOP_PCT = 5.0;
  const isAcceptable =
    riskRewardRatio >= config.risk.minRiskReward &&
    riskPct > 0 &&
    riskPct <= MAX_STOP_PCT;

  return { riskRewardRatio, riskPct, isAcceptable };
}

export function applyRiskRules(result: StrategyResult): StrategyResult {
  const profile = calculateRiskProfile(result);
  if (!profile.isAcceptable) return { ...result, valid: false };
  return result;
}
