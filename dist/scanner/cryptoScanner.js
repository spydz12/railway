"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCryptoScan = runCryptoScan;
const queries_1 = require("../database/queries");
const providers_1 = require("../providers");
const builder_1 = require("../ideas/builder");
const bot_1 = require("../telegram/bot");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const scoring_1 = require("../scoring");
const regime_1 = require("../market/regime");
const indicators_1 = require("../utils/indicators");
const tradeAnalyst_1 = require("../ai/tradeAnalyst");
const strategyPerformance_1 = require("../performance/strategyPerformance");
const signalPipeline_1 = require("../engine/signalPipeline");
const p_limit_1 = __importDefault(require("p-limit"));
const metrics_1 = require("../observability/metrics");
const crypto_1 = require("../strategies/crypto");
const categories_1 = require("../strategies/crypto/categories");
const engine_1 = require("../engine");
const log = (0, logger_1.createComponentLogger)('crypto-scanner');
const TIMEFRAMES = config_1.config.crypto.timeframes;
const CANDLE_LIMIT = 250;
function normalizeTimestamp(ts) {
    // Providers may return seconds (10-digit) or milliseconds (13-digit)
    return ts < 1000000000000 ? ts * 1000 : ts;
}
const scoringEngine = new scoring_1.ScoringEngine();
const regimeDetector = new regime_1.MarketRegimeDetector();
const CONFIRMATION_TIMEFRAME = '1h';
function clampConfidence(value) {
    return Math.min(Math.max(value, 0), 100);
}
const aiLimit = (0, p_limit_1.default)(2);
function timeframeToMs(timeframe) {
    const match = timeframe.trim().toLowerCase().match(/^(\d+)([mhd])$/);
    if (!match)
        return 0;
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    if (unit === 'm')
        return value * 60000;
    if (unit === 'h')
        return value * 3600000;
    if (unit === 'd')
        return value * 86400000;
    return 0;
}
async function runCryptoScan() {
    if (!config_1.config.crypto.enabled) {
        log.info('[CRYPTO_SCAN] Crypto scanning disabled');
        return;
    }
    const provider = (0, providers_1.getCryptoProvider)();
    async function processWatchCandidates() {
        const watchCandidates = await (0, queries_1.getWatchCandidatesByMarketType)('crypto');
        if (watchCandidates.length === 0)
            return;
        const now = Date.now();
        for (const candidate of watchCandidates) {
            if (!candidate.created_at)
                continue;
            const ageMinutes = (now - new Date(candidate.created_at).getTime()) / 60000;
            if (ageMinutes < 15 || ageMinutes > 45)
                continue;
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
    const symbols = config_1.config.crypto.defaultWatchlist;
    const prioritySymbols = config_1.config.crypto.prioritySymbols.map((symbol) => symbol.toUpperCase());
    const orderedSymbols = [
        ...prioritySymbols.filter((symbol) => symbols.includes(symbol)),
        ...symbols.filter((symbol) => !prioritySymbols.includes(symbol)),
    ];
    const summary = {
        symbolsScanned: 0,
        setupsDetected: 0,
        watchSignals: 0,
        staleRejected: 0,
        insufficientCandles: 0,
        portfolioRejected: 0,
        riskGuardRejected: 0,
        stressRejected: 0,
        executionQualityRejected: 0,
        reinforcementReduced: 0,
        aiApproved: 0,
        aiRejected: 0,
        aiWatch: 0,
        volumeRejected: 0,
        strategyRejected: 0,
        tradeIdeasCreated: 0,
    };
    if (symbols.length === 0) {
        log.warn('[CRYPTO_SCAN] No crypto symbols configured');
        return;
    }
    await processWatchCandidates();
    const totalCount = await (0, queries_1.countTodayTradeIdeasByMarketType)('crypto');
    if (totalCount >= config_1.config.crypto.maxSignalsPerDay) {
        log.info(`[CRYPTO_SCAN] Max crypto signals reached (${totalCount}/${config_1.config.crypto.maxSignalsPerDay})`);
        return;
    }
    log.info(`[CRYPTO_SCAN] Starting crypto scan for ${orderedSymbols.length} symbols across ${TIMEFRAMES.join(', ')}`);
    log.info('[CRYPTO_SCAN] volume threshold context', {
        configuredThreshold: config_1.config.crypto.volumeThreshold,
        testMode: config_1.config.scanner.testMode,
        testModeThreshold: config_1.config.crypto.volumeThreshold * 0.5,
    });
    const limit = (0, p_limit_1.default)(Math.max(1, config_1.config.crypto.concurrentSymbols));
    let btcTrendBias = { trend: 'neutral', adjustment: 0, reason: 'No BTC bias' };
    try {
        const btcCandles = await provider.getCandles('BTCUSDT', '1h', CANDLE_LIMIT);
        btcTrendBias = (0, crypto_1.calculateBtcTrendBias)(btcCandles);
        log.info('[CRYPTO_SCAN] BTC market bias', btcTrendBias);
        if (btcCandles.length >= 55)
            (0, crypto_1.setBtcContextCandles)('1h', btcCandles);
    }
    catch (err) {
        log.warn('[CRYPTO_SCAN] BTC bias unavailable', { err: err.message });
    }
    // Pre-fetch BTC candles for remaining timeframes so crypto_btc_market_leader can fire on altcoins
    for (const tf of TIMEFRAMES) {
        if (tf === '1h')
            continue;
        try {
            const btcTfCandles = await provider.getCandles('BTCUSDT', tf, CANDLE_LIMIT);
            if (btcTfCandles.length >= 55)
                (0, crypto_1.setBtcContextCandles)(tf, btcTfCandles);
        }
        catch (err) {
            log.warn('[CRYPTO_SCAN] BTC context candles unavailable', { timeframe: tf, err: err.message });
        }
    }
    const scanSymbol = async (symbol) => {
        try {
            summary.symbolsScanned += 1;
            const todayCount = await (0, queries_1.countTodayTradeIdeasByMarketType)('crypto');
            if (todayCount >= config_1.config.crypto.maxSignalsPerDay) {
                return;
            }
            if (await (0, queries_1.hasActiveIdeaForTicker)(symbol)) {
                log.info('[CRYPTO_SCAN] active idea exists, skipping symbol', { symbol });
                return;
            }
            const symbolSignals = [];
            const symbolWatchSignals = [];
            const pendingCandidates = [];
            let confidenceAdjustment = 0;
            const isPrioritySymbol = prioritySymbols.includes(symbol);
            const rawVolumeThreshold = config_1.config.crypto.volumeThreshold;
            const effectiveVolumeThreshold = config_1.config.scanner.testMode
                ? rawVolumeThreshold * 0.5
                : isPrioritySymbol
                    ? rawVolumeThreshold * 0.9
                    : rawVolumeThreshold;
            log.debug('[CRYPTO_SCAN] effective volume threshold', {
                symbol,
                rawVolumeThreshold,
                effectiveVolumeThreshold,
                testMode: config_1.config.scanner.testMode,
                prioritySymbol: isPrioritySymbol,
            });
            const shouldConfirmMultiTimeframe = config_1.config.crypto.multiTimeframeConfirmation;
            let confirmationTrend = 'neutral';
            if (shouldConfirmMultiTimeframe) {
                try {
                    const confirmCandles = await provider.getCandles(symbol, CONFIRMATION_TIMEFRAME, CANDLE_LIMIT);
                    if (confirmCandles.length >= 30) {
                        const confirmRegime = regimeDetector.detectRegime(confirmCandles);
                        confirmationTrend = confirmRegime.trend;
                    }
                }
                catch (err) {
                    log.warn('[CRYPTO_SCAN] multi-timeframe confirmation unavailable', { symbol, err: err.message });
                }
            }
            for (const timeframe of TIMEFRAMES) {
                try {
                    let candles = await provider.getCandles(symbol, timeframe, CANDLE_LIMIT);
                    if (candles.length < 30) {
                        log.info('[INSUFFICIENT_CANDLES] Retrying with larger limit', {
                            symbol, timeframe, received: candles.length, requested: CANDLE_LIMIT,
                        });
                        candles = await provider.getCandles(symbol, timeframe, 500);
                    }
                    if (candles.length < 30) {
                        log.warn('[INSUFFICIENT_CANDLES]', {
                            symbol, timeframe, requested: 500, received: candles.length,
                        });
                        summary.insufficientCandles += 1;
                        continue;
                    }
                    const last = candles[candles.length - 1];
                    const rawTimestamp = last.time;
                    const normalizedTimestamp = normalizeTimestamp(rawTimestamp);
                    const candleAge = Date.now() - normalizedTimestamp;
                    const timeframeMs = timeframeToMs(timeframe);
                    const maxAge = timeframeMs * 2;
                    log.debug('[STALE_CHECK]', {
                        symbol,
                        timeframe,
                        rawTimestamp,
                        normalizedTimestamp,
                        ageMinutes: Number((candleAge / 60000).toFixed(1)),
                    });
                    if (maxAge > 0 && candleAge > maxAge) {
                        summary.staleRejected += 1;
                        log.warn('[CRYPTO_SCAN] Stale data rejected', {
                            symbol,
                            timeframe,
                            rawTimestamp,
                            normalizedTimestamp,
                            candleAgeMinutes: Number((candleAge / 60000).toFixed(1)),
                            maxAgeMinutes: Number((maxAge / 60000).toFixed(1)),
                            valid: false,
                            rejectionReason: 'stale_data',
                        });
                        continue;
                    }
                    const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
                    const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
                    const passedVolume = relativeVolume >= effectiveVolumeThreshold;
                    log.info('[CRYPTO_VOLUME]', {
                        symbol,
                        timeframe,
                        currentVolume: last.volume,
                        averageVolume: avgVol,
                        relativeVolume: relativeVolume.toFixed(2),
                        threshold: effectiveVolumeThreshold,
                        passed: passedVolume,
                        prioritySymbol: isPrioritySymbol,
                    });
                    if (avgVol <= 0 || !passedVolume) {
                        summary.volumeRejected += 1;
                        log.info('[CRYPTO_SCAN] volume filter fail', {
                            symbol,
                            timeframe,
                            volume: last.volume,
                            avgVol,
                            relativeVolume,
                            threshold: effectiveVolumeThreshold,
                        });
                        continue;
                    }
                    const regime = regimeDetector.detectRegime(candles);
                    const marketAnalysis = {
                        trend: regime.trend,
                        regime: regime.regime,
                        sentiment: 'neutral',
                        relativeVolume: last.volume / avgVol,
                        averageVolume: avgVol * last.close,
                        relativeStrength: Math.min(100, Math.max(0, Math.round((last.volume / avgVol) * 20 + 50))),
                        fakeoutConfidence: 0,
                        spread: 0.25,
                        atr: (0, indicators_1.safeAtr)(candles, 14),
                        marketOpen: true,
                        effectiveVolumeThreshold,
                    };
                    const closes = candles.map((c) => c.close);
                    const rsiArr = (0, indicators_1.rsi)(closes, 14);
                    const currentRsi = rsiArr.length ? rsiArr[rsiArr.length - 1] : 50;
                    const ema21Arr = (0, indicators_1.ema)(closes, 21);
                    const currentEma21 = ema21Arr.length ? ema21Arr[ema21Arr.length - 1] : last.close;
                    const ema50Arr = (0, indicators_1.ema)(closes, 50);
                    const currentEma50 = ema50Arr.length ? ema50Arr[ema50Arr.length - 1] : last.close;
                    const strategyStart = Date.now();
                    const results = (0, engine_1.runStrategies)(candles, symbol, timeframe, (0, crypto_1.getEnabledCryptoStrategies)(), config_1.config.crypto.allowShortSelling);
                    log.debug('[STRATEGY_TIMING]', {
                        symbol,
                        timeframe,
                        durationMs: Date.now() - strategyStart,
                        strategyCount: results.length,
                    });
                    for (const result of results) {
                        const effectiveMinRR = result.strategy === 'crypto_market_regime_grid'
                            ? 1.3
                            : categories_1.MEAN_REVERSION_STRATEGIES.includes(result.strategy)
                                ? 1.5
                                : config_1.config.crypto.minRiskReward;
                        log.info('[CRYPTO_RR_CHECK]', {
                            strategy: result.strategy,
                            rr: result.riskReward,
                            effectiveMinRR,
                            globalMinRR: config_1.config.crypto.minRiskReward,
                        });
                        if (result.riskReward < effectiveMinRR) {
                            summary.strategyRejected += 1;
                            log.info('[CRYPTO_REJECT] risk/reward too low', {
                                symbol,
                                timeframe,
                                strategy: result.strategy,
                                rr: result.riskReward,
                                minRR: effectiveMinRR,
                            });
                            continue;
                        }
                        if (currentRsi > 80) {
                            result.confidence = Math.max(0, result.confidence - 10);
                            result.reasons = [...result.reasons, 'RSI extremely extended'];
                        }
                        else if (currentRsi >= 70) {
                            result.confidence = Math.max(0, result.confidence - 5);
                            result.reasons = [...result.reasons, 'RSI elevated, momentum present'];
                        }
                        else if (currentRsi < 30) {
                            result.confidence = Math.min(100, result.confidence + 5);
                            result.reasons = [...result.reasons, 'RSI oversold reversal zone'];
                        }
                        result.confidence = clampConfidence(result.confidence);
                        if (symbol !== 'BTCUSDT' && result.side === 'LONG' && config_1.config.crypto.btcBiasEnabled) {
                            if (btcTrendBias.trend === 'bearish') {
                                result.confidence = Math.max(0, result.confidence - 10);
                                result.reasons = [...result.reasons, 'BTC bearish market bias'];
                                marketAnalysis.fakeoutConfidence += 15;
                            }
                            else if (btcTrendBias.trend === 'bullish') {
                                result.confidence = Math.min(100, result.confidence + 5);
                                result.reasons = [...result.reasons, 'BTC bullish market bias'];
                            }
                            else if (btcTrendBias.trend === 'ranging' && categories_1.TREND_STRATEGIES.includes(result.strategy)) {
                                result.confidence = Math.max(0, result.confidence - 7);
                                result.reasons = [...result.reasons, 'BTC ranging bias, favor mean reversion'];
                            }
                        }
                        result.confidence = clampConfidence(result.confidence);
                        if (shouldConfirmMultiTimeframe && timeframe !== CONFIRMATION_TIMEFRAME && confirmationTrend !== 'neutral') {
                            const mismatch = (result.side === 'LONG' && confirmationTrend === 'bearish') ||
                                (result.side === 'SHORT' && confirmationTrend === 'bullish');
                            if (mismatch) {
                                result.confidence = Math.max(0, result.confidence - 10);
                                result.reasons = [...result.reasons, 'Multi-timeframe trend mismatch'];
                            }
                            else if (result.side === 'LONG' && confirmationTrend === 'bullish') {
                                result.confidence = Math.min(100, result.confidence + 5);
                                result.reasons = [...result.reasons, 'Multi-timeframe trend confirmation'];
                            }
                            else if (result.side === 'SHORT' && confirmationTrend === 'bearish') {
                                result.confidence = Math.min(100, result.confidence + 5);
                                result.reasons = [...result.reasons, 'Multi-timeframe trend confirmation'];
                            }
                        }
                        result.confidence = clampConfidence(result.confidence);
                        const scoredSignal = scoringEngine.scoreSignal(result, marketAnalysis);
                        const evaluationPayload = {
                            symbol,
                            strategy: scoredSignal.strategy,
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
                        log.info('[CRYPTO_SIGNAL]', {
                            ...evaluationPayload,
                            indicators: {
                                rsi: currentRsi,
                                ema21: currentEma21,
                                ema50: currentEma50,
                                atr: marketAnalysis.atr,
                                volume: last.volume,
                                relativeVolume: marketAnalysis.relativeVolume,
                            },
                        });
                        const minAcceptScore = 45;
                        log.debug('[CRYPTO_VALIDATION] threshold in use', {
                            symbol,
                            timeframe,
                            strategy: scoredSignal.strategy,
                            effectiveVolumeThreshold,
                            relativeVolume,
                            passedVolume,
                            testMode: config_1.config.scanner.testMode,
                        });
                        if (scoredSignal.quality === scoring_1.SignalQuality.REJECT || scoredSignal.totalScore < minAcceptScore) {
                            summary.strategyRejected += 1;
                            log.info('[CRYPTO_REJECT]', {
                                symbol,
                                strategy: scoredSignal.strategy,
                                totalScore: scoredSignal.totalScore,
                                quality: scoredSignal.quality,
                                rejectionReasons: scoredSignal.rejectionReasons,
                            });
                            continue;
                        }
                        if (scoredSignal.quality === scoring_1.SignalQuality.MEDIUM || scoredSignal.quality === scoring_1.SignalQuality.WATCH) {
                            symbolWatchSignals.push({
                                ...scoredSignal,
                                marketAnalysis,
                                candles,
                                marketType: 'crypto',
                                exchange: 'binance',
                                executionMode: 'watch',
                                cryptoMetadata: {
                                    btcBias: btcTrendBias,
                                    marketRegime: regime,
                                    executionMode: 'watch',
                                },
                            });
                            log.info('[CRYPTO_WATCH_CANDIDATE]', {
                                symbol,
                                strategy: scoredSignal.strategy,
                                quality: scoredSignal.quality,
                                totalScore: scoredSignal.totalScore,
                                marketRegime: regime.regime,
                            });
                            continue;
                        }
                        const performanceSummary = await (0, strategyPerformance_1.getStrategyRegimePerformanceSummary)(scoredSignal.strategy, regime.regime);
                        const aiCandidate = {
                            symbol,
                            strategy: scoredSignal.strategy,
                            side: scoredSignal.side,
                            timeframe: scoredSignal.timeframe,
                            marketType: 'crypto',
                            exchange: 'binance',
                            cryptoContext: {
                                btcTrendBias,
                                isPrioritySymbol,
                                confirmationTrend,
                                confirmationEnabled: shouldConfirmMultiTimeframe,
                            },
                            entry: scoredSignal.entry,
                            stopLoss: scoredSignal.stopLoss,
                            takeProfit1: scoredSignal.takeProfit1,
                            takeProfit2: scoredSignal.takeProfit2,
                            riskReward: scoredSignal.riskReward,
                            confidence: scoredSignal.totalScore,
                            marketRegime: regime.regime,
                            reasons: scoredSignal.reasons,
                            performanceSummary,
                            indicators: {
                                rsi: currentRsi,
                                ema21: currentEma21,
                                ema50: currentEma50,
                                vwap: last.close,
                                atr: marketAnalysis.atr,
                                volume: last.volume,
                                relativeVolume: marketAnalysis.relativeVolume,
                            },
                            candleContext: `Last candle: O:${last.open} H:${last.high} L:${last.low} C:${last.close} V:${last.volume}`,
                            fakeBreakoutAnalysis: {
                                confidence: marketAnalysis.fakeoutConfidence,
                                reasons: scoredSignal.rejectionReasons.filter((r) => r.toLowerCase().includes('fake')),
                            },
                            relativeStrength: marketAnalysis.relativeStrength,
                            newsSentiment: 'neutral',
                            recentCandles: candles.slice(-5),
                        };
                        pendingCandidates.push({ aiCandidate, scoredSignal, marketAnalysis, regime, candles, performanceSummary });
                    }
                }
                catch (err) {
                    log.error('[CRYPTO_SCAN] Error scanning timeframe', {
                        symbol,
                        timeframe,
                        err: err.message,
                    });
                }
            }
            // FIX 4: Conflict detection — penalise a candidate when ≥2 signals point the opposite way
            for (const c of pendingCandidates) {
                const oppositeCount = pendingCandidates.filter((o) => o.aiCandidate.side !== c.aiCandidate.side).length;
                if (oppositeCount >= 2) {
                    c.aiCandidate.confidence = clampConfidence(c.aiCandidate.confidence - 15);
                    c.scoredSignal.totalScore = clampConfidence(c.scoredSignal.totalScore - 15);
                    c.scoredSignal.confidence = c.scoredSignal.totalScore;
                    c.aiCandidate.reasons = [...c.aiCandidate.reasons, 'Conflicting directional strategies detected'];
                    log.info('[CONFLICT_PENALTY]', {
                        symbol,
                        strategy: c.aiCandidate.strategy,
                        side: c.aiCandidate.side,
                        oppositeCount,
                    });
                }
            }
            // Dedupe: send only the best candidate per symbol to AI (highest confidence, tiebreak on RR)
            const aiCandidates = pendingCandidates.length <= 1
                ? pendingCandidates
                : [pendingCandidates.reduce((best, c) => {
                        if (c.aiCandidate.confidence > best.aiCandidate.confidence)
                            return c;
                        if (c.aiCandidate.confidence === best.aiCandidate.confidence &&
                            c.aiCandidate.riskReward > best.aiCandidate.riskReward)
                            return c;
                        return best;
                    })];
            if (pendingCandidates.length > 1) {
                log.info('[CRYPTO_DEDUPE]', {
                    symbol,
                    totalCandidates: pendingCandidates.length,
                    selected: aiCandidates[0]?.aiCandidate.strategy,
                    dropped: pendingCandidates.filter((c) => c !== aiCandidates[0]).map((c) => c.aiCandidate.strategy),
                });
            }
            // FIX 5: Process AI candidates via rate-limited queue (concurrency: 2)
            for (const { aiCandidate, scoredSignal, marketAnalysis, regime, candles, performanceSummary } of aiCandidates) {
                summary.setupsDetected += 1;
                log.info('[CRYPTO_AI] Sending candidate to AI analyst', {
                    symbol,
                    strategy: scoredSignal.strategy,
                    marketType: aiCandidate.marketType,
                    exchange: aiCandidate.exchange,
                    isPrioritySymbol,
                    confirmationTrend,
                });
                const aiAnalysis = await aiLimit(() => (0, metrics_1.timeAsync)('ai.response.crypto', () => (0, tradeAnalyst_1.analyzeSignalCandidate)(aiCandidate)));
                if (!aiAnalysis) {
                    log.warn('[CRYPTO_AI] No AI response for candidate', { symbol, strategy: scoredSignal.strategy });
                    continue;
                }
                if (aiAnalysis.decision === 'REJECT') {
                    if (config_1.config.ai.approvalDisabled) {
                        log.info('[AI_BYPASS] AI rejection overridden by AI_APPROVAL_DISABLED', {
                            symbol, strategy: scoredSignal.strategy, aiConfidence: aiAnalysis.aiConfidence,
                        });
                    }
                    else {
                        summary.aiRejected += 1;
                        log.info('[CRYPTO_REJECT]', {
                            symbol,
                            strategy: scoredSignal.strategy,
                            aiConfidence: aiAnalysis.aiConfidence,
                            summary: aiAnalysis.summary,
                            riskWarnings: aiAnalysis.riskWarnings,
                        });
                        continue;
                    }
                }
                if (aiAnalysis.decision === 'WATCH') {
                    summary.aiWatch += 1;
                    summary.watchSignals += 1;
                    log.info('[WATCH_SIGNAL]', {
                        symbol,
                        strategy: scoredSignal.strategy,
                        aiConfidence: aiAnalysis.aiConfidence,
                        suggestedAction: aiAnalysis.suggestedAction,
                        marketRegime: regime.regime,
                    });
                    scoredSignal.executionMode = 'watch';
                    scoredSignal.cryptoMetadata = {
                        btcBias: btcTrendBias,
                        marketRegime: regime,
                        executionMode: 'watch',
                    };
                    const watchIdeaData = (0, builder_1.buildTradeIdea)(symbol, symbol, scoredSignal, provider.name, aiAnalysis, 'watch');
                    const watchIdea = await (0, queries_1.insertTradeIdea)(watchIdeaData);
                    if (watchIdea) {
                        summary.tradeIdeasCreated += 1;
                    }
                    if (watchIdea && config_1.config.scanner.testMode && config_1.config.crypto.watchSignalsInTestMode) {
                        const watchMessage = {
                            ...watchIdea,
                            strategy_win_rate: performanceSummary?.winRate ?? null,
                            fakeout_probability: marketAnalysis.fakeoutConfidence,
                            adaptive_confidence_adjustment: confidenceAdjustment,
                        };
                        const messageId = await (0, bot_1.sendNewTradeIdea)(watchMessage);
                        if (messageId) {
                            await (0, queries_1.updateTradeIdeaTelegramId)(watchIdea.id, messageId);
                        }
                    }
                    continue;
                }
                if (aiAnalysis.adjustedStopLoss && aiAnalysis.adjustedStopLoss > 0) {
                    scoredSignal.stopLoss = aiAnalysis.adjustedStopLoss;
                }
                if (aiAnalysis.adjustedTakeProfit1 && aiAnalysis.adjustedTakeProfit1 > 0) {
                    scoredSignal.takeProfit1 = aiAnalysis.adjustedTakeProfit1;
                }
                if (aiAnalysis.adjustedTakeProfit2 && aiAnalysis.adjustedTakeProfit2 > 0) {
                    scoredSignal.takeProfit2 = aiAnalysis.adjustedTakeProfit2;
                }
                summary.aiApproved += 1;
                log.info('[CRYPTO_APPROVE]', {
                    symbol,
                    strategy: scoredSignal.strategy,
                    aiConfidence: aiAnalysis.aiConfidence,
                    riskLevel: aiAnalysis.riskLevel,
                    summary: aiAnalysis.summary,
                });
                symbolSignals.push({
                    ...scoredSignal,
                    marketAnalysis,
                    candles,
                    aiAnalysis,
                    marketType: 'crypto',
                    exchange: 'binance',
                    cryptoMetadata: {
                        btcBias: btcTrendBias,
                        marketRegime: regime,
                    },
                });
            }
            if (symbolSignals.length === 0) {
                if (symbolWatchSignals.length === 0) {
                    return;
                }
                const bestWatchSignal = symbolWatchSignals.reduce((best, current) => current.totalScore > best.totalScore ? current : best);
                const finalCount = await (0, queries_1.countTodayTradeIdeasByMarketType)('crypto');
                if (finalCount >= config_1.config.crypto.maxSignalsPerDay)
                    return;
                bestWatchSignal.executionMode = 'watch';
                bestWatchSignal.cryptoMetadata = {
                    ...(bestWatchSignal.cryptoMetadata || {}),
                    executionMode: 'watch',
                };
                const watchIdeaData = (0, builder_1.buildTradeIdea)(symbol, symbol, bestWatchSignal, provider.name, null, 'watch');
                const watchIdea = await (0, queries_1.insertTradeIdea)(watchIdeaData);
                if (!watchIdea)
                    return;
                summary.watchSignals += 1;
                summary.tradeIdeasCreated += 1;
                log.info('[CRYPTO_WATCH_CREATED]', {
                    symbol,
                    strategy: bestWatchSignal.strategy,
                    quality: bestWatchSignal.quality,
                    totalScore: bestWatchSignal.totalScore,
                    executionMode: 'watch',
                });
                return;
            }
            const bestSignal = symbolSignals.reduce((best, current) => current.totalScore > best.totalScore ? current : best);
            const originalConfidence = bestSignal.totalScore;
            let adjustedConfidence = await (0, strategyPerformance_1.adjustStrategyConfidence)(bestSignal.strategy, bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'neutral', originalConfidence);
            adjustedConfidence = clampConfidence(adjustedConfidence);
            confidenceAdjustment = adjustedConfidence - originalConfidence;
            if (adjustedConfidence !== originalConfidence) {
                log.info('[ADAPTIVE_WEIGHT]', {
                    strategy: bestSignal.strategy,
                    marketRegime: bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'unknown',
                    originalConfidence,
                    adjustedConfidence,
                    confidenceAdjustment,
                });
            }
            bestSignal.totalScore = adjustedConfidence;
            bestSignal.confidence = adjustedConfidence;
            summary.setupsDetected += 1;
            const portfolioResult = await (0, signalPipeline_1.evaluatePortfolioRisk)(symbol, 'crypto', 'Crypto', bestSignal.totalScore);
            if (portfolioResult.rejected) {
                summary.portfolioRejected += 1;
                log.info('[PORTFOLIO_RISK_REJECT]', {
                    symbol,
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
            const sessionResult = (0, signalPipeline_1.evaluateMarketSession)('crypto', bestSignal.totalScore);
            bestSignal.totalScore = clampConfidence(sessionResult.adjustedConfidence);
            bestSignal.confidence = clampConfidence(sessionResult.adjustedConfidence);
            bestSignal.reasons.push(`Session: ${sessionResult.session.session}`);
            const riskGuardResult = await (0, signalPipeline_1.evaluateRiskGuardChecks)(bestSignal.totalScore);
            if (riskGuardResult.paused) {
                summary.riskGuardRejected += 1;
                log.info('[RISK_GUARD_PAUSE]', {
                    symbol,
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
            const stressResult = (0, signalPipeline_1.evaluateMarketStress)(bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'neutral', riskGuardResult.riskGuard.estimatedDrawdownPct / 100, bestSignal.marketAnalysis?.atr || 1, bestSignal.totalScore);
            if (stressResult.stressLevel === 'HIGH' && bestSignal.totalScore < 70) {
                summary.stressRejected += 1;
                log.info('[MARKET_STRESS_REJECT]', {
                    symbol,
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
            const reinforcementResult = await (0, signalPipeline_1.evaluateReinforcement)(bestSignal.strategy, bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'neutral', 'crypto', bestSignal.totalScore);
            if (reinforcementResult.adjustedConfidence !== bestSignal.totalScore) {
                if (reinforcementResult.score < 50) {
                    summary.reinforcementReduced += 1;
                }
                bestSignal.totalScore = reinforcementResult.adjustedConfidence;
                bestSignal.totalScore = clampConfidence(bestSignal.totalScore);
                bestSignal.confidence = clampConfidence(reinforcementResult.adjustedConfidence);
                bestSignal.reasons.push(`Reinforcement score ${reinforcementResult.score}`);
            }
            const executionResult = (0, signalPipeline_1.evaluateExecutionQuality)(bestSignal, bestSignal.marketAnalysis?.spread || config_1.config.executionQuality.baseSpreadPct * 100, bestSignal.marketAnalysis?.atr || 1, bestSignal.totalScore);
            if (executionResult.rejected) {
                summary.executionQualityRejected += 1;
                log.info('[EXECUTION_QUALITY_REJECT]', {
                    symbol,
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
            const finalCount = await (0, queries_1.countTodayTradeIdeasByMarketType)('crypto');
            if (finalCount >= config_1.config.crypto.maxSignalsPerDay)
                return;
            const performanceSummary = await (0, strategyPerformance_1.getStrategyRegimePerformanceSummary)(bestSignal.strategy, bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'neutral');
            const suggestedPositionSizing = await (0, signalPipeline_1.suggestSizeFromContext)(bestSignal, 'crypto', bestSignal.marketAnalysis?.marketRegime?.regime || bestSignal.marketRegime?.regime || 'neutral', bestSignal.totalScore, bestSignal.marketAnalysis?.fakeoutConfidence || 0, bestSignal.marketAnalysis?.atr || 1, riskGuardResult.riskGuard.estimatedDrawdownPct, portfolioResult.snapshot.normalizedExposure);
            const ideaData = (0, builder_1.buildTradeIdea)(symbol, symbol, bestSignal, provider.name, bestSignal.aiAnalysis);
            const idea = await (0, queries_1.insertTradeIdea)(ideaData);
            if (!idea)
                return;
            summary.tradeIdeasCreated += 1;
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
            }
            log.info('[CRYPTO_SCAN] Trade idea created', { symbol, strategy: bestSignal.strategy });
        }
        catch (err) {
            log.error('[CRYPTO_SCAN] Symbol scan error', { symbol, err: err.message });
        }
    };
    await Promise.allSettled(orderedSymbols.map((symbol) => limit(() => scanSymbol(symbol))));
    log.info('[CRYPTO_SCAN_SUMMARY]', {
        symbolsScanned: summary.symbolsScanned,
        setupsDetected: summary.setupsDetected,
        tradeIdeasCreated: summary.tradeIdeasCreated,
        watchSignals: summary.watchSignals,
        AIRejected: summary.aiRejected,
        volumeRejected: summary.volumeRejected,
        strategyRejected: summary.strategyRejected,
        staleRejected: summary.staleRejected,
        insufficientCandles: summary.insufficientCandles,
        configuredVolumeThreshold: config_1.config.crypto.volumeThreshold,
        testMode: config_1.config.scanner.testMode,
        effectiveVolumeThreshold: config_1.config.scanner.testMode
            ? config_1.config.crypto.volumeThreshold * 0.5
            : config_1.config.crypto.volumeThreshold,
        portfolioRejected: summary.portfolioRejected,
        riskGuardRejected: summary.riskGuardRejected,
        stressRejected: summary.stressRejected,
        executionQualityRejected: summary.executionQualityRejected,
        reinforcementReduced: summary.reinforcementReduced,
        aiApproved: summary.aiApproved,
        aiRejected: summary.aiRejected,
        aiWatch: summary.aiWatch,
    });
    log.info('[PERFORMANCE_METRICS]', {
        totalScans: summary.symbolsScanned,
        setupsFound: summary.setupsDetected,
        aiApprovals: summary.aiApproved,
        aiRejections: summary.aiRejected,
        watchSignals: summary.aiWatch,
        strategyWinRate: 'TBD',
        bestPerformingStrategy: 'TBD - live performance tracking pending',
    });
    const approvedRate = summary.setupsDetected > 0
        ? (summary.aiApproved / summary.setupsDetected) * 100
        : 0;
    log.info('[PIPELINE_HEALTH]', {
        setupsDetected: summary.setupsDetected,
        aiApproved: summary.aiApproved,
        approvedRate: Number(approvedRate.toFixed(1)),
        tradeIdeasCreated: summary.tradeIdeasCreated,
    });
    log.info('[CRYPTO_SCAN] Crypto scan complete');
}
