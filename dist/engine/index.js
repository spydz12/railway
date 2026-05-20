"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSetup = validateSetup;
exports.prepareCandles = prepareCandles;
exports.runStrategies = runStrategies;
exports.selectBestSetup = selectBestSetup;
const indicators_1 = require("../utils/indicators");
const strategies_1 = require("../strategies");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const indicators_2 = require("../utils/indicators");
const time_1 = require("../utils/time");
const log = (0, logger_1.createComponentLogger)('engine');
function validateRiskLevels(side, entry, stopLoss, takeProfit1) {
    const issues = [];
    if (side === 'SHORT') {
        if (stopLoss <= entry)
            issues.push('Stop loss is at or below entry price — invalid SHORT setup');
        if (takeProfit1 >= entry)
            issues.push('TP1 is at or above entry price — invalid SHORT setup');
    }
    else {
        if (stopLoss >= entry)
            issues.push('Stop loss is at or above entry price — invalid setup');
        if (takeProfit1 <= entry)
            issues.push('TP1 is at or below entry price — invalid setup');
    }
    return issues;
}
function validateSetup(result, allowShortSelling) {
    const reasons = [];
    if (!result.valid) {
        return { passed: false, reasons: ['Strategy conditions not met'] };
    }
    const confidence = result.confidence || result.confidenceScore || 0;
    const minConfidence = config_1.config.scanner.testMode ? 55 : 60;
    if (confidence < minConfidence) {
        reasons.push(`Confidence too low: ${confidence}% (min ${minConfidence}%)`);
    }
    const entryPrice = result.entry || result.entryPrice || 0;
    if (entryPrice <= 0) {
        reasons.push('No valid entry price');
    }
    const direction = result.side || result.direction;
    const rlIssues = validateRiskLevels(direction ?? 'LONG', entryPrice, result.stopLoss, result.takeProfit1);
    reasons.push(...rlIssues);
    const risk = direction === 'SHORT' ? result.stopLoss - entryPrice : entryPrice - result.stopLoss;
    const reward1 = direction === 'SHORT' ? entryPrice - result.takeProfit1 : result.takeProfit1 - entryPrice;
    if (risk > 0 && reward1 > 0) {
        const rr = (0, indicators_2.round2)(reward1 / risk);
        const minRiskReward = config_1.config.scanner.testMode ? 1.3 : config_1.config.risk.minRiskReward;
        if (rr < minRiskReward) {
            reasons.push(`Risk/reward ${rr} below minimum ${minRiskReward}`);
        }
    }
    const effectiveAllowShorts = allowShortSelling ?? config_1.config.scanner.allowShortSelling;
    if (!effectiveAllowShorts && direction === 'SHORT') {
        reasons.push('Short selling is disabled');
    }
    const entryZoneHigh = result.entryZoneHigh || 0;
    if (entryZoneHigh > 0 && entryPrice > entryZoneHigh * 1.02) {
        reasons.push('Entry price is more than 2% above the entry zone — stale signal');
    }
    return { passed: reasons.length === 0, reasons };
}
function prepareCandles(candles, timeframe) {
    if (candles.length < indicators_1.MIN_CANDLES_REQUIRED)
        return null;
    const sorted = (0, indicators_1.sortCandles)(candles);
    // Reject stale data
    const tfMinutes = (0, time_1.timeframeToMinutes)(timeframe);
    if (!(0, indicators_1.isCandlesFresh)(sorted, tfMinutes)) {
        log.warn(`Stale candle data detected — last candle is older than ${tfMinutes * 3} minutes`);
        return null;
    }
    return sorted;
}
function runStrategies(rawCandles, ticker, timeframe, strategies = (0, strategies_1.getEnabledStrategies)(), allowShortSelling) {
    const candles = prepareCandles(rawCandles, timeframe);
    if (!candles) {
        log.debug(`Candle preparation failed for ${ticker} on ${timeframe}`);
        return [];
    }
    const results = [];
    for (const strategy of strategies) {
        try {
            log.info(`[STRATEGY] Running: ${strategy.name}`, {
                ticker,
                strategy: strategy.slug,
                timeframe,
            });
            const result = strategy.evaluate(candles, ticker, timeframe);
            const confidence = result.confidence || result.confidenceScore || 0;
            const evaluationMeta = {
                ticker,
                strategy: strategy.slug,
                valid: result.valid,
                confidence,
                reasons: result.reasons || [],
                timeframe,
            };
            log.info('[RESULT] Strategy evaluated', evaluationMeta);
            if (result.valid) {
                const validation = validateSetup(result, allowShortSelling);
                if (validation.passed) {
                    log.info('[STRATEGY] Valid setup', {
                        ...evaluationMeta,
                        validationReasons: validation.reasons,
                    });
                    results.push(result);
                }
                else {
                    log.info('[REJECT] Validation failed', {
                        ...evaluationMeta,
                        validationReasons: validation.reasons,
                    });
                }
            }
            else {
                log.info('[REJECT] Strategy conditions not met', evaluationMeta);
            }
        }
        catch (err) {
            log.error(`Strategy ${strategy.slug} threw error for ${ticker}`, {
                err: err.message,
            });
        }
    }
    return results.sort((a, b) => (b.confidence || b.confidenceScore || 0) - (a.confidence || a.confidenceScore || 0));
}
function selectBestSetup(results) {
    if (results.length === 0)
        return null;
    return results[0];
}
