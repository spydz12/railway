import { createComponentLogger } from '../utils/logger';
import { config } from '../config';
import {
  getPortfolioSnapshot,
  suggestPositionSizing,
  PortfolioExposure,
  PositionSizingSuggestion,
} from '../portfolio';
import { evaluateRiskGuard, RiskGuardResult } from '../risk/guard';
import { getMarketSession, SessionContext } from '../market/sessionBrain';
import {
  assessMarketStressFromRegime,
  estimateVolatilityLevel,
  MarketStressLevel,
} from '../market/stress';
import {
  getPriorSimilarOutcomes,
  getReinforcementScore,
  PriorTradeOutcome,
} from '../reinforcement/memory';
import {
  applyExecutionQuality,
  estimateSlippage,
  ExecutionQualityParams,
  ExecutionQualityResult,
} from './executionQuality';
import { StrategyResult } from '../strategies/base';

const log = createComponentLogger('signal-pipeline');

export interface PipelineEnrichment {
  portfolioSnapshot: PortfolioExposure;
  portfolioRiskLabel: string;
  portfolioRejectionReason?: string;
  portfolioAdjustedConfidence: number;
  riskGuard: RiskGuardResult;
  sessionContext: SessionContext;
  marketStressLevel: MarketStressLevel;
  reinforcementScore: number;
  similarTradeOutcomes: PriorTradeOutcome[];
  executionQuality?: ExecutionQualityResult;
  positionSizing?: PositionSizingSuggestion;
  adjustedConfidence: number;
  pausedByRiskGuard: boolean;
}

