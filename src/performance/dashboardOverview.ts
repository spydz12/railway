import * as fs from 'fs/promises';
import * as path from 'path';
import { getDbClient } from '../database/client';
import { getActiveTradeIdeas, getSignalExecutionOutcomes } from '../database/queries';
import { getPerformanceOverview } from './overview';

interface LearningRow {
  strategy_slug: string;
  ticker?: string | null;
  timeframe?: string | null;
  direction?: string | null;
  market_regime?: string | null;
  session?: string | null;
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  confidence_modifier: number;
  last_updated: string;
}

interface CompetitionLogRow {
  timestamp: string;
  winner: string;
  losers: Array<{ source: string; reason: string; effectiveModifier: number }>;
  adjustedConfidence?: number;
}

interface DecisionLogRow {
  timestamp: string;
  strategy: string;
  source: string;
  effectiveModifier: number;
  recencyWeight: number;
  sampleWeight: number;
  decision: string;
}

interface TelegramModeRow {
  timestamp: string;
  mode: string;
  isTest: boolean;
  showTestLabel: boolean;
  reason?: string;
}

export interface DashboardOverviewResponse {
  generatedAt: string;
  liveSignals: {
    activeSignals: number;
    closedSignals: number;
    winRate: number;
    totalPnL: number;
    avgProfit: number;
    profitFactor: number;
    totalTrackedTrades: number;
    rows: Array<{
      id: string;
      ticker: string;
      direction: string;
      strategy: string;
      confidence: number;
      status: string;
      profit: number;
      created: string;
      durationMinutes: number;
    }>;
  };
  reinforcementIntelligence: {
    topStrategy: LearningRow | null;
    bestContext: LearningRow | null;
    bestMarketRegime: LearningRow | null;
    currentModifiers: {
      strategy: Array<{ strategy: string; modifier: number }>;
      context: Array<{ key: string; modifier: number }>;
      marketRegime: Array<{ key: string; modifier: number }>;
    };
    recentLearningUpdates: Array<Record<string, unknown>>;
    strategyLearning: Array<Record<string, unknown>>;
    contextLearning: Array<Record<string, unknown>>;
    marketRegimeLearning: Array<Record<string, unknown>>;
  };
  sourceCompetition: {
    priorityFlow: string[];
    competitions: CompetitionLogRow[];
    decisions: DecisionLogRow[];
    latestWinner: string | null;
  };
  signalPerformance: {
    winRateHistory: Array<{ index: number; time: string; winRate: number }>;
    pnlOverTime: Array<{ index: number; time: string; pnl: number }>;
    strategyBreakdown: Array<{ strategy: string; signals: number; wins: number; losses: number; winRate: number; avgProfit: number; avgDuration: number; totalPnL: number }>;
    marketRegimePerformance: Array<{ regime: string; trades: number; winRate: number; totalPnL: number }>;
    contextPerformance: Array<{ context: string; trades: number; winRate: number; totalPnL: number }>;
  };
  telegramActivity: {
    signalsSent: number;
    errors: number;
    lastMessage: Record<string, unknown> | null;
    deliveryHealth: number;
    pendingSignals: number;
    telegramModeLogs: TelegramModeRow[];
  };
  systemHealth: {
    scannerStatus: string;
    telegramStatus: string;
    databaseStatus: 'online' | 'degraded';
    cronStatus: string;
    trackingStatus: string;
    heartbeat: string | null;
  };
  deployment: {
    blockers: string[];
    details: Array<{ check: string; found: boolean; status: 'READY' | 'NOT READY' | 'BLOCKED'; note: string }>;
  };
}

function round(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getRecencyWeight(lastUpdated: string | null | undefined): number {
  if (!lastUpdated) return 0.1;
  const ts = Date.parse(lastUpdated);
  if (Number.isNaN(ts)) return 0.1;
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 7) return 1;
  if (days <= 14) return 0.9;
  if (days <= 30) return 0.75;
  if (days <= 60) return 0.5;
  if (days <= 90) return 0.25;
  return 0.1;
}

