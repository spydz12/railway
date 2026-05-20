import { getAllSignalPerformances, getRecentPaperPositions, getDefaultPaperAccount, getPaperEquitySnapshots } from '../database/queries';

interface LeaderboardRow {
  strategy: string;
  totalTrades: number;
  winRate: number;
  expectancy: number;
  avgHoldHours: number;
  sharpe: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

function toNum(value: number | null | undefined): number {
  return typeof value === 'number' ? value : 0;
}

function calcRollingWinRate(outcomes: boolean[], window = 20): Array<{ index: number; value: number }> {
  const result: Array<{ index: number; value: number }> = [];
  for (let i = 0; i < outcomes.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = outcomes.slice(start, i + 1);
    const wins = slice.filter(Boolean).length;
    result.push({ index: i + 1, value: slice.length > 0 ? Number(((wins / slice.length) * 100).toFixed(2)) : 0 });
  }
  return result;
}

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  return Number(((avg / stdev) * Math.sqrt(252)).toFixed(3));
}

function streaks(outcomes: boolean[]): { wins: number; losses: number } {
  let maxWins = 0;
  let maxLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const win of outcomes) {
    if (win) {
      currentWins += 1;
      currentLosses = 0;
      maxWins = Math.max(maxWins, currentWins);
    } else {
      currentLosses += 1;
      currentWins = 0;
      maxLosses = Math.max(maxLosses, currentLosses);
    }
  }

  return { wins: maxWins, losses: maxLosses };
}

export async function getPerformanceValidationAnalytics() {
  const performances = await getAllSignalPerformances(5000);

  const byStrategy = new Map<string, typeof performances>();
  for (const row of performances.slice().reverse()) {
    if (!byStrategy.has(row.strategy)) byStrategy.set(row.strategy, []);
    byStrategy.get(row.strategy)!.push(row);
  }

  const leaderboard: LeaderboardRow[] = Array.from(byStrategy.entries()).map(([strategy, rows]) => {
    const wins = rows.filter((row) => row.win_loss).length;
    const losses = rows.length - wins;
    const outcomes = rows.map((row) => row.win_loss);

    const returns = rows.map((row) => {
      const risk = Math.abs(row.entry - row.stop_loss);
      const reward = row.take_profit ? Math.abs(row.take_profit - row.entry) : 0;
      if (risk <= 0) return 0;
      return row.win_loss ? reward / risk : -1;
    });

    const avgWin = returns.filter((x) => x > 0).reduce((s, v) => s + v, 0) / Math.max(1, wins);
    const avgLoss = Math.abs(returns.filter((x) => x <= 0).reduce((s, v) => s + v, 0) / Math.max(1, losses));
    const winProb = wins / Math.max(1, rows.length);
    const expectancy = winProb * avgWin - (1 - winProb) * avgLoss;
    const avgHold = rows.reduce((sum, row) => sum + toNum(row.duration_hours), 0) / Math.max(1, rows.length);
    const sharpe = calcSharpe(returns);
    const streak = streaks(outcomes);

    return {
      strategy,
      totalTrades: rows.length,
      winRate: Number((winProb * 100).toFixed(2)),
      expectancy: Number(expectancy.toFixed(4)),
      avgHoldHours: Number(avgHold.toFixed(3)),
      sharpe,
      maxConsecutiveWins: streak.wins,
      maxConsecutiveLosses: streak.losses,
    };
  }).sort((a, b) => b.expectancy - a.expectancy);

  const monthlyMap = new Map<string, number>();
  for (const row of performances) {
    const month = row.created_at.slice(0, 7);
    const risk = Math.abs(row.entry - row.stop_loss);
    const reward = row.take_profit ? Math.abs(row.take_profit - row.entry) : 0;
    const pnl = risk > 0 ? (row.win_loss ? reward / risk : -1) : 0;
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + pnl);
  }
  const monthlyReturns = Array.from(monthlyMap.entries())
    .map(([month, value]) => ({ month, value: Number(value.toFixed(3)) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const outcomes = performances.slice().reverse().map((row) => row.win_loss);
  const rollingWinRate = calcRollingWinRate(outcomes, 20);

  const rollingSharpe = performances.slice().reverse().map((_, index, arr) => {
    const start = Math.max(0, index - 29);
    const windowRows = arr.slice(start, index + 1);
    const returns = windowRows.map((row) => {
      const risk = Math.abs(row.entry - row.stop_loss);
      const reward = row.take_profit ? Math.abs(row.take_profit - row.entry) : 0;
      return risk > 0 ? (row.win_loss ? reward / risk : -1) : 0;
    });

    return {
      index: index + 1,
      value: calcSharpe(returns),
    };
  });

  return {
    leaderboard,
    monthlyReturns,
    rollingWinRate,
    rollingSharpe,
  };
}

export async function getSignalQualityValidationAnalytics() {
  const performances = await getAllSignalPerformances(5000);

  const approved = performances.filter((row) => row.ai_decision === 'APPROVE');
  const rejected = performances.filter((row) => row.ai_decision === 'REJECT');
  const watched = performances.filter((row) => row.ai_decision === 'WATCH');
  const fakeBreakout = performances.filter((row) => (row.fakeout_confidence ?? 0) >= 50);

  const byRegime = new Map<string, { total: number; wins: number }>();
  for (const row of performances) {
    const regime = row.market_regime ?? 'unknown';
    const current = byRegime.get(regime) ?? { total: 0, wins: 0 };
    current.total += 1;
    if (row.win_loss) current.wins += 1;
    byRegime.set(regime, current);
  }

  const regimeSpecificPerformance = Array.from(byRegime.entries()).map(([regime, stat]) => ({
    regime,
    totalTrades: stat.total,
    winRate: stat.total > 0 ? Number(((stat.wins / stat.total) * 100).toFixed(2)) : 0,
  }));

  return {
    aiApprovedWinRate: approved.length > 0 ? Number(((approved.filter((row) => row.win_loss).length / approved.length) * 100).toFixed(2)) : 0,
    aiRejectedMissedOpportunityRate: rejected.length > 0 ? Number(((rejected.filter((row) => row.win_loss).length / rejected.length) * 100).toFixed(2)) : 0,
    watchConversionRate: watched.length > 0 ? Number(((watched.filter((row) => row.win_loss).length / watched.length) * 100).toFixed(2)) : 0,
    fakeBreakoutPredictionAccuracy: fakeBreakout.length > 0 ? Number(((fakeBreakout.filter((row) => !row.win_loss).length / fakeBreakout.length) * 100).toFixed(2)) : 0,
    regimeSpecificPerformance,
  };
}

export async function getPaperTradingAnalytics() {
  const account = await getDefaultPaperAccount();
  if (!account) {
    return {
      balance: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      equityCurve: [],
      positions: [],
    };
  }

  const [positions, snapshots] = await Promise.all([
    getRecentPaperPositions(500),
    getPaperEquitySnapshots(account.id, 1500),
  ]);

  const equityCurve = snapshots.map((row) => ({
    recordedAt: row.recorded_at,
    equity: Number(row.equity.toFixed(2)),
    balance: Number(row.balance.toFixed(2)),
  }));

  return {
    balance: account.current_balance,
    unrealizedPnl: account.unrealized_pnl,
    realizedPnl: account.realized_pnl,
    equityCurve,
    positions,
  };
}
