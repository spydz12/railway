import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import {
  getRecentTradeIdeas,
  getActiveTradeIdeas,
  getAllSettings,
  getTradeUpdates,
  getTradeIdeaById,
  getAllSignalPerformances,
  getRecentSignalPerformanceBySymbol,
} from '../database/queries';
import { getProvider, getProviderStatus, getCandlesWithFailover } from '../providers';
import { isUSMarketOpen } from '../utils/time';
import { getRuntimeHealth, setRuntimeService, touchHeartbeat } from '../bootstrap/state';
import { getDbClient } from '../database/client';
import { getPortfolioSnapshot } from '../portfolio';
import { evaluateRiskGuard } from '../risk/guard';
import {
  getDrawdownAnalytics,
  getAIPerformanceAnalytics,
  getStrategyPerformanceSummaries,
  getMarketRegimeAnalytics,
  getAIDecisionAnalytics,
} from '../performance/strategyPerformance';
import { getReinforcementAnalytics, getPriorSimilarOutcomes } from '../reinforcement/memory';
import {
  getPerformanceValidationAnalytics,
  getSignalQualityValidationAnalytics,
  getPaperTradingAnalytics,
} from '../performance/validation';
import { getPerformanceOverview } from '../performance/overview';
import { enforceRateLimit, requireAdmin, sanitizeRequest } from '../security/middleware';
import { incrementCounter, recordLatency, getMetricsSnapshot } from '../observability/metrics';
import { BacktestEngine } from '../backtest/engine';
import { getStrategyBySlug } from '../strategies';
import { registerDashboardRoutes } from './dashboard';

const log = createComponentLogger('api');

const backtestEngine = new BacktestEngine();

