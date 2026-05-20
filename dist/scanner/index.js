"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScan = runScan;
const queries_1 = require("../database/queries");
const providers_1 = require("../providers");
const engine_1 = require("../engine");
const builder_1 = require("../ideas/builder");
const bot_1 = require("../telegram/bot");
const config_1 = require("../config");
const time_1 = require("../utils/time");
const logger_1 = require("../utils/logger");
const scoring_1 = require("../scoring");
const regime_1 = require("../market/regime");
const indicators_1 = require("../utils/indicators");
const tradeAnalyst_1 = require("../ai/tradeAnalyst");
const strategyPerformance_1 = require("../performance/strategyPerformance");
const signalPipeline_1 = require("../engine/signalPipeline");
const p_limit_1 = __importDefault(require("p-limit"));
const metrics_1 = require("../observability/metrics");
const log = (0, logger_1.createComponentLogger)('scanner');
const TIMEFRAMES = ['15m'];
const CANDLE_LIMIT = 250;
function normalizeTimestamp(ts) {
    // Providers may return seconds (10-digit) or milliseconds (13-digit)
    return ts < 1000000000000 ? ts * 1000 : ts;
}
// Map timeframe to approximate candles per day (for volume normalization)
const CANDLES_PER_DAY = {
    '1m': 390, '5m': 78, '15m': 26, '30m': 13,
    '1h': 7, '4h': 2, '1d': 1,
};
const scoringEngine = new scoring_1.ScoringEngine();
const regimeDetector = new regime_1.MarketRegimeDetector();
function clampConfidence(value) {
    return Math.min(Math.max(value, 0), 100);
}
const aiLimit = (0, p_limit_1.default)(2);
const scanSummary = {
    symbolsScanned: 0,
    setupsFound: 0,
    portfolioRejected: 0,
    riskGuardRejected: 0,
    stressRejected: 0,
    reinforcementReduced: 0,
    aiApproved: 0,
    aiRejected: 0,
    telegramSent: 0,
    watchSignals: 0,
    staleRejected: 0,
    insufficientCandles: 0,
    timeouts: 0,
};
async function runScan() {
    if (config_1.config.scanner.marketSessionFilter && !(0, time_1.isUSMarketOpen)()) {
        log.info('Market is closed. Skipping scan.');
        return;
    }
    // Note: daily count is re-checked inside scanStock before each insert
    // to avoid a race condition where multiple concurrent stocks could all
    // pass the count check before any of them increments it.
    const initialCount = await (0, queries_1.countTodayTradeIdeas)();
    if (initialCount >= config_1.config.scanner.maxSignalsPerDay) {
        log.info(`Max signals per day reached (${initialCount}/${config_1.config.scanner.maxSignalsPerDay}). Skipping scan.`);
        return;
    }
    const stocks = await (0, queries_1.getActiveStocks)();
    const activeTickers = new Set(stocks.map((stock) => stock.ticker));
    const defaultWatchlist = config_1.config.scanner.defaultWatchlist;
    const fallbackStocks = defaultWatchlist
        .filter((ticker) => !activeTickers.has(ticker))
        .map((ticker) => ({
        id: `fallback-${ticker}`,
        ticker,
        company_name: ticker,
        sector: 'Unknown',
        active: true,
        min_volume: config_1.config.scanner.testMode ? 100000 : 250000,
    }));
    const allStocks = [...stocks, ...fallbackStocks];
    if (allStocks.length === 0) {
        log.warn('No active stocks in watchlist.');
        return;
    }
    const effectiveMinVolume = config_1.config.scanner.testMode
        ? Math.max(0, config_1.config.scanner.minVolumeFilter * 0.5)
        : config_1.config.scanner.minVolumeFilter;
    const filteredStocks = allStocks
        .filter((stock) => stock.min_volume >= effectiveMinVolume)
        .slice(0, config_1.config.scanner.maxStocksPerScan);
    if (filteredStocks.length === 0) {
        log.warn('No stocks pass the minimum volume filter for this scan.');
        return;
    }
    if (filteredStocks.length < stocks.length) {
        log.info(`Filtered out ${stocks.length - filteredStocks.length} low-volume stocks. Scanning ${filteredStocks.length} symbols.`);
    }
    log.info(`Scanning ${filteredStocks.length} stocks across ${TIMEFRAMES.join(', ')} timeframes...`);
    if (config_1.config.scanner.testMode) {
        log.warn('TEST_MODE active: relaxing confidence and volume thresholds for validation.');
    }
    if (config_1.config.scanner.debugSignals) {
        log.warn('DEBUG_SIGNALS active: every evaluated setup will be logged to assist validation.');
    }
    await processWatchCandidates();
    const provider = (0, providers_1.getProvider)();
    const limit = (0, p_limit_1.default)(Math.max(1, config_1.config.scanner.concurrentStocks));
    async function processWatchCandidates() {
        const watchCandidates = await (0, queries_1.getWatchCandidatesByMarketType)('stocks');
        if (watchCandidates.length === 0)
            return;
        const now = Date.now();
        for (const candidate of watchCandidates) {
            if (!candidate.created_at)
                continue;
            const ageMinutes = (now - new Date(candidate.created_at).getTime()) / 60000;
            if (ageMinutes < 15 || ageMinutes > 45)
                continue;
            const provider = (0, providers_1.getProvider)();
            const quote = await provider.getQuote(candidate.ticker);
            if (!quote || quote.price <= 0)
                continue;
            const entryLow = candidate.entry_zone_low ?? candidate.entry_price ?? 0;
            const entryHigh = candidate.entry_zone_high ?? candidate.entry_price ?? 0;
            const price = quote.price;
            const watchConfirmed = price >= entryLow * 0.998 && price <= entryHigh * 1.005;
            if (watchConfirmed) {
                log.info('[WATCH_SIGNAL]', {
                    symbol: candidate.ticker,
                    status: candidate.status,
                    marketType: candidate.market_type,
                    ageMinutes: Number(ageMinutes.toFixed(1)),
                    price,
                    entryLow,
                    entryHigh,
                });
                if (config_1.config.scanner.testMode && config_1.config.crypto.watchSignalsInTestMode) {
                    await (0, bot_1.sendNewTradeIdea)(candidate);
                }
            }
        }
    }
    const scanStock = async (stock) => {
        scanSummary.symbolsScanned += 1;
        if (config_1.config.scanner.debugSignals) {
            log.debug('[SCAN] Symbol:', { ticker: stock.ticker, company_name: stock.company_name });
        }
        // a race condition where multiple concurrent stocks exceed the daily limit
        const currentCount = await (0, queries_1.countTodayTradeIdeas)();
        if (currentCount >= config_1.config.scanner.maxSignalsPerDay)
            return;
        const alreadyActive = await (0, queries_1.hasActiveIdeaForTicker)(stock.ticker);
        if (alreadyActive)
            return;
        // Collect all valid signals across timeframes
        const allSignals = [];
        for (const timeframe of TIMEFRAMES) {
            try {
                let candles = await provider.getCandles(stock.ticker, timeframe, CANDLE_LIMIT);
                if (candles.length < 30) {
                    log.info('[INSUFFICIENT_CANDLES] Retrying with larger limit', {
                        symbol: stock.ticker, timeframe, received: candles.length, requested: CANDLE_LIMIT,
                    });
                    candles = await provider.getCandles(stock.ticker, timeframe, 500);
                }
                if (candles.length < 30) {
                    log.warn('[INSUFFICIENT_CANDLES]', {
                        symbol: stock.ticker, timeframe, requested: 500, received: candles.length,
                    });
                    scanSummary.insufficientCandles += 1;
                    continue;
                }
                const lastCandle = candles[candles.length - 1];
                // Stale candle detection with timestamp unit normalization
                const rawTimestamp = lastCandle.time;
                const normalizedTimestamp = normalizeTimestamp(rawTimestamp);
                const candleAgeMs = Date.now() - normalizedTimestamp;
                const candleAgeMinutes = Number((candleAgeMs / 60000).toFixed(1));
                log.debug('[STALE_CHECK]', {
                    symbol: stock.ticker,
                    timeframe,
                    rawTimestamp,
                    normalizedTimestamp,
                    ageMinutes: candleAgeMinutes,
                });
                const marketOpen = (0, time_1.isUSMarketOpen)();
                if (!marketOpen) {
                    if (candleAgeMs > 10080 * 60 * 1000) {
                        scanSummary.staleRejected += 1;
                        log.warn('[STALE_DATA]', {
                            symbol: stock.ticker, timeframe, rawTimestamp, normalizedTimestamp,
                            candleAgeMinutes, maxAgeMinutes: 10080,
                        });
                        continue;
                    }
                    if (candleAgeMs > 45 * 60 * 1000) {
                        log.debug('[MARKET_CLOSED_SKIP_STALE]', { symbol: stock.ticker, timeframe, candleAgeMinutes });
                    }
                }
                else if (candleAgeMs > 45 * 60 * 1000) {
                    scanSummary.staleRejected += 1;
                    log.warn('[STALE_DATA]', {
                        symbol: stock.ticker, timeframe, rawTimestamp, normalizedTimestamp,
                        candleAgeMinutes, maxAgeMinutes: 45,
                    });
                    continue;
                }
                // Per-candle volume filter: require at least 40% of expected per-candle daily volume
                const candlesPerDay = CANDLES_PER_DAY[timeframe] ?? 26;
                const expectedCandleVolume = stock.min_volume / candlesPerDay;
                if (lastCandle.volume < expectedCandleVolume * 0.4) {
                    log.info('[NO_SIGNAL] Volume too low', {
                        symbol: stock.ticker,
                        timeframe,
                        volume: lastCandle.volume,
                        threshold: Math.round(expectedCandleVolume * 0.4),
                        expectedCandleVolume,
                    });
                    continue;
                }
                // Detect market regime
                const regime = regimeDetector.detectRegime(candles);
                // Get market analysis data for scoring
                const relativeVolume = lastCandle.volume / (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
                const marketAnalysis = {
                    trend: regime.trend,
                    regime: regime.regime,
                    sentiment: 'neutral', // TODO: integrate sentiment analysis
                    relativeVolume,
                    averageVolume: (0, indicators_1.averageVolume)(candles, 20),
                    relativeStrength: Math.min(100, Math.max(0, Math.round(relativeVolume * 20 + 50))),
                    fakeoutConfidence: 0,
                    spread: 0.5, // TODO: get from quote data
                    atr: (0, indicators_1.safeAtr)(candles, 14),
                    marketOpen: (0, time_1.isUSMarketOpen)(),
                };
                const closes = candles.map((c) => c.close);
                const rsiArr = (0, indicators_1.rsi)(closes, 14);
                const currentRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
                const ema21Arr = (0, indicators_1.ema)(closes, 21);
                const currentEma21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : lastCandle.close;
                const ema50Arr = (0, indicators_1.ema)(closes, 50);
                const currentEma50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : lastCandle.close;
                const currentVwap = lastCandle.close; // Placeholder until VWAP is implemented consistently
                const strategyStart = Date.now();
                const results = (0, engine_1.runStrategies)(candles, stock.ticker, timeframe);
                log.debug('[STRATEGY_TIMING]', {
                    symbol: stock.ticker,
                    timeframe,
                    durationMs: Date.now() - strategyStart,
                    strategyCount: results.length,
                });
                // Score each valid signal
                for (const result of results) {
                    if (!result.valid) {
                        if (config_1.config.scanner.debugSignals) {
                            log.debug(`Rejected setup before scoring: ${stock.ticker} ${result.strategy}`, {
                                ticker: stock.ticker,
                                strategy: result.strategy,
                                symbol: stock.ticker,
                                confidence: result.confidence || result.confidenceScore || 0,
                                rejectionReasons: ['Strategy conditions not met'],
                                timeframe,
                                marketRegime: regime.regime,
                                rr: 0,
                                volumeConfirmation: result.volumeConfirmation,
                                volumeAnalysis: {
                                    relativeVolume: marketAnalysis.relativeVolume,
                                    averageVolume: marketAnalysis.averageVolume,
                                },
                                fakeoutConfidence: marketAnalysis.fakeoutConfidence,
                                sentiment: marketAnalysis.sentiment,
                                relativeStrength: marketAnalysis.relativeStrength,
                            });
                        }
                        continue;
                    }
                    const scoredSignal = scoringEngine.scoreSignal(result, marketAnalysis);
                    const evaluationPayload = {
                        symbol: stock.ticker,
                        strategy: result.strategy,
                        confidence: scoredSignal.totalScore,
                        signalQuality: scoredSignal.quality,
                        rejectionReasons: scoredSignal.rejectionReasons,
                        marketRegime: regime.regime,
                        rr: scoredSignal.riskReward,
                        volumeConfirmation: scoredSignal.volumeConfirmation,
                        volumeAnalysis: {
                            relativeVolume: marketAnalysis.relativeVolume,
                            averageVolume: marketAnalysis.averageVolume,
                        },
                        fakeoutConfidence: marketAnalysis.fakeoutConfidence,
                        sentiment: marketAnalysis.sentiment,
                        relativeStrength: marketAnalysis.relativeStrength,
                        scoringBreakdown: scoredSignal.scoringBreakdown,
                    };
                    log.info('[SIGNAL_SCORE]', {
                        ...evaluationPayload,
                        indicators: {
                            rsi: currentRsi,
                            ema21: currentEma21,
                            ema50: currentEma50,
                            vwap: currentVwap,
                            atr: marketAnalysis.atr,
                            volume: lastCandle.volume,
                            relativeVolume: marketAnalysis.relativeVolume,
                        },
                    });
                    const minAcceptScore = config_1.config.scanner.testMode ? 55 : 60;
                    const allowedQuality = config_1.config.scanner.testMode
                        ? scoredSignal.quality !== scoring_1.SignalQuality.REJECT
                        : scoredSignal.quality !== scoring_1.SignalQuality.REJECT && scoredSignal.totalScore >= 60;
                    if (!allowedQuality || scoredSignal.totalScore < minAcceptScore) {
                        if (config_1.config.scanner.debugSignals) {
                            log.debug('[NO_SIGNAL] Scored signal filtered out', {
                                symbol: stock.ticker,
                                strategy: scoredSignal.strategy,
                                totalScore: scoredSignal.totalScore,
                                quality: scoredSignal.quality,
                                rejectionReasons: scoredSignal.rejectionReasons,
                            });
                        }
                        continue;
                    }
                    log.info('[SIGNAL_CANDIDATE]', {
                        symbol: stock.ticker,
                        strategy: scoredSignal.strategy,
                        totalScore: scoredSignal.totalScore,
                        quality: scoredSignal.quality,
                        rr: scoredSignal.riskReward,
                        confidence: scoredSignal.confidence,
                        reasons: scoredSignal.reasons,
                    });
                    let aiAnalysis = null;
                    if (config_1.config.ai.enabled) {
                        aiAnalysis = await aiLimit(() => (0, metrics_1.timeAsync)('ai.response.stock', () => (0, tradeAnalyst_1.analyzeSignalCandidate)({
                            symbol: stock.ticker,
                            strategy: scoredSignal.strategy,
                            side: scoredSignal.side,
                            timeframe: scoredSignal.timeframe,
                            entry: scoredSignal.entry,
                            stopLoss: scoredSignal.stopLoss,
                            takeProfit1: scoredSignal.takeProfit1,
                            takeProfit2: scoredSignal.takeProfit2,
                            riskReward: scoredSignal.riskReward,
                            confidence: scoredSignal.totalScore,
                            marketType: 'stocks',
                            marketRegime: regime.regime,
                            reasons: scoredSignal.reasons,
                            indicators: {
                                rsi: currentRsi,
                                ema21: currentEma21,
                                ema50: currentEma50,
                                vwap: currentVwap,
                                atr: marketAnalysis.atr,
                                volume: lastCandle.volume,
                                relativeVolume: marketAnalysis.relativeVolume,
                            },
                            candleContext: `Last candle: O:${lastCandle.open} H:${lastCandle.high} L:${lastCandle.low} C:${lastCandle.close} V:${lastCandle.volume}`,
                            fakeBreakoutAnalysis: {
                                confidence: marketAnalysis.fakeoutConfidence,
                                reasons: scoredSignal.rejectionReasons.filter((r) => r.toLowerCase().includes('fake')),
                            },
                            relativeStrength: marketAnalysis.relativeStrength,
                            newsSentiment: 'neutral',
                            recentCandles: candles.slice(-5),
                        })));
                    }
                    if (aiAnalysis) {
                        if (aiAnalysis.decision === 'REJECT') {
                            if (config_1.config.ai.approvalDisabled) {
                                log.info('[AI_BYPASS] AI rejection overridden by AI_APPROVAL_DISABLED', {
                                    symbol: stock.ticker, strategy: scoredSignal.strategy, aiConfidence: aiAnalysis.aiConfidence,
                                });
                            }
                            else {
                                log.info('[AI_REJECT]', {
                                    symbol: stock.ticker,
                                    strategy: scoredSignal.strategy,
                                    aiConfidence: aiAnalysis.aiConfidence,
                                    reason: aiAnalysis.summary,
                                    riskWarnings: aiAnalysis.riskWarnings,
                                });
                                // TODO: persist rejected signal to rejected_signals table
                                continue;
                            }
                        }
                        if (aiAnalysis.decision === 'WATCH') {
                            if (config_1.config.ai.approvalDisabled) {
                                log.info('[AI_BYPASS] AI watch override by AI_APPROVAL_DISABLED', {
                                    symbol: stock.ticker, strategy: scoredSignal.strategy,
                                });
                            }
                            else {
                                log.info('[AI_WATCH]', {
                                    symbol: stock.ticker,
                                    strategy: scoredSignal.strategy,
                                    aiConfidence: aiAnalysis.aiConfidence,
                                    suggestedAction: aiAnalysis.suggestedAction,
                                });
                                continue;
                            }
                        }
                        if (aiAnalysis.decision === 'APPROVE') {
                            log.info('[AI_APPROVE]', {
                                symbol: stock.ticker,
                                strategy: scoredSignal.strategy,
                                aiConfidence: aiAnalysis.aiConfidence,
                                riskLevel: aiAnalysis.riskLevel,
                                summary: aiAnalysis.summary,
                            });
                            if (aiAnalysis.adjustedStopLoss && aiAnalysis.adjustedStopLoss > 0) {
                                scoredSignal.stopLoss = aiAnalysis.adjustedStopLoss;
                            }
                            if (aiAnalysis.adjustedTakeProfit1 && aiAnalysis.adjustedTakeProfit1 > 0) {
                                scoredSignal.takeProfit1 = aiAnalysis.adjustedTakeProfit1;
                            }
                            if (aiAnalysis.adjustedTakeProfit2 && aiAnalysis.adjustedTakeProfit2 > 0) {
                                scoredSignal.takeProfit2 = aiAnalysis.adjustedTakeProfit2;
                            }
                        }
                    }
                    else if (config_1.config.ai.enabled) {
                        log.warn('[AI_ANALYST_SKIPPED] AI analysis did not return a result', {
                            symbol: stock.ticker,
                            strategy: scoredSignal.strategy,
                        });
                    }
                    allSignals.push({
                        ...scoredSignal,
                        marketRegime: regime,
                        marketAnalysis,
                        candles,
                        aiAnalysis,
                    });
                }
            }
            catch (err) {
                log.error(`Error scanning ${stock.ticker} on ${timeframe}`, {
                    err: err.message,
                });
            }
        }
        if (allSignals.length === 0) {
            log.info('[NO_SIGNAL] No valid signals found', { ticker: stock.ticker, timeframe: TIMEFRAMES });
            return;
        }
        // Select the highest-scoring signal
        const bestSignal = allSignals.reduce((best, current) => current.totalScore > best.totalScore ? current : best);
        const originalConfidence = bestSignal.totalScore;
        let adjustedConfidence = await (0, strategyPerformance_1.adjustStrategyConfidence)(bestSignal.strategy, bestSignal.marketRegime.regime, originalConfidence);
        adjustedConfidence = clampConfidence(adjustedConfidence);
        const confidenceAdjustment = adjustedConfidence - originalConfidence;
        if (adjustedConfidence !== originalConfidence) {
            log.info('[ADAPTIVE_WEIGHT]', {
                strategy: bestSignal.strategy,
                marketRegime: bestSignal.marketRegime.regime,
                originalConfidence,
                adjustedConfidence,
                confidenceAdjustment,
            });
        }
        bestSignal.totalScore = adjustedConfidence;
        bestSignal.confidence = adjustedConfidence;
        scanSummary.setupsFound += 1;
        const portfolioResult = await (0, signalPipeline_1.evaluatePortfolioRisk)(stock.ticker, 'stocks', stock.sector || 'Unknown', bestSignal.totalScore);
        if (portfolioResult.rejected) {
            scanSummary.portfolioRejected += 1;
            log.info('[PORTFOLIO_RISK_REJECT]', {
                symbol: stock.ticker,
                strategy: bestSignal.strategy,
                reason: portfolioResult.reason,
                portfolioRisk: portfolioResult.label,
            });
            return;
        }
        if (portfolioResult.adjustedConfidence !== bestSignal.totalScore) {
            const clampedConfidence = clampConfidence(portfolioResult.adjustedConfidence);
            bestSignal.totalScore = clampedConfidence;
            bestSignal.confidence = clampedConfidence;
            bestSignal.reasons.push(`Portfolio risk adjustment: ${portfolioResult.reason}`);
        }
        const sessionResult = (0, signalPipeline_1.evaluateMarketSession)('stocks', bestSignal.totalScore);
        bestSignal.totalScore = clampConfidence(sessionResult.adjustedConfidence);
        bestSignal.confidence = clampConfidence(sessionResult.adjustedConfidence);
        bestSignal.reasons.push(`Session: ${sessionResult.session.session}`);
        const riskGuardResult = await (0, signalPipeline_1.evaluateRiskGuardChecks)(bestSignal.totalScore);
        if (riskGuardResult.paused) {
            scanSummary.riskGuardRejected += 1;
            log.info('[RISK_GUARD_PAUSE]', {
                symbol: stock.ticker,
                strategy: bestSignal.strategy,
                riskGuard: riskGuardResult.riskGuard,
            });
            return;
        }
        if (riskGuardResult.adjustedConfidence !== bestSignal.totalScore) {
            const clampedConfidence = clampConfidence(riskGuardResult.adjustedConfidence);
            bestSignal.totalScore = clampedConfidence;
            bestSignal.confidence = clampedConfidence;
            bestSignal.reasons.push('Risk guard confidence reduction');
        }
        const stressResult = (0, signalPipeline_1.evaluateMarketStress)(bestSignal.marketRegime.regime, riskGuardResult.riskGuard.estimatedDrawdownPct / 100, bestSignal.marketAnalysis.atr || 1, bestSignal.totalScore);
        if (stressResult.stressLevel === 'HIGH' && bestSignal.totalScore < 70) {
            scanSummary.stressRejected += 1;
            log.info('[MARKET_STRESS_REJECT]', {
                symbol: stock.ticker,
                strategy: bestSignal.strategy,
                stressLevel: stressResult.stressLevel,
                reason: stressResult.reason,
            });
            return;
        }
        if (stressResult.adjustedConfidence !== bestSignal.totalScore) {
            const clampedConfidence = clampConfidence(stressResult.adjustedConfidence);
            bestSignal.totalScore = clampedConfidence;
            bestSignal.confidence = clampedConfidence;
            bestSignal.reasons.push(`Market stress adjustment (${stressResult.stressLevel})`);
        }
        const reinforcementResult = await (0, signalPipeline_1.evaluateReinforcement)(bestSignal.strategy, bestSignal.marketRegime.regime, 'stocks', bestSignal.totalScore);
        if (reinforcementResult.adjustedConfidence !== bestSignal.totalScore) {
            const clampedConfidence = clampConfidence(reinforcementResult.adjustedConfidence);
            bestSignal.totalScore = clampedConfidence;
            bestSignal.confidence = clampedConfidence;
            bestSignal.reasons.push(`Reinforcement score ${reinforcementResult.score}`);
            if (reinforcementResult.score < 50) {
                scanSummary.reinforcementReduced += 1;
            }
        }
        const executionResult = (0, signalPipeline_1.evaluateExecutionQuality)(bestSignal, bestSignal.marketAnalysis?.spread || config_1.config.executionQuality.baseSpreadPct * 100, bestSignal.marketAnalysis?.atr || 1, bestSignal.totalScore);
        if (executionResult.rejected) {
            scanSummary.stressRejected += 1;
            log.info('[EXECUTION_QUALITY_REJECT]', {
                symbol: stock.ticker,
                strategy: bestSignal.strategy,
                reason: executionResult.reason,
            });
            return;
        }
        bestSignal.totalScore = clampConfidence(executionResult.adjustedConfidence);
        bestSignal.confidence = clampConfidence(executionResult.adjustedConfidence);
        bestSignal.entry = executionResult.executionQuality.entryPrice;
        bestSignal.stopLoss = executionResult.executionQuality.stopLoss;
        bestSignal.takeProfit1 = executionResult.executionQuality.takeProfit1;
        bestSignal.takeProfit2 = executionResult.executionQuality.takeProfit2;
        bestSignal.reasons.push(`Execution quality slippage ${executionResult.executionQuality.slippagePct}%`);
        const minAcceptScore = config_1.config.scanner.testMode ? 55 : 60;
        if (bestSignal.quality === scoring_1.SignalQuality.REJECT || bestSignal.totalScore < minAcceptScore) {
            log.info('[NO_SIGNAL] Best setup rejected after pipeline adjustments', {
                ticker: stock.ticker,
                bestSignal: {
                    strategy: bestSignal.strategy,
                    totalScore: bestSignal.totalScore,
                    quality: bestSignal.quality,
                    rejectionReasons: bestSignal.rejectionReasons,
                    rr: bestSignal.riskReward,
                },
            });
            return;
        }
        let aiAnalysis = null;
        if (config_1.config.ai.enabled) {
            const candles = bestSignal.candles;
            const lastCandle = candles[candles.length - 1];
            const closes = candles.map((c) => c.close);
            const rsiArr = (0, indicators_1.rsi)(closes, 14);
            const currentRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
            const ema21Arr = (0, indicators_1.ema)(closes, 21);
            const currentEma21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : lastCandle.close;
            const ema50Arr = (0, indicators_1.ema)(closes, 50);
            const currentEma50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : lastCandle.close;
            const currentVwap = lastCandle.close;
            const atrVal = (0, indicators_1.safeAtr)(candles, 14);
            const performanceSummary = await (0, strategyPerformance_1.getStrategyRegimePerformanceSummary)(bestSignal.strategy, bestSignal.marketRegime.regime);
            const suggestedPositionSizing = await (0, signalPipeline_1.suggestSizeFromContext)(bestSignal, 'stocks', bestSignal.marketRegime.regime, bestSignal.totalScore, bestSignal.marketAnalysis.fakeoutConfidence || 0, bestSignal.marketAnalysis.atr || 1, riskGuardResult.riskGuard.estimatedDrawdownPct, portfolioResult.snapshot.normalizedExposure);
            const aiCandidate = {
                symbol: stock.ticker,
                strategy: bestSignal.strategy,
                side: bestSignal.side,
                timeframe: bestSignal.timeframe,
                marketType: 'stocks',
                entry: bestSignal.entry,
                stopLoss: bestSignal.stopLoss,
                takeProfit1: bestSignal.takeProfit1,
                takeProfit2: bestSignal.takeProfit2,
                riskReward: bestSignal.riskReward,
                confidence: bestSignal.totalScore,
                marketRegime: bestSignal.marketRegime.regime,
                reasons: bestSignal.reasons,
                performanceSummary,
                indicators: {
                    rsi: currentRsi,
                    ema21: currentEma21,
                    ema50: currentEma50,
                    vwap: currentVwap,
                    atr: atrVal,
                    volume: lastCandle.volume,
                    relativeVolume: bestSignal.marketAnalysis.relativeVolume,
                },
                candleContext: `Last candle: O:${lastCandle.open} H:${lastCandle.high} L:${lastCandle.low} C:${lastCandle.close} V:${lastCandle.volume}`,
                fakeBreakoutAnalysis: {
                    confidence: bestSignal.marketAnalysis.fakeoutConfidence,
                    reasons: bestSignal.rejectionReasons.filter((r) => r.includes('fake')),
                },
                relativeStrength: bestSignal.marketAnalysis.relativeStrength,
                newsSentiment: 'neutral',
                recentCandles: candles.slice(-5),
                portfolioRisk: {
                    level: portfolioResult.label,
                    normalizedExposure: portfolioResult.snapshot.normalizedExposure,
                    cryptoAllocation: portfolioResult.snapshot.cryptoAllocation,
                    clusterCount: portfolioResult.snapshot.correlationClusters.length,
                    reason: portfolioResult.reason || 'Normal portfolio risk',
                },
                riskGuard: riskGuardResult.riskGuard,
                sessionContext: sessionResult.session,
                marketStress: stressResult.stressLevel,
                reinforcementScore: reinforcementResult.score,
                similarTradeOutcomes: reinforcementResult.priorOutcomes,
                executionQuality: executionResult.executionQuality,
                suggestedPositionSizing: suggestedPositionSizing,
            };
            aiAnalysis = await aiLimit(() => (0, metrics_1.timeAsync)('ai.response.stock', () => (0, tradeAnalyst_1.analyzeSignalCandidate)(aiCandidate)));
            if (aiAnalysis) {
                if (aiAnalysis.decision === 'REJECT') {
                    scanSummary.aiRejected += 1;
                    if (config_1.config.ai.approvalDisabled) {
                        log.info('[AI_BYPASS] AI rejection overridden by AI_APPROVAL_DISABLED', {
                            ticker: stock.ticker, strategy: bestSignal.strategy, aiConfidence: aiAnalysis.aiConfidence,
                        });
                    }
                    else {
                        if (config_1.config.scanner.debugSignals) {
                            log.debug('[AI_REJECT] Signal rejected by AI analyst', {
                                ticker: stock.ticker,
                                strategy: bestSignal.strategy,
                                aiConfidence: aiAnalysis.aiConfidence,
                                summary: aiAnalysis.summary,
                                riskWarnings: aiAnalysis.riskWarnings,
                            });
                        }
                        return;
                    }
                }
                if (aiAnalysis.decision === 'WATCH') {
                    scanSummary.watchSignals += 1;
                    log.info('[WATCH_SIGNAL]', {
                        ticker: stock.ticker,
                        strategy: bestSignal.strategy,
                        aiConfidence: aiAnalysis.aiConfidence,
                        suggestedAction: aiAnalysis.suggestedAction,
                        marketRegime: bestSignal.marketRegime.regime,
                    });
                    const watchIdeaData = (0, builder_1.buildTradeIdea)(stock.ticker, stock.company_name, bestSignal, provider.name, aiAnalysis, 'watch');
                    const watchIdea = await (0, queries_1.insertTradeIdea)(watchIdeaData);
                    if (watchIdea) {
                        log.info('[WATCH_IDEA_CREATED]', {
                            ticker: stock.ticker,
                            strategy: bestSignal.strategy,
                            quality: bestSignal.quality,
                            totalScore: bestSignal.totalScore,
                        });
                        if (config_1.config.scanner.testMode && config_1.config.crypto.watchSignalsInTestMode) {
                            const watchMessage = {
                                ...watchIdea,
                                strategy_win_rate: null,
                                fakeout_probability: bestSignal.marketAnalysis?.fakeoutConfidence ?? null,
                                adaptive_confidence_adjustment: confidenceAdjustment,
                            };
                            await (0, bot_1.sendNewTradeIdea)(watchMessage);
                        }
                    }
                    return;
                }
                if (aiAnalysis.adjustedStopLoss && aiAnalysis.adjustedStopLoss > 0) {
                    bestSignal.stopLoss = aiAnalysis.adjustedStopLoss;
                }
                if (aiAnalysis.adjustedTakeProfit1 && aiAnalysis.adjustedTakeProfit1 > 0) {
                    bestSignal.takeProfit1 = aiAnalysis.adjustedTakeProfit1;
                }
                if (aiAnalysis.adjustedTakeProfit2 && aiAnalysis.adjustedTakeProfit2 > 0) {
                    bestSignal.takeProfit2 = aiAnalysis.adjustedTakeProfit2;
                }
                if (config_1.config.scanner.debugSignals) {
                    log.debug('[AI_APPROVE] Signal approved by AI analyst', {
                        ticker: stock.ticker,
                        strategy: bestSignal.strategy,
                        aiConfidence: aiAnalysis.aiConfidence,
                        riskLevel: aiAnalysis.riskLevel,
                        summary: aiAnalysis.summary,
                    });
                }
            }
        }
        const finalCount = await (0, queries_1.countTodayTradeIdeas)();
        if (finalCount >= config_1.config.scanner.maxSignalsPerDay)
            return;
        log.info(`Signal: ${stock.ticker} on ${bestSignal.timeframe} via ${bestSignal.strategy} (${bestSignal.totalScore}pts ${bestSignal.quality})`);
        const performanceSummary = await (0, strategyPerformance_1.getStrategyRegimePerformanceSummary)(bestSignal.strategy, bestSignal.marketRegime.regime);
        const suggestedPositionSizing = await (0, signalPipeline_1.suggestSizeFromContext)(bestSignal, 'stocks', bestSignal.marketRegime.regime, bestSignal.totalScore, bestSignal.marketAnalysis.fakeoutConfidence || 0, bestSignal.marketAnalysis.atr || 1, riskGuardResult.riskGuard.estimatedDrawdownPct, portfolioResult.snapshot.normalizedExposure);
        const ideaData = (0, builder_1.buildTradeIdea)(stock.ticker, stock.company_name, bestSignal, provider.name, aiAnalysis);
        const idea = await (0, queries_1.insertTradeIdea)(ideaData);
        if (!idea)
            return;
        const ideaWithMeta = {
            ...idea,
            strategy_win_rate: performanceSummary?.winRate ?? null,
            fakeout_probability: bestSignal.marketAnalysis?.fakeoutConfidence ?? null,
            adaptive_confidence_adjustment: confidenceAdjustment,
            portfolioRiskLabel: portfolioResult.label,
            riskGuardState: riskGuardResult.riskGuard.riskLevel,
            sessionContext: sessionResult.session,
            marketStressLevel: stressResult.stressLevel,
            reinforcementScore: reinforcementResult.score,
            executionQuality: executionResult.executionQuality,
            suggestedPositionSizing,
        };
        const messageId = await (0, bot_1.sendNewTradeIdea)(ideaWithMeta);
        if (messageId) {
            await (0, queries_1.updateTradeIdeaTelegramId)(idea.id, messageId);
            scanSummary.telegramSent += 1;
        }
        scanSummary.aiApproved += 1;
        log.info(`Trade idea sent: ${stock.ticker} — ${bestSignal.strategy}`);
    };
    await Promise.allSettled(filteredStocks.map((stock) => limit(() => scanStock(stock))));
    log.info('[SCAN_SUMMARY]', {
        symbolsScanned: scanSummary.symbolsScanned,
        setupsDetected: scanSummary.setupsFound,
        tradeIdeasCreated: scanSummary.aiApproved,
        watchSignals: scanSummary.watchSignals,
        AIRejected: scanSummary.aiRejected,
        volumeRejected: 0,
        strategyRejected: 0,
        staleRejected: scanSummary.staleRejected,
        insufficientCandles: scanSummary.insufficientCandles,
        timeouts: scanSummary.timeouts,
        portfolioRejected: scanSummary.portfolioRejected,
        riskGuardRejected: scanSummary.riskGuardRejected,
        stressRejected: scanSummary.stressRejected,
        reinforcementReduced: scanSummary.reinforcementReduced,
        telegramSent: scanSummary.telegramSent,
    });
    log.info('Scan complete.');
}
