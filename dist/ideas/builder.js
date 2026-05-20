"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTradeIdea = buildTradeIdea;
const risk_1 = require("../risk");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createComponentLogger)('ideas:builder');
function buildTradeIdea(ticker, companyName, result, providerName, aiAnalysis, statusOverride = 'pending') {
    const profile = (0, risk_1.calculateRiskProfile)(result);
    const rawDirection = (result.side || result.setup?.side || result.direction);
    const normalizedDirection = rawDirection?.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
    logger.info('[DIRECTION_NORMALIZED]', {
        rawDirection,
        normalizedDirection,
    });
    return {
        ticker,
        company_name: companyName,
        market_type: result.marketType || 'stocks',
        exchange: result.exchange || providerName,
        crypto_metadata: result.cryptoMetadata || null,
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
        market_condition: result.marketRegime?.regime || result.marketCondition || 'neutral',
        total_score: result.totalScore || result.confidence || result.confidenceScore || 0,
        signal_quality: result.quality || 'MEDIUM',
        rejection_reasons: result.rejectionReasons || [],
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
