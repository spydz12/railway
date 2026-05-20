import { getRecentSignalPerformances } from '../database/queries';
import { config } from '../config';

export interface RiskGuardResult {
  pauseTrading: boolean;
  confidenceModifier: number;
  positionModifier: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  consecutiveLosses: number;
  estimatedDrawdownPct: number;
  reason: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function calculateConsecutiveLosses(records: Array<{ win_loss: boolean }>): number {
  let count = 0;
  for (const record of records) {
    if (!record.win_loss) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

function calculateEstimatedDrawdown(records: Array<{ win_loss: boolean; entry: number; stop_loss: number; take_profit: number | null }>): number {
  if (records.length === 0) return 0;
  const consecutiveLosses = calculateConsecutiveLosses(records);
  const averageRisk = records.reduce((sum, record) => sum + Math.abs(record.entry - record.stop_loss), 0) / Math.max(1, records.length);
  return Number(clamp(consecutiveLosses * averageRisk * 100 / Math.max(1, records[0].entry || 1), 0, 100).toFixed(1));
}

function calculateLossRate(records: Array<{ win_loss: boolean }>): number {
  if (records.length === 0) return 0;
  return records.filter((record) => !record.win_loss).length / records.length;
}

export async function evaluateRiskGuard(): Promise<RiskGuardResult> {
  const recentRecords = await getRecentSignalPerformances('all', 50).catch(() => [] as any[]);
  const normalizedRecords = Array.isArray(recentRecords) ? recentRecords : [];

  const consecutiveLosses = calculateConsecutiveLosses(normalizedRecords);
  const estimatedDrawdownPct = calculateEstimatedDrawdown(normalizedRecords);
  const lossRate = calculateLossRate(normalizedRecords);

  let confidenceModifier = 1;
  let positionModifier = 1;
  let pauseTrading = false;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  const reasons: string[] = [];

  if (consecutiveLosses >= config.riskGuard.consecutiveLossLimit) {
    confidenceModifier *= 0.85;
    positionModifier *= 0.8;
    riskLevel = 'MEDIUM';
    reasons.push(`Consecutive losses ${consecutiveLosses}`);
  }

  if (estimatedDrawdownPct >= config.riskGuard.drawdownThresholdPct) {
    confidenceModifier *= 0.8;
    positionModifier *= 0.75;
    riskLevel = 'MEDIUM';
    reasons.push(`Drawdown ${estimatedDrawdownPct}%`);
  }

  if (lossRate > 0.5) {
    confidenceModifier *= 0.85;
    positionModifier *= 0.8;
    riskLevel = 'HIGH';
    reasons.push(`Loss rate ${Math.round(lossRate * 100)}%`);
  }

  if (estimatedDrawdownPct >= config.riskGuard.pauseDrawdownPct && lossRate > 0.45) {
    pauseTrading = true;
    riskLevel = 'HIGH';
    reasons.push('Pause triggered by drawdown');
  }

  if (riskLevel === 'LOW' && reasons.length > 0) {
    riskLevel = 'MEDIUM';
  }

  return {
    pauseTrading,
    confidenceModifier: Number(clamp(confidenceModifier, 0.5, 1.0).toFixed(2)),
    positionModifier: Number(clamp(positionModifier, 0.5, 1.0).toFixed(2)),
    riskLevel,
    consecutiveLosses,
    estimatedDrawdownPct,
    reason: reasons.length > 0 ? reasons.join(', ') : 'Normal trading conditions',
  };
}
