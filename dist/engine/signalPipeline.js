"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePortfolioRisk = evaluatePortfolioRisk;
exports.evaluateRiskGuardChecks = evaluateRiskGuardChecks;
exports.evaluateMarketSession = evaluateMarketSession;
exports.evaluateMarketStress = evaluateMarketStress;
exports.evaluateReinforcement = evaluateReinforcement;
exports.evaluateExecutionQuality = evaluateExecutionQuality;
exports.suggestSizeFromContext = suggestSizeFromContext;
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const portfolio_1 = require("../portfolio");
const guard_1 = require("../risk/guard");
const sessionBrain_1 = require("../market/sessionBrain");
const stress_1 = require("../market/stress");
const memory_1 = require("../reinforcement/memory");
const executionQuality_1 = require("./executionQuality");
const log = (0, logger_1.createComponentLogger)('signal-pipeline');
function clampConfidence(value) {
    return Math.min(Math.max(value, 0), 100);
}
async function evaluatePortfolioRisk(symbol, marketType, sector, confidence) {
    const snapshot = await (0, portfolio_1.getPortfolioSnapshot)();
    let adjustedConfidence = confidence;
    let rejected = false;
    const reasons = [];
    let label = snapshot.portfolioRiskLevel;
    const sectorExposure = sector ? snapshot.sectorExposure[sector] ?? 0 : 0;
    const totalExposure = Math.max(1, snapshot.totalActiveExposure);
    const sectorPct = Number(((sectorExposure / totalExposure) * 100).toFixed(1));
    const tooMuchExposure = snapshot.normalizedExposure >= 1.2 || snapshot.totalActiveExposure >= config_1.config.portfolio.maxActiveExposure;
    const tooMuchCrypto = marketType === 'crypto' && snapshot.cryptoAllocation >= config_1.config.portfolio.maxCryptoAllocationPct;
    const correlatedClusterLimit = snapshot.correlationClusters.length >= config_1.config.portfolio.correlatedTradeLimit;
    const sectorRisk = marketType === 'stocks' && sectorPct >= config_1.config.portfolio.maxSectorExposurePct;
    if (tooMuchExposure) {
        rejected = true;
        reasons.push(`High portfolio exposure (${snapshot.totalActiveExposure.toFixed(1)} vs max ${config_1.config.portfolio.maxActiveExposure})`);
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
async function evaluateRiskGuardChecks(confidence) {
    const riskGuard = await (0, guard_1.evaluateRiskGuard)();
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
function evaluateMarketSession(marketType, confidence) {
    const session = (0, sessionBrain_1.getMarketSession)(marketType);
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
    }
    else {
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
function evaluateMarketStress(regime, recentLossRate, volatility, confidence) {
    const stressLevel = (0, stress_1.assessMarketStressFromRegime)(regime, recentLossRate, volatility);
    let adjustedConfidence = confidence;
    let fakeoutPenalty = 0;
    let reason;
    if (stressLevel === 'HIGH') {
        adjustedConfidence *= 0.82;
        fakeoutPenalty = 15;
        reason = 'High market stress: tighten filters and reduce size';
    }
    else if (stressLevel === 'MEDIUM') {
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
async function evaluateReinforcement(strategy, marketRegime, marketType, confidence) {
    if (!config_1.config.reinforcement.enabled) {
        return { score: 50, adjustedConfidence: confidence, priorOutcomes: [] };
    }
    const score = await (0, memory_1.getReinforcementScore)(strategy, marketRegime, marketType);
    let adjustedConfidence = confidence;
    if (score < 40) {
        adjustedConfidence *= 0.82;
    }
    else if (score < 55) {
        adjustedConfidence *= 0.92;
    }
    else if (score >= 70) {
        adjustedConfidence *= 1.05;
    }
    adjustedConfidence = clampConfidence(adjustedConfidence);
    const priorOutcomes = await (0, memory_1.getPriorSimilarOutcomes)(strategy, marketRegime, marketType, 3);
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
function evaluateExecutionQuality(result, spreadPct, volatility, confidence) {
    if (!config_1.config.executionQuality.enabled) {
        return {
            executionQuality: { entryPrice: result.entry, stopLoss: result.stopLoss, takeProfit1: result.takeProfit1, takeProfit2: result.takeProfit2 || null, slippagePct: 0 },
            adjustedConfidence: confidence,
            rejected: false,
        };
    }
    const params = {
        spreadPct: spreadPct || config_1.config.executionQuality.baseSpreadPct * 100,
        latencyMs: 220,
        volatility,
    };
    const slippagePct = (0, executionQuality_1.estimateSlippage)(params);
    const executionQuality = (0, executionQuality_1.applyExecutionQuality)(result, params);
    let adjustedConfidence = confidence;
    let rejected = false;
    let reason;
    if (slippagePct > config_1.config.executionQuality.maxSlippagePct) {
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
async function suggestSizeFromContext(result, marketType, marketRegime, aiConfidence, fakeoutProbability, volatilityLevel, recentDrawdown, currentExposure) {
    try {
        return await (0, portfolio_1.suggestPositionSizing)({
            strategy: result.strategy,
            marketRegime,
            marketType,
            aiConfidence,
            fakeoutProbability,
            volatilityLevel,
            recentDrawdown,
            currentExposure,
        });
    }
    catch (error) {
        log.warn('[POSITION_SIZING] Failed to suggest size', { symbol: result.symbol, error: error.message });
        return undefined;
    }
}
