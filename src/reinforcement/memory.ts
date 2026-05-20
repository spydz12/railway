import { getRecentSignalPerformances } from '../database/queries';

export interface ReinforcementCluster {
  strategy: string;
  marketRegime: string;
  marketType: 'stocks' | 'crypto';
  totalTrades: number;
  winRate: number;
  averageRR: number;
  profitFactor: number;
}

export interface ReinforcementAnalytics {
  strategy: string;
  marketType: 'stocks' | 'crypto';
  totalTrades: number;
  winRate: number;
  averageRR: number;
  profitFactor: number;
  reinforcementScore: number;
  aiApprovalAccuracy: number;
  aiRejectAccuracy: number;
}

export interface PriorTradeOutcome {
  symbol: string;
  outcome: string;
  win_loss: boolean;
  ai_decision: string | null;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function calculateProfitFactor(records: Array<{ win_loss: boolean; entry: number; stop_loss: number; take_profit: number | null }>): number {
  const wins = records.filter((record) => record.win_loss);
  const losses = records.filter((record) => !record.win_loss);
  const grossWin = wins.reduce((sum, record) => sum + Math.abs(record.take_profit ? record.take_profit - record.entry : 0), 0);
  const grossLoss = losses.reduce((sum, record) => sum + Math.abs(record.entry - record.stop_loss), 0);
  return grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? Number(grossWin.toFixed(2)) : 0;
}

function calculateAverageRR(records: Array<{ entry: number; stop_loss: number; take_profit: number | null }>): number {
  if (records.length === 0) return 0;
  const values = records.map((record) => {
    const risk = Math.abs(record.entry - record.stop_loss);
    const reward = record.take_profit ? Math.abs(record.take_profit - record.entry) : 0;
    return risk > 0 ? reward / risk : 0;
  });
  return Number((values.reduce((sum, rr) => sum + rr, 0) / values.length).toFixed(2));
}

export async function getReinforcementScore(
  strategy: string,
  marketRegime: string,
  marketType: 'stocks' | 'crypto'
): Promise<number> {
  const records = await getRecentSignalPerformances(strategy, 100);
  const filtered = records.filter((record) => record.market_regime === marketRegime && record.market_type === marketType);
  if (filtered.length === 0) return 50;

  const winRate = filtered.filter((record) => record.win_loss).length / filtered.length;
  const averageRR = calculateAverageRR(filtered);
  const profitFactor = calculateProfitFactor(filtered);
  const score = clamp(
    winRate * 50 + averageRR * 10 + profitFactor * 10 - (1 - winRate) * 20,
    0,
    100
  );
  return Number(score.toFixed(1));
}

export async function getReinforcementAnalytics(): Promise<ReinforcementAnalytics[]> {
  const records = await getRecentSignalPerformances('all', 1000).catch(() => [] as any[]);
  const normalized = Array.isArray(records) ? records : [];

  const groups = new Map<string, typeof normalized>();
  normalized.forEach((record) => {
    const key = `${record.strategy}|${record.market_regime || 'unknown'}|${record.market_type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  });

  const analytics: ReinforcementAnalytics[] = [];
  groups.forEach((records, key) => {
    const [strategy, marketRegime, marketType] = key.split('|') as [string, string, 'stocks' | 'crypto'];
    const totalTrades = records.length;
    const winRate = totalTrades > 0 ? records.filter((record) => record.win_loss).length / totalTrades : 0;
    const averageRR = calculateAverageRR(records);
    const profitFactor = calculateProfitFactor(records);
    const approved = records.filter((record) => record.ai_decision === 'APPROVE');
    const rejected = records.filter((record) => record.ai_decision === 'REJECT');
    const aiApprovalAccuracy = approved.length > 0 ? approved.filter((record) => record.win_loss).length / approved.length : 0;
    const aiRejectAccuracy = rejected.length > 0 ? rejected.filter((record) => !record.win_loss).length / rejected.length : 0;
    const reinforcementScore = clamp(winRate * 50 + averageRR * 10 + profitFactor * 10 + aiApprovalAccuracy * 10 - (1 - winRate) * 5, 0, 100);

    analytics.push({
      strategy,
      marketType,
      totalTrades,
      winRate: Number((winRate * 100).toFixed(1)),
      averageRR,
      profitFactor,
      reinforcementScore: Number(reinforcementScore.toFixed(1)),
      aiApprovalAccuracy: Number((aiApprovalAccuracy * 100).toFixed(1)),
      aiRejectAccuracy: Number((aiRejectAccuracy * 100).toFixed(1)),
    });
  });

  return analytics.sort((a, b) => b.reinforcementScore - a.reinforcementScore);
}

export async function getPriorSimilarOutcomes(
  strategy: string,
  marketRegime: string,
  marketType: 'stocks' | 'crypto',
  limit = 3
): Promise<PriorTradeOutcome[]> {
  const records = await getRecentSignalPerformances(strategy, 100);
  return records
    .filter((record) => record.market_regime === marketRegime && record.market_type === marketType)
    .slice(0, limit)
    .map((record) => ({
      symbol: record.symbol,
      outcome: record.outcome,
      win_loss: record.win_loss,
      ai_decision: record.ai_decision,
    }));
}