function parseDateInput(input: string | undefined, fallback: Date): Date {
  if (!input) return fallback;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export async function startApiServer(): Promise<void> {
  if (!config.api.enableInternalApi) {
    log.info('Internal API disabled.');
    return;
  }

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: '*' });

  app.addHook('onRequest', async (request, reply) => {
    sanitizeRequest(request);
    const ok = enforceRateLimit(request, reply);
    if (!ok) {
      incrementCounter('api.rate_limited');
      return reply;
    }

    (request as any).__startMs = Date.now();
    return;
  });

  app.addHook('onResponse', async (request) => {
    const start = (request as any).__startMs as number | undefined;
    if (!start) return;
    const latency = Date.now() - start;
    recordLatency(`api.${request.routerPath ?? request.url}`, latency);
  });

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    market_open: isUSMarketOpen(),
    providers: getProviderStatus(),
  }));

  app.get('/api/health', async () => {
    const runtime = getRuntimeHealth();

    try {
      const db = getDbClient();
      await db.from('trade_ideas').select('id').limit(1);
      setRuntimeService('database', true);
    } catch {
      setRuntimeService('database', false);
    }

    touchHeartbeat();
    const updated = getRuntimeHealth();

    return {
      scanner: updated.scanner,
      tracking: updated.tracking,
      telegram: updated.telegram,
      database: updated.database,
      heartbeat: updated.heartbeat,
    };
  });

  app.get('/health/full', async () => {
    const provider = getProvider();
    let providerHealthy = true;
    try {
      const quote = await provider.getQuote('SPY');
      providerHealthy = Boolean(quote && quote.price > 0);
    } catch {
      providerHealthy = false;
    }

    return {
      status: providerHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      market_open: isUSMarketOpen(),
      providers: getProviderStatus(),
      activeProvider: provider.name,
      metrics: getMetricsSnapshot(),
    };
  });

  app.get('/metrics', async () => getMetricsSnapshot());

  await registerDashboardRoutes(app);

  app.get('/ideas', async (req) => {
    const query = req.query as { limit?: string };
    // Guard against NaN: parseInt('abc') = NaN, which breaks .limit() in Supabase
    const parsed = parseInt(query.limit ?? '20', 10);
    const limit = Math.min(isNaN(parsed) ? 20 : parsed, 100);
    return getRecentTradeIdeas(limit);
  });

  app.get('/ideas/active', async () => {
    return getActiveTradeIdeas();
  });

  app.get<{ Params: { id: string } }>('/ideas/:id', async (req) => {
    const { id } = req.params;
    const idea = await getTradeIdeaById(id);
    if (!idea) {
      return { error: 'not_found', id };
    }
    return idea;
  });

  app.get<{ Params: { id: string } }>('/ideas/:id/updates', async (req) => {
    const { id } = req.params;
    return getTradeUpdates(id);
  });

  app.get('/settings', async () => {
    return getAllSettings();
  });

  app.get('/providers', async () => {
    return getProviderStatus();
  });

  app.get('/analytics/portfolio', async () => {
    return getPortfolioSnapshot();
  });

  app.get('/analytics/risk', async () => {
    return evaluateRiskGuard();
  });

  app.get('/analytics/drawdown', async () => {
    return getDrawdownAnalytics();
  });

  app.get('/analytics/ai-performance', async () => {
    return getAIPerformanceAnalytics();
  });

  app.get('/analytics/reinforcement', async () => {
    return getReinforcementAnalytics();
  });

  app.get('/analytics/strategies', async () => {
    const [summaries, records] = await Promise.all([
      getStrategyPerformanceSummaries(),
      getAllSignalPerformances(1000),
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
      getMarketRegimeAnalytics(),
      getAllSignalPerformances(1000),
      evaluateRiskGuard(),
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
      getAIDecisionAnalytics(),
      getAIPerformanceAnalytics(),
      getAllSignalPerformances(1000),
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
    const ideas = await getRecentTradeIdeas(1000);

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

  app.get<{ Params: { id: string } }>('/analytics/signals/:id', async (req) => {
    const { id } = req.params;
    const idea = await getTradeIdeaById(id);
    if (!idea) {
      return { error: 'not_found', id };
    }

    const [updates, symbolHistory, similarTrades] = await Promise.all([
      getTradeUpdates(id),
      getRecentSignalPerformanceBySymbol(idea.ticker, 100),
      getPriorSimilarOutcomes(
        idea.strategy_slug,
        idea.market_condition ?? 'unknown',
        idea.market_type,
        10
      ),
    ]);

    return {
      idea,
      updates,
      symbolHistory,
      similarTrades,
    };
  });

  app.get('/analytics/performance-validation', async () => {
    return getPerformanceValidationAnalytics();
  });

  app.get('/analytics/signal-quality', async () => {
    return getSignalQualityValidationAnalytics();
  });

  app.get('/analytics/paper', async () => {
    return getPaperTradingAnalytics();
  });

  app.get('/api/performance/overview', async () => {
    return getPerformanceOverview();
  });

  app.get('/analytics/backtests', async (req, reply) => {
    if (config.security.enforceAdminOnControlRoutes && !requireAdmin(req, reply)) {
      return;
    }

    const query = req.query as {
      strategy?: string;
      symbol?: string;
      timeframe?: string;
      start?: string;
      end?: string;
      initialCapital?: string;
      commission?: string;
      slippage?: string;
      maxPositionSize?: string;
      maxPositions?: string;
    };

    const strategySlug = query.strategy ?? 'trend_pullback';
    const symbol = query.symbol ?? 'SPY';
    const timeframe = query.timeframe ?? '15m';
    const strategy = getStrategyBySlug(strategySlug);

    if (!strategy) {
      reply.code(400).send({ error: 'invalid_strategy', strategy: strategySlug });
      return;
    }

    const candles = await getCandlesWithFailover(symbol, timeframe, 1200, 'stocks');
    if (candles.length < 100) {
      reply.code(400).send({ error: 'insufficient_candles', count: candles.length });
      return;
    }

    const endDate = parseDateInput(query.end, new Date());
    const startFallback = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const startDate = parseDateInput(query.start, startFallback);

    const result = await backtestEngine.runBacktest(
      async (backtestCandles, ticker) => {
        const evaluation = strategy.evaluate(backtestCandles, ticker, timeframe);
        return evaluation.valid ? [evaluation] : [];
      },
      symbol,
      candles,
      {
        initialCapital: Number(query.initialCapital ?? 100000),
        commission: Number(query.commission ?? 2),
        slippage: Number(query.slippage ?? 0.05),
        maxPositionSize: Number(query.maxPositionSize ?? 5),
        maxPositions: Number(query.maxPositions ?? 4),
        startDate,
        endDate,
      }
    );

    return result;
  });

  try {
    await app.listen({ port: config.api.port, host: config.api.host });
    log.info(`Internal API running on http://${config.api.host}:${config.api.port}`);
  } catch (err: unknown) {
    log.error('Failed to start API server', { err: (err as Error).message });
  }
}
