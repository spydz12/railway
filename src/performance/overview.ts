import { createComponentLogger } from '../utils/logger';
import { getSignalExecutionOutcomes, SignalExecutionOutcomeRow } from '../database/queries';

const log = createComponentLogger('analytics');

interface StrategyBreakdownRow {
  strategy: string;
  signals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfit: number;
  avgDuration: number;
  totalPnL: number;
}

interface RecentSignalRow {
  ticker: string;
  direction: string;
  strategy: string;
  result: string;
  profit_percent: number;
  duration_minutes: number;
  close_reason: string | null;
  created_at: string;
}

export interface PerformanceOverviewResponse {
  totalSignals: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  avgProfitPercent: number;
  avgDurationMinutes: number;
  bestStrategy: string | null;
  worstStrategy: string | null;
  mostUsedStrategy: string | null;
  totalPnL: number;
  profitFactor: number;
  averageRR: number;
  recentSignals: RecentSignalRow[];
  strategyBreakdown: StrategyBreakdownRow[];
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function round(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function getStrategyStats(outcomes: SignalExecutionOutcomeRow[]): StrategyBreakdownRow[] {
  const map = new Map<string, SignalExecutionOutcomeRow[]>();
  for (const row of outcomes) {
    const key = row.strategy_slug || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const rows: StrategyBreakdownRow[] = [];
  for (const [strategy, items] of map.entries()) {
    const signals = items.length;
    const wins = items.filter((item) => item.result === 'WIN').length;
    const losses = items.filter((item) => item.result === 'LOSS').length;
    const avgProfit = signals > 0
      ? round(items.reduce((sum, item) => sum + toNumber(item.profit_percent), 0) / signals)
      : 0;
    const avgDuration = signals > 0
      ? round(items.reduce((sum, item) => sum + toNumber(item.duration_minutes), 0) / signals)
      : 0;
    const totalPnL = round(items.reduce((sum, item) => sum + toNumber(item.profit_percent), 0));

    rows.push({
      strategy,
      signals,
      wins,
      losses,
      winRate: signals > 0 ? round((wins / signals) * 100) : 0,
      avgProfit,
      avgDuration,
      totalPnL,
    });
  }

  rows.sort((a, b) => b.signals - a.signals || b.winRate - a.winRate);
  return rows;
}

function pickBestStrategy(rows: StrategyBreakdownRow[]): string | null {
  const eligible = rows.filter((row) => row.signals >= 10);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.winRate - a.winRate || b.totalPnL - a.totalPnL);
  return eligible[0]?.strategy ?? null;
}

function pickWorstStrategy(rows: StrategyBreakdownRow[]): string | null {
  const eligible = rows.filter((row) => row.signals >= 10);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => a.winRate - b.winRate || a.totalPnL - b.totalPnL);
  return eligible[0]?.strategy ?? null;
}

function pickMostUsedStrategy(rows: StrategyBreakdownRow[]): string | null {
  if (rows.length === 0) return null;
  const sorted = rows.slice().sort((a, b) => b.signals - a.signals);
  return sorted[0]?.strategy ?? null;
}

export async function getPerformanceOverview(): Promise<PerformanceOverviewResponse> {
  const outcomes = await getSignalExecutionOutcomes(10000);
  const closed = outcomes.filter((row) => row.result !== 'OPEN');

  const totalSignals = closed.length;
  const totalWins = closed.filter((row) => row.result === 'WIN').length;
  const totalLosses = closed.filter((row) => row.result === 'LOSS').length;

  const totalPositivePnL = closed
    .filter((row) => toNumber(row.profit_percent) > 0)
    .reduce((sum, row) => sum + toNumber(row.profit_percent), 0);
  const totalNegativePnL = closed
    .filter((row) => toNumber(row.profit_percent) < 0)
    .reduce((sum, row) => sum + toNumber(row.profit_percent), 0);
  const totalPnL = round(totalPositivePnL + totalNegativePnL);

  const profitFactor = totalNegativePnL < 0
    ? round(totalPositivePnL / Math.abs(totalNegativePnL))
    : round(totalPositivePnL);

  const avgProfitPercent = totalSignals > 0
    ? round(closed.reduce((sum, row) => sum + toNumber(row.profit_percent), 0) / totalSignals)
    : 0;

  const durationRows = closed.filter((row) => typeof row.duration_minutes === 'number');
  const avgDurationMinutes = durationRows.length > 0
    ? round(durationRows.reduce((sum, row) => sum + toNumber(row.duration_minutes), 0) / durationRows.length)
    : 0;

  const strategyBreakdown = getStrategyStats(closed);
  const bestStrategy = pickBestStrategy(strategyBreakdown);
  const worstStrategy = pickWorstStrategy(strategyBreakdown);
  const mostUsedStrategy = pickMostUsedStrategy(strategyBreakdown);

  const avgWin = totalWins > 0 ? totalPositivePnL / totalWins : 0;
  const avgLoss = totalLosses > 0 ? Math.abs(totalNegativePnL) / totalLosses : 0;
  const averageRR = avgLoss > 0 ? round(avgWin / avgLoss) : 0;

  const recentSignals: RecentSignalRow[] = closed
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((row) => ({
      ticker: row.ticker,
      direction: row.direction,
      strategy: row.strategy_slug,
      result: row.result,
      profit_percent: round(toNumber(row.profit_percent)),
      duration_minutes: Math.round(toNumber(row.duration_minutes)),
      close_reason: row.close_reason,
      created_at: row.created_at,
    }));

  const overview: PerformanceOverviewResponse = {
    totalSignals,
    totalWins,
    totalLosses,
    winRate: totalSignals > 0 ? round((totalWins / totalSignals) * 100) : 0,
    avgProfitPercent,
    avgDurationMinutes,
    bestStrategy,
    worstStrategy,
    mostUsedStrategy,
    totalPnL,
    profitFactor,
    averageRR,
    recentSignals,
    strategyBreakdown,
  };

  log.info('[PERFORMANCE_OVERVIEW]', {
    totalSignals: overview.totalSignals,
    winRate: overview.winRate,
    bestStrategy: overview.bestStrategy,
  });

  log.info('[STRATEGY_ANALYTICS]', {
    strategyCount: strategyBreakdown.length,
    mostUsedStrategy: overview.mostUsedStrategy,
    topStrategy: strategyBreakdown[0]?.strategy ?? null,
  });

  return overview;
}
