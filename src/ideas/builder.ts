import { StrategyResult } from '../strategies/base';
import { calculateRiskProfile } from '../risk';
import { TradeIdeaInsert } from '../database/queries';
import { AIAnalysisResult } from '../ai/tradeAnalyst';
import { createComponentLogger } from '../utils/logger';

const logger = createComponentLogger('ideas:builder');

export function buildTradeIdea(
  ticker: string,
  companyName: string,
  result: StrategyResult,
  providerName: string,
  aiAnalysis?: AIAnalysisResult | null,
  statusOverride: string = 'pending'
): TradeIdeaInsert {
  const profile = calculateRiskProfile(result);
  const rawDirection = (result.side || (result as any).setup?.side || result.direction) as string | undefined;
  const normalizedDirection = rawDirection?.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';

  logger.debug('[DIRECTION_NORMALIZED]', {
    rawDirection,
    normalizedDirection,
  });

  return {
    ticker,
    company_name: companyName,
    market_type: (result as any).marketType || 'stocks',
    exchange: (result as any).exchange || providerName,
    crypto_metadata: (result as any).cryptoMetadata || null,
    direction: normalizedDirection,
    strategy_slug: result.strategy || result.strategySlug || 'unknown',
    timeframe: result.timeframe,
    entry_price: result.entry || result.entryPrice || null,
    entry_zone_low: result.entryZoneLow || null,
    entry_zone_high: result.entryZoneHigh || null,
    stop_loss: result.stopLoss,
    take_profit_1: result.takeProfit1,
    take_profit_2: result.takeProfit2 || null,
    take_profit_3: result.takeProfit3 || null,
    trailing_rule: result.trailingRule || '',
    invalidation_rule: result.invalidationRule || '',
    confidence_score: result.confidence || result.confidenceScore || 0,
    risk_reward_ratio: result.riskReward || profile.riskRewardRatio,
    reason: result.reasons?.join(', ') || result.reason || '',
    reasons: result.reasons || [],
    volume_confirmation: result.volumeConfirmation || false,
    market_condition: (result as any).marketRegime?.regime || result.marketCondition || 'neutral',
    total_score: (result as any).totalScore || result.confidence || result.confidenceScore || 0,
    signal_quality: (result as any).quality || 'MEDIUM',
    rejection_reasons: (result as any).rejectionReasons || [],
    status: statusOverride,
    provider_used: providerName,
    telegram_message_id: null,
    closed_at: null,
    exit_reason: '',
    // AI fields
    ai_decision: aiAnalysis?.decision || null,
    ai_confidence: aiAnalysis?.aiConfidence || null,
    ai_risk_level: aiAnalysis?.riskLevel || null,
    ai_summary: aiAnalysis?.summary || null,
    ai_approval_reasons: aiAnalysis?.approvalReasons || null,
    ai_risk_warnings: aiAnalysis?.riskWarnings || null,
    ai_suggested_action: aiAnalysis?.suggestedAction || null,
    ai_model_used: 'gpt-4o-mini',
    ai_raw_response: aiAnalysis ? JSON.stringify(aiAnalysis) : null,
  };
}
