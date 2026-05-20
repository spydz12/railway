"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSignalCandidate = analyzeSignalCandidate;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('ai-analyst');
let openai = null;
let dailyCallCount = 0;
let lastResetDate = new Date().toDateString();
function resetDailyCount() {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        dailyCallCount = 0;
        lastResetDate = today;
    }
}
function initializeOpenAI() {
    if (!config_1.config.ai.enabled) {
        log.debug('AI Analyst disabled');
        return false;
    }
    if (!process.env.OPENAI_API_KEY) {
        log.warn('OPENAI_API_KEY not set, AI analyst disabled');
        return false;
    }
    if (!openai) {
        openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return true;
}
function shouldSkipAIAnalysis(candidate) {
    resetDailyCount();
    if (dailyCallCount >= (config_1.config.ai.maxCallsPerDay || 50)) {
        log.warn('[AI_ANALYST_SKIPPED] Daily AI limit reached', {
            symbol: candidate.symbol,
            strategy: candidate.strategy,
            callsToday: dailyCallCount,
            maxCalls: config_1.config.ai.maxCallsPerDay,
        });
        return true;
    }
    return false;
}
function buildAIPrompt(candidate) {
    const side = candidate.side === 'LONG' ? 'LONG' : 'SHORT';
    const direction = candidate.side === 'LONG' ? 'bullish' : 'bearish';
    const marketType = candidate.marketType === 'crypto' ? 'crypto' : 'stocks';
    const exchange = candidate.exchange || 'unknown';
    return `You are a crypto strategy validator. You must output valid JSON only. No markdown. No extra explanation outside JSON.

CRITICAL RULES — read before evaluating:
- Do not evaluate indicators in isolation. Interpret every indicator according to strategy type.
- crypto_market_regime_grid performs BEST in ranging markets. Ranging regime is POSITIVE for grid/mean-reversion strategies, not a risk factor.
- crypto_ema_trend_cloud can work in neutral or ranging markets if EMA21 is above EMA50 and rising — bullish EMA structure outweighs regime label.
- RSI between 45–60 is neutral. It is NOT bearish. Never reject a setup solely because RSI is below 60.
- RSI under 30 = oversold (favors reversal and mean-reversion strategies).
- RSI over 70 = overbought (flag trend exhaustion only for trend-following strategies, not for range or reversal setups).
- Never reject ONLY because market regime is "ranging".
- Risk/reward above the strategy-specific threshold is a positive indicator.
- Strategy Confidence is a multi-factor machine score. A score above 70 means the system strongly endorses this setup. Treat it as a significant positive factor in your decision.
- REJECT only when: (1) multiple signals actively conflict with the strategy's logic, OR (2) risk/reward is below acceptable minimum, OR (3) market conditions directly oppose the strategy type (e.g. strong trending market against a range-bound grid strategy).

Analyze this ${candidate.strategy} signal for ${candidate.symbol}:

MARKET CONTEXT:
- Market Type: ${marketType}
- Exchange: ${exchange}
- Symbol: ${candidate.symbol}
- Strategy: ${candidate.strategy}
- Direction: ${side} (${direction})
- Timeframe: ${candidate.timeframe}
- Market Regime: ${candidate.marketRegime}
- Relative Strength vs SPY: ${candidate.relativeStrength.toFixed(2)}

TECHNICAL INDICATORS:
- RSI: ${candidate.indicators.rsi.toFixed(1)}
- EMA21: ${candidate.indicators.ema21.toFixed(2)}
- EMA50: ${candidate.indicators.ema50.toFixed(2)}
- VWAP: ${candidate.indicators.vwap.toFixed(2)}
- ATR: ${candidate.indicators.atr.toFixed(2)}
- Volume: ${candidate.indicators.volume.toLocaleString()}
- Relative Volume: ${candidate.indicators.relativeVolume.toFixed(1)}x

TRADE SETUP:
- Entry: $${candidate.entry.toFixed(2)}
- Stop Loss: $${candidate.stopLoss.toFixed(2)}
- Take Profit 1: $${candidate.takeProfit1.toFixed(2)}
- Take Profit 2: $${(candidate.takeProfit2 || 0).toFixed(2)}
- Risk/Reward: ${candidate.riskReward.toFixed(2)}
- Strategy Confidence (machine score): ${candidate.confidence}%${candidate.confidence >= 70 ? ' ← MACHINE STRONGLY ENDORSES THIS SETUP' : candidate.confidence >= 55 ? ' ← machine moderate endorsement' : ''}

CANDLE CONTEXT:
${candidate.candleContext}

FAKE BREAKOUT ANALYSIS:
- Confidence: ${candidate.fakeBreakoutAnalysis.confidence}%
- Reasons: ${candidate.fakeBreakoutAnalysis.reasons.join(', ')}

${candidate.performanceSummary ? `PERFORMANCE SUMMARY (${candidate.performanceSummary.strategy} / ${candidate.performanceSummary.marketRegime}):
- Total Trades: ${candidate.performanceSummary.totalTrades}
- Win Rate: ${candidate.performanceSummary.winRate.toFixed(1)}%
- Average R/R: ${candidate.performanceSummary.averageRR.toFixed(2)}
- Profit Factor: ${candidate.performanceSummary.profitFactor.toFixed(2)}

` : ''}
PORTFOLIO RISK:
- Level: ${candidate.portfolioRisk?.level ?? 'N/A'}
- Normalized Exposure: ${candidate.portfolioRisk?.normalizedExposure?.toFixed(2) ?? 'N/A'}
- Crypto Allocation: ${candidate.portfolioRisk?.cryptoAllocation?.toFixed(1) ?? 'N/A'}%
- Cluster Count: ${candidate.portfolioRisk?.clusterCount ?? 'N/A'}
- Reason: ${candidate.portfolioRisk?.reason ?? 'None'}

RISK GUARD:
- Pause Trading: ${candidate.riskGuard?.pauseTrading ? 'YES' : 'NO'}
- Risk Level: ${candidate.riskGuard?.riskLevel ?? 'UNKNOWN'}
- Drawdown: ${candidate.riskGuard?.estimatedDrawdownPct ?? 'N/A'}%
- Consecutive Losses: ${candidate.riskGuard?.consecutiveLosses ?? 'N/A'}

SESSION CONTEXT:
- Session: ${candidate.sessionContext?.session ?? 'unknown'}
- Context: ${candidate.sessionContext?.description ?? 'N/A'}

MARKET STRESS:
- Stress Level: ${candidate.marketStress ?? 'N/A'}

REINFORCEMENT:
- Reinforcement Score: ${candidate.reinforcementScore ?? 'N/A'}
- Similar Trade Outcomes: ${candidate.similarTradeOutcomes && candidate.similarTradeOutcomes.length > 0 ? candidate.similarTradeOutcomes.map((o) => `${o.symbol}:${o.outcome}`).join('; ') : 'None'}

EXECUTION QUALITY:
- Expected Slippage: ${candidate.executionQuality?.slippagePct ?? 'N/A'}%
- Adjusted Entry: $${candidate.executionQuality?.entryPrice?.toFixed(2) ?? 'N/A'}
- Adjusted SL: $${candidate.executionQuality?.stopLoss?.toFixed(2) ?? 'N/A'}
- Adjusted TP1: $${candidate.executionQuality?.takeProfit1?.toFixed(2) ?? 'N/A'}

POSITION SIZING:
- Suggested Size: ${candidate.suggestedPositionSizing ? `${candidate.suggestedPositionSizing.positionSizePct}%` : 'N/A'}
- Target Risk: ${candidate.suggestedPositionSizing ? `${candidate.suggestedPositionSizing.targetRiskPct}%` : 'N/A'}
- Max Position: ${candidate.suggestedPositionSizing ? `${candidate.suggestedPositionSizing.maxPositionPct}%` : 'N/A'}

1. Match strategy type to market regime — ranging is valid and good for grid/mean-reversion, not a red flag
2. Evaluate RSI in context of strategy type — 45–60 is neutral, only flag RSI if it directly contradicts the strategy's required condition
3. Verify risk/reward meets the strategy threshold — above threshold is a positive factor
4. Weight the machine confidence (Strategy Confidence) heavily — above 70 is a strong system endorsement
5. APPROVE when regime aligns with strategy logic, RR is sufficient, and no indicators actively conflict
6. WATCH when setup is valid but one indicator is borderline or needs more confirmation
7. REJECT only when multiple signals directly oppose strategy logic, or risk/reward is clearly below minimum

Output only valid JSON with this exact structure:
{
  "decision": "APPROVE" | "REJECT" | "WATCH",
  "aiConfidence": number (0-100),
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "brief explanation",
  "approvalReasons": ["reason1", "reason2"],
  "riskWarnings": ["warning1", "warning2"],
  "suggestedAction": "action description",
  "adjustedStopLoss": number or null,
  "adjustedTakeProfit1": number or null,
  "adjustedTakeProfit2": number or null
}`;
}
async function callOpenAI(prompt) {
    if (!openai)
        return null;
    try {
        const response = await openai.chat.completions.create({
            model: config_1.config.ai.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1, // Low temperature for consistent analysis
            max_tokens: 1000,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
            log.error('OpenAI returned empty response');
            return null;
        }
        dailyCallCount++;
        return content.trim();
    }
    catch (error) {
        log.error('OpenAI API error', { error: error.message });
        return null;
    }
}
function parseAIResponse(response) {
    try {
        const parsed = JSON.parse(response);
        // Validate required fields
        if (!['APPROVE', 'REJECT', 'WATCH'].includes(parsed.decision)) {
            throw new Error('Invalid decision');
        }
        if (typeof parsed.aiConfidence !== 'number' || parsed.aiConfidence < 0 || parsed.aiConfidence > 100) {
            throw new Error('Invalid aiConfidence');
        }
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel)) {
            throw new Error('Invalid riskLevel');
        }
        return {
            decision: parsed.decision,
            aiConfidence: parsed.aiConfidence,
            riskLevel: parsed.riskLevel,
            summary: parsed.summary || '',
            approvalReasons: Array.isArray(parsed.approvalReasons) ? parsed.approvalReasons : [],
            riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : [],
            suggestedAction: parsed.suggestedAction || '',
            adjustedStopLoss: typeof parsed.adjustedStopLoss === 'number' ? parsed.adjustedStopLoss : null,
            adjustedTakeProfit1: typeof parsed.adjustedTakeProfit1 === 'number' ? parsed.adjustedTakeProfit1 : null,
            adjustedTakeProfit2: typeof parsed.adjustedTakeProfit2 === 'number' ? parsed.adjustedTakeProfit2 : null,
        };
    }
    catch (error) {
        log.error('Failed to parse AI response', { response, error: error.message });
        return null;
    }
}
async function analyzeSignalCandidate(candidate) {
    if (!initializeOpenAI()) {
        return null;
    }
    if (shouldSkipAIAnalysis(candidate)) {
        log.debug('Skipping AI analysis', {
            symbol: candidate.symbol,
            strategy: candidate.strategy,
            reason: candidate.confidence < 55 ? 'low confidence' :
                candidate.riskReward < 1.5 ? 'low RR' :
                    candidate.fakeBreakoutAnalysis.confidence > 70 ? 'fake breakout' :
                        'daily limit reached'
        });
        return null;
    }
    const prompt = buildAIPrompt(candidate);
    log.info('[AI_ANALYST_START]', {
        symbol: candidate.symbol,
        strategy: candidate.strategy,
        confidence: candidate.confidence,
        riskReward: candidate.riskReward,
        marketRegime: candidate.marketRegime,
        fakeoutConfidence: candidate.fakeBreakoutAnalysis.confidence,
    });
    log.info('[AI_ANALYST_REQUEST]', {
        symbol: candidate.symbol,
        strategy: candidate.strategy,
        aiModel: config_1.config.ai.model,
    });
    const response = await callOpenAI(prompt);
    if (!response) {
        log.warn('[AI_ANALYST_RESPONSE] No response received', {
            symbol: candidate.symbol,
            strategy: candidate.strategy,
        });
        return null;
    }
    log.info('[AI_ANALYST_RESPONSE]', {
        symbol: candidate.symbol,
        strategy: candidate.strategy,
        rawResponse: response.length > 500 ? `${response.slice(0, 500)}...` : response,
    });
    const result = parseAIResponse(response);
    if (!result) {
        // If parsing fails, reject safely
        return {
            decision: 'REJECT',
            aiConfidence: 0,
            riskLevel: 'HIGH',
            summary: 'AI analysis failed - rejecting for safety',
            approvalReasons: [],
            riskWarnings: ['AI parsing error'],
            suggestedAction: 'Do not trade',
            adjustedStopLoss: null,
            adjustedTakeProfit1: null,
            adjustedTakeProfit2: null,
        };
    }
    if (config_1.config.scanner.debugSignals) {
        log.debug('[AI_ANALYST] Analysis complete', {
            symbol: candidate.symbol,
            decision: result.decision,
            aiConfidence: result.aiConfidence,
            riskLevel: result.riskLevel,
        });
    }
    return result;
}
