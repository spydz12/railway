"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApiServer = startApiServer;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const queries_1 = require("../database/queries");
const providers_1 = require("../providers");
const time_1 = require("../utils/time");
const state_1 = require("../bootstrap/state");
const client_1 = require("../database/client");
const portfolio_1 = require("../portfolio");
const guard_1 = require("../risk/guard");
const strategyPerformance_1 = require("../performance/strategyPerformance");
const memory_1 = require("../reinforcement/memory");
const validation_1 = require("../performance/validation");
const overview_1 = require("../performance/overview");
const middleware_1 = require("../security/middleware");
const metrics_1 = require("../observability/metrics");
const engine_1 = require("../backtest/engine");
const strategies_1 = require("../strategies");
const dashboard_1 = require("./dashboard");
const log = (0, logger_1.createComponentLogger)('api');
const backtestEngine = new engine_1.BacktestEngine();
function parseDateInput(input, fallback) {
    if (!input)
        return fallback;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime()))
        return fallback;
    return parsed;
}
async function startApiServer() {
    if (!config_1.config.api.enableInternalApi) {
        log.info('Internal API disabled.');
        return;
    }
    const app = (0, fastify_1.default)({ logger: false });
    await app.register(cors_1.default, { origin: '*' });
    app.addHook('onRequest', async (request, reply) => {
        (0, middleware_1.sanitizeRequest)(request);
        const ok = (0, middleware_1.enforceRateLimit)(request, reply);
        if (!ok) {
            (0, metrics_1.incrementCounter)('api.rate_limited');
            return reply;
        }
        request.__startMs = Date.now();
        return;
    });
    app.addHook('onResponse', async (request) => {
        const start = request.__startMs;
        if (!start)
            return;
        const latency = Date.now() - start;
        (0, metrics_1.recordLatency)(`api.${request.routerPath ?? request.url}`, latency);
    });
    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        market_open: (0, time_1.isUSMarketOpen)(),
        providers: (0, providers_1.getProviderStatus)(),
    }));
    app.get('/api/health', async () => {
        const runtime = (0, state_1.getRuntimeHealth)();
        try {
            const db = (0, client_1.getDbClient)();
            await db.from('trade_ideas').select('id').limit(1);
            (0, state_1.setRuntimeService)('database', true);
        }
        catch {
            (0, state_1.setRuntimeService)('database', false);
        }
        (0, state_1.touchHeartbeat)();
        const updated = (0, state_1.getRuntimeHealth)();
        return {
            scanner: updated.scanner,
            tracking: updated.tracking,
            telegram: updated.telegram,
            database: updated.database,
            heartbeat: updated.heartbeat,
        };
    });
    app.get('/health/full', async () => {
        const provider = (0, providers_1.getProvider)();
        let providerHealthy = true;
        try {
            const quote = await provider.getQuote('SPY');
            providerHealthy = Boolean(quote && quote.price > 0);
        }
        catch {
            providerHealthy = false;
        }
        return {
            status: providerHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            market_open: (0, time_1.isUSMarketOpen)(),
            providers: (0, providers_1.getProviderStatus)(),
            activeProvider: provider.name,
            metrics: (0, metrics_1.getMetricsSnapshot)(),
        };
    });
    app.get('/metrics', async () => (0, metrics_1.getMetricsSnapshot)());
    await (0, dashboard_1.registerDashboardRoutes)(app);
    app.get('/ideas', async (req) => {
        const query = req.query;
        // Guard against NaN: parseInt('abc') = NaN, which breaks .limit() in Supabase
        const parsed = parseInt(query.limit ?? '20', 10);
        const limit = Math.min(isNaN(parsed) ? 20 : parsed, 100);
        return (0, queries_1.getRecentTradeIdeas)(limit);
    });
    app.get('/ideas/active', async () => {
        return (0, queries_1.getActiveTradeIdeas)();
    });
    app.get('/ideas/:id', async (req) => {
        const { id } = req.params;
        const idea = await (0, queries_1.getTradeIdeaById)(id);
        if (!idea) {
            return { error: 'not_found', id };
        }
        return idea;
    });
    app.get('/ideas/:id/updates', async (req) => {
        const { id } = req.params;
        return (0, queries_1.getTradeUpdates)(id);
    });
    app.get('/settings', async () => {
        return (0, queries_1.getAllSettings)();
    });
    app.get('/providers', async () => {
        return (0, providers_1.getProviderStatus)();
    });
    app.get('/analytics/portfolio', async () => {
        return (0, portfolio_1.getPortfolioSnapshot)();
    });
    app.get('/analytics/risk', async () => {
        return (0, guard_1.evaluateRiskGuard)();
    });
    app.get('/analytics/drawdown', async () => {
        return (0, strategyPerformance_1.getDrawdownAnalytics)();
    });
    app.get('/analytics/ai-performance', async () => {
        return (0, strategyPerformance_1.getAIPerformanceAnalytics)();
    });
    app.get('/analytics/reinforcement', async () => {
        return (0, memory_1.getReinforcementAnalytics)();
    });
    app.get('/analytics/strategies', async () => {
        const [summaries, records] = await Promise.all([
            (0, strategyPerformance_1.getStrategyPerformanceSummaries)(),
            (0, queries_1.getAllSignalPerformances)(1000),
        ]);
        const performanceTimeline = records
            .slice()
            .reverse()
            .map((record, index) => {
            const risk = Math.abs(Number(record.entry) - Number(record.stop_loss));
            const reward = record.take_profit ? Math.abs(Number(record.take_profit) - Number(record.entry)) : 0;
            const rr = risk > 0 ? reward / risk : 0;
            const pnl = record.win_loss ? rr : -1;
            return {
                index: index + 1,
                createdAt: record.created_at,
                strategy: record.strategy,
                outcome: record.win_loss ? 1 : 0,
                rr: Number(rr.toFixed(3)),
                pnl: Number(pnl.toFixed(3)),
            };
        });
        const strategyWeightingHistory = records
            .slice()
            .reverse()
            .map((record, index) => {
            const risk = Math.abs(Number(record.entry) - Number(record.stop_loss));
            const reward = record.take_profit ? Math.abs(Number(record.take_profit) - Number(record.entry)) : 0;
            const rr = risk > 0 ? reward / risk : 0;
            const baseWeight = (record.ai_confidence ?? 50) / 100;
            const adjustedWeight = Math.max(0, Math.min(1.5, baseWeight * (record.win_loss ? 1 + rr * 0.08 : 0.8)));
            return {
                index: index + 1,
                createdAt: record.created_at,
                strategy: record.strategy,
                baseWeight: Number(baseWeight.toFixed(3)),
                adjustedWeight: Number(adjustedWeight.toFixed(3)),
                marketRegime: record.market_regime ?? 'unknown',
            };
        });
        return {
            summaries,
            performanceTimeline,
            strategyWeightingHistory,
        };
    });
    app.get('/analytics/market-regime', async () => {
        const [regimePerformance, records, risk] = await Promise.all([
            (0, strategyPerformance_1.getMarketRegimeAnalytics)(),
            (0, queries_1.getAllSignalPerformances)(1000),
            (0, guard_1.evaluateRiskGuard)(),
        ]);
        const regimeTimeline = records
            .slice()
            .reverse()
            .map((record, index) => ({
            index: index + 1,
            createdAt: record.created_at,
            regime: record.market_regime ?? 'unknown',
            volatility: record.volatility_level ?? 'unknown',
            btcBias: record.btc_bias ?? 'neutral',
            winLoss: record.win_loss,
        }));
        return {
            currentRegime: regimeTimeline.length > 0 ? regimeTimeline[regimeTimeline.length - 1].regime : 'unknown',
            stressLevel: risk.riskLevel,
            btcMarketCondition: regimeTimeline.length > 0 ? regimeTimeline[regimeTimeline.length - 1].btcBias : 'neutral',
            regimePerformance,
            regimeTimeline,
        };
    });
    app.get('/analytics/ai-decisions', async () => {
        const [decisionSummary, aiPerformance, records] = await Promise.all([
            (0, strategyPerformance_1.getAIDecisionAnalytics)(),
            (0, strategyPerformance_1.getAIPerformanceAnalytics)(),
            (0, queries_1.getAllSignalPerformances)(1000),
        ]);
        const decisionsOverTime = records
            .slice()
            .reverse()
            .map((record, index) => ({
            index: index + 1,
            createdAt: record.created_at,
            decision: record.ai_decision ?? 'UNKNOWN',
            confidence: record.ai_confidence ?? 0,
            fakeoutConfidence: record.fakeout_confidence ?? 0,
            winLoss: record.win_loss,
        }));
        return {
            summary: decisionSummary,
            metrics: aiPerformance,
            decisionsOverTime,
        };
    });
    app.get('/analytics/telegram', async () => {
        const ideas = await (0, queries_1.getRecentTradeIdeas)(1000);
        const sent = ideas.filter((idea) => idea.telegram_message_id !== null);
        const rejected = ideas.filter((idea) => idea.ai_decision === 'REJECT');
        const approved = ideas.filter((idea) => idea.ai_decision === 'APPROVE');
        const watch = ideas.filter((idea) => idea.ai_decision === 'WATCH');
        return {
            totalSignals: ideas.length,
            sentSignals: sent.length,
            sendSuccessRate: ideas.length > 0 ? Number(((sent.length / ideas.length) * 100).toFixed(1)) : 0,
            rejectedSignals: rejected.length,
            approvedSignals: approved.length,
            approvedAndSent: approved.filter((idea) => idea.telegram_message_id !== null).length,
            watchSignals: watch.length,
            delivery: {
                delivered: sent.length,
                pending: ideas.filter((idea) => idea.telegram_message_id === null && idea.ai_decision === 'APPROVE').length,
            },
            timeline: ideas
                .slice()
                .reverse()
                .map((idea, index) => ({
                index: index + 1,
                createdAt: idea.created_at,
                aiDecision: idea.ai_decision ?? 'UNKNOWN',
                sent: idea.telegram_message_id !== null,
                status: idea.status,
            })),
        };
    });
    app.get('/analytics/signals/:id', async (req) => {
        const { id } = req.params;
        const idea = await (0, queries_1.getTradeIdeaById)(id);
        if (!idea) {
            return { error: 'not_found', id };
        }
        const [updates, symbolHistory, similarTrades] = await Promise.all([
            (0, queries_1.getTradeUpdates)(id),
            (0, queries_1.getRecentSignalPerformanceBySymbol)(idea.ticker, 100),
            (0, memory_1.getPriorSimilarOutcomes)(idea.strategy_slug, idea.market_condition ?? 'unknown', idea.market_type, 10),
        ]);
        return {
            idea,
            updates,
            symbolHistory,
            similarTrades,
        };
    });
    app.get('/analytics/performance-validation', async () => {
        return (0, validation_1.getPerformanceValidationAnalytics)();
    });
    app.get('/analytics/signal-quality', async () => {
        return (0, validation_1.getSignalQualityValidationAnalytics)();
    });
    app.get('/analytics/paper', async () => {
        return (0, validation_1.getPaperTradingAnalytics)();
    });
    app.get('/api/performance/overview', async () => {
        return (0, overview_1.getPerformanceOverview)();
    });
    app.get('/analytics/backtests', async (req, reply) => {
        if (config_1.config.security.enforceAdminOnControlRoutes && !(0, middleware_1.requireAdmin)(req, reply)) {
            return;
        }
        const query = req.query;
        const strategySlug = query.strategy ?? 'trend_pullback';
        const symbol = query.symbol ?? 'SPY';
        const timeframe = query.timeframe ?? '15m';
        const strategy = (0, strategies_1.getStrategyBySlug)(strategySlug);
        if (!strategy) {
            reply.code(400).send({ error: 'invalid_strategy', strategy: strategySlug });
            return;
        }
        const candles = await (0, providers_1.getCandlesWithFailover)(symbol, timeframe, 1200, 'stocks');
        if (candles.length < 100) {
            reply.code(400).send({ error: 'insufficient_candles', count: candles.length });
            return;
        }
        const endDate = parseDateInput(query.end, new Date());
        const startFallback = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        const startDate = parseDateInput(query.start, startFallback);
        const result = await backtestEngine.runBacktest(async (backtestCandles, ticker) => {
            const evaluation = strategy.evaluate(backtestCandles, ticker, timeframe);
            return evaluation.valid ? [evaluation] : [];
        }, symbol, candles, {
            initialCapital: Number(query.initialCapital ?? 100000),
            commission: Number(query.commission ?? 2),
            slippage: Number(query.slippage ?? 0.05),
            maxPositionSize: Number(query.maxPositionSize ?? 5),
            maxPositions: Number(query.maxPositions ?? 4),
            startDate,
            endDate,
        });
        return result;
    });
    try {
        await app.listen({ port: config_1.config.api.port, host: config_1.config.api.host });
        log.info(`Internal API running on http://${config_1.config.api.host}:${config_1.config.api.port}`);
    }
    catch (err) {
        log.error('Failed to start API server', { err: err.message });
    }
}