function getSampleWeight(trades: number): number {
  if (trades < 5) return 0.1;
  if (trades <= 10) return 0.25;
  if (trades < 20) return 0.5;
  if (trades < 50) return 0.75;
  return 1;
}

async function safeReadLogLines(filePath: string, maxLines: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function parseJsonLines<T extends Record<string, unknown>>(lines: string[]): T[] {
  const rows: T[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch {
      // Ignore malformed lines.
    }
  }
  return rows;
}

function mapStatusFromHeartbeat(lastIso: string | null, thresholdMinutes: number): 'online' | 'degraded' {
  if (!lastIso) return 'degraded';
  const ts = Date.parse(lastIso);
  if (Number.isNaN(ts)) return 'degraded';
  const ageMinutes = (Date.now() - ts) / (1000 * 60);
  return ageMinutes <= thresholdMinutes ? 'online' : 'degraded';
}

function getTimestamp(row: Record<string, unknown>): string {
  return typeof row.timestamp === 'string' ? row.timestamp : new Date().toISOString();
}

function parseCompetition(rows: Record<string, unknown>[]): CompetitionLogRow[] {
  return rows
    .filter((row) => row.message === '[REINFORCEMENT_COMPETITION]')
    .map((row) => ({
      timestamp: getTimestamp(row),
      winner: String(row.winner ?? 'unknown'),
      losers: Array.isArray(row.losers)
        ? (row.losers as Array<Record<string, unknown>>).map((l) => ({
            source: String(l.source ?? 'unknown'),
            reason: String(l.reason ?? 'unknown'),
            effectiveModifier: toNumber(l.effectiveModifier),
          }))
        : [],
      adjustedConfidence: toNumber(row.adjustedConfidence),
    }))
    .slice(-20)
    .reverse();
}

function parseDecisions(rows: Record<string, unknown>[]): DecisionLogRow[] {
  return rows
    .filter((row) => row.message === '[REINFORCEMENT_DECISION]')
    .map((row) => ({
      timestamp: getTimestamp(row),
      strategy: String(row.strategy ?? 'unknown'),
      source: String(row.source ?? 'unknown'),
      effectiveModifier: toNumber(row.effectiveModifier),
      recencyWeight: toNumber(row.recencyWeight),
      sampleWeight: toNumber(row.sampleWeight),
      decision: String(row.decision ?? ''),
    }))
    .slice(-20)
    .reverse();
}

function parseTelegramModes(rows: Record<string, unknown>[]): TelegramModeRow[] {
  return rows
    .filter((row) => row.message === '[TELEGRAM_MODE]')
    .map((row) => ({
      timestamp: getTimestamp(row),
      mode: String(row.mode ?? 'production'),
      isTest: Boolean(row.isTest),
      showTestLabel: Boolean(row.showTestLabel),
      reason: typeof row.reason === 'string' ? row.reason : undefined,
    }))
    .slice(-20)
    .reverse();
}

async function detectDeploymentBlockers(): Promise<{ blockers: string[]; details: Array<{ check: string; found: boolean; status: 'READY' | 'NOT READY' | 'BLOCKED'; note: string }> }> {
  const root = process.cwd();
  const filesToScan = [
    path.join(root, 'src', 'index.ts'),
    path.join(root, 'src', 'scanner', 'index.ts'),
    path.join(root, 'src', 'tracking', 'monitor.ts'),
    path.join(root, 'src', 'ops', 'retryQueue.ts'),
    path.join(root, 'src', 'workers', 'opsWorker.ts'),
  ];

  const textByFile: string[] = [];
  for (const file of filesToScan) {
    try {
      textByFile.push(await fs.readFile(file, 'utf8'));
    } catch {
      textByFile.push('');
    }
  }

  const full = textByFile.join('\n');

  const checks = [
    {
      check: 'setInterval',
      found: /setInterval\s*\(/.test(full),
      note: 'Detected interval-based loops. Will stop on Vercel.',
    },
    {
      check: 'long-running process',
      found: /startApiServer\(|scannerWorker|paperWorker|opsWorker/.test(full),
      note: 'Detected persistent process workers. Will stop on Vercel.',
    },
    {
      check: 'local cron',
      found: /cron|schedule|interval/i.test(full),
      note: 'Detected local scheduler patterns. Will stop on Vercel.',
    },
    {
      check: 'in-memory jobs',
      found: /new\s+RetryQueue\(|RetryQueue\(/.test(full),
      note: 'Detected in-memory retry queue/jobs. Will stop on Vercel.',
    },
  ];

  const blockers = checks.filter((c) => c.found).map((c) => c.note);
  return {
    blockers,
    details: checks.map((c) => ({
      check: c.check,
      found: c.found,
      status: c.found ? 'BLOCKED' : 'READY',
      note: c.found ? c.note : 'No blocking pattern found.',
    })),
  };
}

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const db = getDbClient();
  const [activeSignals, outcomes, perf, strategyLearning, contextLearning, marketRegimeLearning, signalAuditRows] = await Promise.all([
    getActiveTradeIdeas(),
    getSignalExecutionOutcomes(5000),
    getPerformanceOverview(),
    db.from('strategy_learning').select('*').order('last_updated', { ascending: false }).limit(100),
    db.from('context_learning').select('*').order('last_updated', { ascending: false }).limit(150),
    db.from('market_regime_learning').select('*').order('last_updated', { ascending: false }).limit(150),
    db.from('signal_audit_log').select('*').order('created_at', { ascending: false }).limit(200),
  ]);

  const strategyRows = ((strategyLearning.data ?? []) as LearningRow[]);
  const contextRows = ((contextLearning.data ?? []) as LearningRow[]);
  const regimeRows = ((marketRegimeLearning.data ?? []) as LearningRow[]);
  const auditRows = (signalAuditRows.data ?? []) as Array<Record<string, unknown>>;

  const closed = outcomes.filter((row) => row.result !== 'OPEN');
  const winCount = closed.filter((row) => row.result === 'WIN').length;
  const lossCount = closed.filter((row) => row.result === 'LOSS').length;
  const totalPnL = round(closed.reduce((sum, row) => sum + toNumber(row.profit_percent), 0));
  const avgProfit = closed.length > 0 ? round(totalPnL / closed.length) : 0;

  const liveRows = activeSignals.slice(0, 50).map((row) => ({
    id: row.id,
    ticker: row.ticker,
    direction: row.direction,
    strategy: row.strategy_slug,
    confidence: row.confidence_score,
    status: row.status,
    profit: row.adaptive_confidence_adjustment ?? 0,
    created: row.created_at,
    durationMinutes: Math.max(0, Math.round((Date.now() - Date.parse(row.created_at)) / (1000 * 60))),
  }));

  const topStrategy = strategyRows.slice().sort((a, b) => b.win_rate - a.win_rate)[0] ?? null;
  const bestContext = contextRows.slice().sort((a, b) => b.win_rate - a.win_rate)[0] ?? null;
  const bestMarketRegime = regimeRows.slice().sort((a, b) => b.win_rate - a.win_rate)[0] ?? null;

  const mapLearning = (rows: LearningRow[]) => rows.slice(0, 40).map((row) => ({
    strategy: row.strategy_slug,
    ticker: row.ticker ?? null,
    timeframe: row.timeframe ?? null,
    direction: row.direction ?? null,
    marketRegime: row.market_regime ?? null,
    session: row.session ?? null,
    wins: row.wins,
    losses: row.losses,
    winRate: round(row.win_rate),
    modifier: round(row.confidence_modifier),
    recencyWeight: getRecencyWeight(row.last_updated),
    sampleWeight: getSampleWeight(row.trades),
    trades: row.trades,
    lastUpdated: row.last_updated,
  }));

  let cumulativeWins = 0;
  const winRateHistory = closed
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row, idx) => {
      if (row.result === 'WIN') cumulativeWins += 1;
      return {
        index: idx + 1,
        time: row.created_at,
        winRate: round((cumulativeWins / (idx + 1)) * 100),
      };
    });

  let cumulativePnL = 0;
  const pnlOverTime = closed
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row, idx) => {
      cumulativePnL += toNumber(row.profit_percent);
      return {
        index: idx + 1,
        time: row.created_at,
        pnl: round(cumulativePnL),
      };
    });

  const regimeAgg = new Map<string, { total: number; wins: number; pnl: number }>();
  const contextAgg = new Map<string, { total: number; wins: number; pnl: number }>();

  for (const row of closed) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const regime = String(metadata.market_regime ?? 'unknown');
    const session = String(metadata.session ?? 'unknown');
    const contextKey = `${row.strategy_slug}|${row.ticker}|${row.timeframe}|${session}`;

    if (!regimeAgg.has(regime)) regimeAgg.set(regime, { total: 0, wins: 0, pnl: 0 });
    if (!contextAgg.has(contextKey)) contextAgg.set(contextKey, { total: 0, wins: 0, pnl: 0 });

    const rg = regimeAgg.get(regime)!;
    rg.total += 1;
    rg.wins += row.result === 'WIN' ? 1 : 0;
    rg.pnl += toNumber(row.profit_percent);

    const cg = contextAgg.get(contextKey)!;
    cg.total += 1;
    cg.wins += row.result === 'WIN' ? 1 : 0;
    cg.pnl += toNumber(row.profit_percent);
  }

  const marketRegimePerformance = Array.from(regimeAgg.entries()).map(([regime, v]) => ({
    regime,
    trades: v.total,
    winRate: v.total > 0 ? round((v.wins / v.total) * 100) : 0,
    totalPnL: round(v.pnl),
  }));

  const contextPerformance = Array.from(contextAgg.entries())
    .map(([ctx, v]) => ({
      context: ctx,
      trades: v.total,
      winRate: v.total > 0 ? round((v.wins / v.total) * 100) : 0,
      totalPnL: round(v.pnl),
    }))
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 25);

  const combinedLogPath = path.resolve(process.cwd(), 'logs', 'combined.log');
  const errorLogPath = path.resolve(process.cwd(), 'logs', 'error.log');
  const combinedLines = await safeReadLogLines(combinedLogPath, 5000);
  const combinedJsonRows = parseJsonLines<Record<string, unknown>>(combinedLines);

  const competitionRows = parseCompetition(combinedJsonRows);
  const decisionRows = parseDecisions(combinedJsonRows);
  const telegramModes = parseTelegramModes(combinedJsonRows);

  const errorLines = await safeReadLogLines(errorLogPath, 1000);
  const telegramErrorCount = errorLines.filter((line) => line.toLowerCase().includes('telegram')).length;

  const sentSignals = auditRows.filter((row) => row.event_type === 'SENT').length;
  const failedSignals = auditRows.filter((row) => row.event_type === 'FAILED').length;
  const lastAudit = auditRows[0] ?? null;
  const pendingSignals = activeSignals.filter((row) => row.telegram_message_id === null && row.ai_decision === 'APPROVE').length;

  const deliveryHealth = sentSignals + failedSignals > 0
    ? round((sentSignals / (sentSignals + failedSignals)) * 100)
    : 100;

  const scannerHeartbeat = combinedJsonRows
    .filter((row) => String(row.component ?? '').includes('scanner'))
    .slice(-1)[0];
  const trackingHeartbeat = combinedJsonRows
    .filter((row) => String(row.component ?? '').includes('tracking'))
    .slice(-1)[0];
  const telegramHeartbeat = combinedJsonRows
    .filter((row) => String(row.component ?? '').includes('telegram'))
    .slice(-1)[0];
  const latestHeartbeat = combinedJsonRows.slice(-1)[0];

  let databaseStatus: 'online' | 'degraded' = 'online';
  try {
    await db.from('trade_ideas').select('id').limit(1);
  } catch {
    databaseStatus = 'degraded';
  }

  const deployment = await detectDeploymentBlockers();

  return {
    generatedAt: new Date().toISOString(),
    liveSignals: {
      activeSignals: activeSignals.length,
      closedSignals: closed.length,
      winRate: perf.winRate,
      totalPnL,
      avgProfit,
      profitFactor: perf.profitFactor,
      totalTrackedTrades: outcomes.length,
      rows: liveRows,
    },
    reinforcementIntelligence: {
      topStrategy,
      bestContext,
      bestMarketRegime,
      currentModifiers: {
        strategy: strategyRows.slice(0, 5).map((r) => ({ strategy: r.strategy_slug, modifier: round(r.confidence_modifier) })),
        context: contextRows.slice(0, 5).map((r) => ({ key: `${r.strategy_slug}:${r.ticker}:${r.timeframe}:${r.session}:${r.direction}`, modifier: round(r.confidence_modifier) })),
        marketRegime: regimeRows.slice(0, 5).map((r) => ({ key: `${r.strategy_slug}:${r.market_regime}:${r.session}`, modifier: round(r.confidence_modifier) })),
      },
      recentLearningUpdates: [...mapLearning(strategyRows), ...mapLearning(contextRows), ...mapLearning(regimeRows)]
        .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
        .slice(0, 20),
      strategyLearning: mapLearning(strategyRows),
      contextLearning: mapLearning(contextRows),
      marketRegimeLearning: mapLearning(regimeRows),
    },
    sourceCompetition: {
      priorityFlow: ['context_learning', 'market_regime_learning', 'strategy_learning'],
      competitions: competitionRows,
      decisions: decisionRows,
      latestWinner: competitionRows[0]?.winner ?? null,
    },
    signalPerformance: {
      winRateHistory,
      pnlOverTime,
      strategyBreakdown: perf.strategyBreakdown,
      marketRegimePerformance,
      contextPerformance,
    },
    telegramActivity: {
      signalsSent: sentSignals,
      errors: failedSignals + telegramErrorCount,
      lastMessage: lastAudit,
      deliveryHealth,
      pendingSignals,
      telegramModeLogs: telegramModes,
    },
    systemHealth: {
      scannerStatus: mapStatusFromHeartbeat(scannerHeartbeat ? getTimestamp(scannerHeartbeat) : null, 10),
      telegramStatus: mapStatusFromHeartbeat(telegramHeartbeat ? getTimestamp(telegramHeartbeat) : null, 20),
      databaseStatus,
      cronStatus: deployment.details.some((d) => d.check === 'local cron' && d.found) ? 'running-local-only' : 'ready',
      trackingStatus: mapStatusFromHeartbeat(trackingHeartbeat ? getTimestamp(trackingHeartbeat) : null, 20),
      heartbeat: latestHeartbeat ? getTimestamp(latestHeartbeat) : null,
    },
    deployment,
  };
}

export async function getDeploymentReadiness() {
  const overview = await getDashboardOverview();
  const blockers = overview.deployment.blockers;
  return {
    status: blockers.length > 0 ? 'BLOCKED' : 'READY',
    architecture: {
      web: 'Next.js dashboard + Fastify API',
      runtime: 'Long-running Node.js process',
      workers: ['scanner', 'tracking', 'ops retry queue'],
      database: 'Supabase Postgres',
    },
    explanation: {
      keepsBotAlive: 'Persistent process with loops/workers and in-memory state.',
      failsOnVercel: 'Serverless functions are ephemeral and cannot guarantee continuous loops.',
      serverlessSafe: ['read-only dashboard pages', 'on-demand API routes'],
      requiresWorkers: ['scanner loop', 'tracking loop', 'retry queue', 'scheduled jobs'],
    },
    blockers: overview.deployment.details,
    warnings: overview.deployment.blockers,
  };
}