function clampConfidence(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

export async function evaluatePortfolioRisk(
  symbol: string,
  marketType: 'stocks' | 'crypto',
  sector: string,
  confidence: number
): Promise<{
  snapshot: PortfolioExposure;
  adjustedConfidence: number;
  rejected: boolean;
  reason: string | null;
  label: string;
}> {
  const snapshot = await getPortfolioSnapshot();
  let adjustedConfidence = confidence;
  let rejected = false;
  const reasons: string[] = [];
  let label = snapshot.portfolioRiskLevel;

  const sectorExposure = sector ? snapshot.sectorExposure[sector] ?? 0 : 0;
  const totalExposure = Math.max(1, snapshot.totalActiveExposure);
  const sectorPct = Number(((sectorExposure / totalExposure) * 100).toFixed(1));
  const tooMuchExposure = snapshot.normalizedExposure >= 1.2 || snapshot.totalActiveExposure >= config.portfolio.maxActiveExposure;
  const tooMuchCrypto = marketType === 'crypto' && snapshot.cryptoAllocation >= config.portfolio.maxCryptoAllocationPct;
  const correlatedClusterLimit = snapshot.correlationClusters.length >= config.portfolio.correlatedTradeLimit;
  const sectorRisk = marketType === 'stocks' && sectorPct >= config.portfolio.maxSectorExposurePct;

  if (tooMuchExposure) {
    rejected = true;
    reasons.push(`High portfolio exposure (${snapshot.totalActiveExposure.toFixed(1)} vs max ${config.portfolio.maxActiveExposure})`);
  }

  if (tooMuchCrypto) {
    rejected = true;
    reasons.push(`Crypto allocation too high (${snapshot.cryptoAllocation.toFixed(1)}%)`);
  }

  if (correlatedClusterLimit) {
    adjustedConfidence *= 0.85;
    reasons.push('Correlated trade exposure limit reached');
  }

  if (sectorRisk) {
    adjustedConfidence *= 0.88;
    reasons.push(`Sector exposure ${sectorPct}% above limit`);
  }

  adjustedConfidence = clampConfidence(adjustedConfidence);

  if (!rejected && adjustedConfidence < confidence) {
    label = 'MEDIUM';
  }

  if (reasons.length > 0) {
    log.info('[PORTFOLIO_RISK]', {
      symbol,
      marketType,
      sector,
      confidence,
      adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
      reason: reasons.join('; '),
      snapshot,
    });
  }

  return {
    snapshot,
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    rejected,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
    label: `${snapshot.portfolioRiskLevel} (${snapshot.normalizedExposure.toFixed(2)}x exposure)`,
  };
}

export async function evaluateRiskGuardChecks(
  confidence: number
): Promise<{
  riskGuard: RiskGuardResult;
  adjustedConfidence: number;
  paused: boolean;
}> {
  const riskGuard = await evaluateRiskGuard();
  const adjustedConfidence = Number(clampConfidence(confidence * riskGuard.confidenceModifier).toFixed(1));

  log.info('[RISK_GUARD]', {
    confidence,
    adjustedConfidence,
    pauseTrading: riskGuard.pauseTrading,
    riskLevel: riskGuard.riskLevel,
    consecutiveLosses: riskGuard.consecutiveLosses,
    estimatedDrawdownPct: riskGuard.estimatedDrawdownPct,
    reason: riskGuard.reason,
  });

  return {
    riskGuard,
    adjustedConfidence,
    paused: riskGuard.pauseTrading,
  };
}

export function evaluateMarketSession(
  marketType: 'stocks' | 'crypto',
  confidence: number
): { session: SessionContext; adjustedConfidence: number } {
  const session = getMarketSession(marketType);
  let adjustedConfidence = confidence;

  if (marketType === 'stocks') {
    switch (session.session) {
      case 'premarket':
        adjustedConfidence *= 0.92;
        break;
      case 'midday_chop':
        adjustedConfidence *= 0.95;
        break;
      case 'power_hour':
        adjustedConfidence *= 1.05;
        break;
      case 'after_hours':
        adjustedConfidence *= 0.88;
        break;
      default:
        break;
    }
  } else {
    switch (session.session) {
      case 'weekend':
        adjustedConfidence *= 0.90;
        break;
      case 'asia':
        adjustedConfidence *= 0.95;
        break;
      case 'london':
        adjustedConfidence *= 1.00;
        break;
      case 'new_york_overlap':
        adjustedConfidence *= 1.08;
        break;
      default:
        adjustedConfidence *= 0.94;
        break;
    }
  }

  adjustedConfidence = clampConfidence(adjustedConfidence);

  if (adjustedConfidence !== confidence) {
    log.info('[SESSION_BRAIN]', {
      marketType,
      session: session.session,
      description: session.description,
      originalConfidence: confidence,
      adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    });
  }

  return { session, adjustedConfidence: Number(adjustedConfidence.toFixed(1)) };
}

export function evaluateMarketStress(
  regime: string,
  recentLossRate: number,
  volatility: number,
  confidence: number
): { stressLevel: MarketStressLevel; adjustedConfidence: number; fakeoutPenalty: number; reason?: string } {
  const stressLevel = assessMarketStressFromRegime(regime, recentLossRate, volatility);
  let adjustedConfidence = confidence;
  let fakeoutPenalty = 0;
  let reason: string | undefined;

  if (stressLevel === 'HIGH') {
    adjustedConfidence *= 0.82;
    fakeoutPenalty = 15;
    reason = 'High market stress: tighten filters and reduce size';
  } else if (stressLevel === 'MEDIUM') {
    adjustedConfidence *= 0.92;
    fakeoutPenalty = 8;
    reason = 'Medium market stress: moderate risk reduction';
  }

  adjustedConfidence = clampConfidence(adjustedConfidence);

  if (reason) {
    log.info('[MARKET_STRESS]', {
      regime,
      recentLossRate,
      volatility,
      stressLevel,
      originalConfidence: confidence,
      adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
      fakeoutPenalty,
      reason,
    });
  }

  return {
    stressLevel,
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    fakeoutPenalty,
    reason,
  };
}

export async function evaluateReinforcement(
  strategy: string,
  marketRegime: string,
  marketType: 'stocks' | 'crypto',
  confidence: number
): Promise<{
  score: number;
  adjustedConfidence: number;
  priorOutcomes: PriorTradeOutcome[];
}> {
  if (!config.reinforcement.enabled) {
    return { score: 50, adjustedConfidence: confidence, priorOutcomes: [] };
  }

  const score = await getReinforcementScore(strategy, marketRegime, marketType);
  let adjustedConfidence = confidence;

  if (score < 40) {
    adjustedConfidence *= 0.82;
  } else if (score < 55) {
    adjustedConfidence *= 0.92;
  } else if (score >= 70) {
    adjustedConfidence *= 1.05;
  }

  adjustedConfidence = clampConfidence(adjustedConfidence);

  const priorOutcomes = await getPriorSimilarOutcomes(strategy, marketRegime, marketType, 3);

  log.info('[REINFORCEMENT]', {
    strategy,
    marketRegime,
    marketType,
    score,
    priorOutcomes,
    originalConfidence: confidence,
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
  });

  return {
    score,
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    priorOutcomes,
  };
}

export function evaluateExecutionQuality(
  result: StrategyResult,
  spreadPct: number,
  volatility: number,
  confidence: number
): {
  executionQuality: ExecutionQualityResult;
  adjustedConfidence: number;
  rejected: boolean;
  reason?: string;
} {
  if (!config.executionQuality.enabled) {
    return {
      executionQuality: { entryPrice: result.entry, stopLoss: result.stopLoss, takeProfit1: result.takeProfit1, takeProfit2: result.takeProfit2 || null, slippagePct: 0 },
      adjustedConfidence: confidence,
      rejected: false,
    };
  }

  const params: ExecutionQualityParams = {
    spreadPct: spreadPct || config.executionQuality.baseSpreadPct * 100,
    latencyMs: 220,
    volatility,
  };
  const slippagePct = estimateSlippage(params);
  const executionQuality = applyExecutionQuality(result, params);
  let adjustedConfidence = confidence;
  let rejected = false;
  let reason: string | undefined;

  if (slippagePct > config.executionQuality.maxSlippagePct) {
    adjustedConfidence *= 0.88;
    reason = 'Execution quality risk high due to spread/slippage';
    if (confidence < 75) {
      rejected = true;
    }
  }

  adjustedConfidence = clampConfidence(adjustedConfidence);

  log.info('[EXECUTION_QUALITY]', {
    symbol: result.symbol,
    strategy: result.strategy,
    spreadPct: params.spreadPct,
    volatility,
    slippagePct: Number((slippagePct * 100).toFixed(2)),
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    rejected,
    reason,
  });

  return {
    executionQuality,
    adjustedConfidence: Number(adjustedConfidence.toFixed(1)),
    rejected,
    reason,
  };
}

export async function suggestSizeFromContext(
  result: StrategyResult,
  marketType: 'stocks' | 'crypto',
  marketRegime: string,
  aiConfidence: number,
  fakeoutProbability: number,
  volatilityLevel: number,
  recentDrawdown: number,
  currentExposure: number
): Promise<PositionSizingSuggestion | undefined> {
  try {
    return await suggestPositionSizing({
      strategy: result.strategy,
      marketRegime,
      marketType,
      aiConfidence,
      fakeoutProbability,
      volatilityLevel,
      recentDrawdown,
      currentExposure,
    });
  } catch (error) {
    log.warn('[POSITION_SIZING] Failed to suggest size', { symbol: result.symbol, error: (error as Error).message });
    return undefined;
  }
}
