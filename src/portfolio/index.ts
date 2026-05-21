import { config } from '../config';
import { calculateRiskProfile } from '../risk';
import { getActiveStocks, getRecentSignalPerformances, getRecentTradeIdeas } from '../database/queries';
import type { TradeIdea } from '../database/queries';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('portfolio');
const PORTFOLIO_COUNTED_STATUSES = new Set(['active', 'open', 'entered']);

export interface PortfolioExposure {
  totalActiveExposure: number;
  normalizedExposure: number;
  stockExposure: number;
  cryptoExposure: number;
  cryptoAllocation: number;
  stockAllocation: number;
  sectorExposure: Record<string, number>;
  regimeExposure: Record<string, number>;
  correlationClusters: Array<{ cluster: string; symbols: string[]; exposure: number }>;
  averageConfidence: number;
  portfolioRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  activeTradeCount: number;
}

export interface PositionSizingContext {
  strategy: string;
  marketRegime: string;
  marketType: 'stocks' | 'crypto';
  aiConfidence: number;
  fakeoutProbability: number;
  volatilityLevel: number;
  recentDrawdown: number;
  currentExposure: number;
}

export interface PositionSizingSuggestion {
  positionSizePct: number;
  targetRiskPct: number;
  maxPositionPct: number;
  reason: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function calculateIdeaExposure(idea: TradeIdea): number {
  const scoreWeight = (idea.confidence_score ?? 50) / 100;
  const rrWeight = Math.min(1, (idea.risk_reward_ratio ?? 1) / 4);
  return clamp(scoreWeight * 0.65 + rrWeight * 0.35, 0.1, 1.0);
}

function calculatePortfolioRiskLevel(snapshot: PortfolioExposure): 'LOW' | 'MEDIUM' | 'HIGH' {
  const score = snapshot.normalizedExposure * 0.6 +
    (Math.max(...Object.values(snapshot.sectorExposure), 0) / 100) * 0.25 +
    (snapshot.correlationClusters.length >= config.portfolio.correlatedTradeLimit ? 0.25 : 0);

  if (score >= 0.85) return 'HIGH';
  if (score >= 0.55) return 'MEDIUM';
  return 'LOW';
}

function normalizeSectorName(sector: string | null | undefined): string {
  if (!sector) return 'Unknown';
  return sector.trim() === '' ? 'Unknown' : sector;
}

export async function getPortfolioSnapshot(): Promise<PortfolioExposure> {
  const recentIdeas = await getRecentTradeIdeas(2000);
  const countedIdeas = recentIdeas.filter((idea) => PORTFOLIO_COUNTED_STATUSES.has(String(idea.status || '').toLowerCase()));
  const observedStatuses = Array.from(new Set(recentIdeas.map((idea) => String(idea.status || '').toLowerCase())));

  log.info('[PORTFOLIO_EXPOSURE]', {
    countedStatuses: Array.from(PORTFOLIO_COUNTED_STATUSES),
    observedStatuses,
    totalFetchedIdeas: recentIdeas.length,
    countedIdeas: countedIdeas.length,
  });

  const stocks = await getActiveStocks();
  const stockMap = new Map<string, string>(stocks.map((stock) => [stock.ticker, normalizeSectorName(stock.sector)]));

  let totalExposure = 0;
  let stockExposure = 0;
  let cryptoExposure = 0;
  let confidenceSum = 0;
  const sectorExposure: Record<string, number> = {};
  const regimeExposure: Record<string, number> = {};
  const clusterMap = new Map<string, { symbols: string[]; exposure: number }>();

  countedIdeas.forEach((idea) => {
    const exposure = calculateIdeaExposure(idea);
    totalExposure += exposure;
    confidenceSum += idea.confidence_score ?? 0;
    if (idea.market_type === 'crypto') {
      cryptoExposure += exposure;
    } else {
      stockExposure += exposure;
    }

    const sector = idea.market_type === 'crypto' ? 'Crypto' : stockMap.get(idea.ticker) ?? 'Unknown';
    sectorExposure[sector] = (sectorExposure[sector] ?? 0) + exposure;

    const regime = idea.market_condition ?? 'neutral';
    regimeExposure[regime] = (regimeExposure[regime] ?? 0) + exposure;

    const clusterKey = `${idea.market_condition || 'neutral'}|${idea.direction}|${idea.market_type}`;
    const cluster = clusterMap.get(clusterKey) ?? { symbols: [], exposure: 0 };
    if (!cluster.symbols.includes(idea.ticker)) {
      cluster.symbols.push(idea.ticker);
    }
    cluster.exposure += exposure;
    clusterMap.set(clusterKey, cluster);
  });

  const totalWeight = Math.max(1, Math.abs(totalExposure));
  const normalizedExposure = clamp(totalExposure / config.portfolio.targetExposureScore, 0, 2);

  const correlationClusters = Array.from(clusterMap.entries())
    .filter(([, cluster]) => cluster.symbols.length > 1)
    .map(([cluster, value]) => ({ cluster, symbols: value.symbols, exposure: clamp(value.exposure, 0, 10) }))
    .sort((a, b) => b.exposure - a.exposure);

  const snapshot: PortfolioExposure = {
    totalActiveExposure: Number(totalExposure.toFixed(2)),
    normalizedExposure: Number(normalizedExposure.toFixed(2)),
    stockExposure: Number(stockExposure.toFixed(2)),
    cryptoExposure: Number(cryptoExposure.toFixed(2)),
    cryptoAllocation: Number((cryptoExposure / Math.max(1, totalExposure) * 100).toFixed(1)),
    stockAllocation: Number((stockExposure / Math.max(1, totalExposure) * 100).toFixed(1)),
    sectorExposure,
    regimeExposure,
    correlationClusters,
    averageConfidence: countedIdeas.length > 0 ? Number((confidenceSum / countedIdeas.length).toFixed(1)) : 0,
    portfolioRiskLevel: 'LOW',
    activeTradeCount: countedIdeas.length,
  };

  snapshot.portfolioRiskLevel = calculatePortfolioRiskLevel(snapshot);
  return snapshot;
}

export async function suggestPositionSizing(
  context: PositionSizingContext
): Promise<PositionSizingSuggestion> {
  const snapshot = await getPortfolioSnapshot();
  const baseSize = config.risk.maxRiskPerTradePct;
  const confidenceBand = clamp(0.85 + (context.aiConfidence / 100) * 0.25, 0.5, 1.25);
  const fakeoutPenalty = clamp(1 - context.fakeoutProbability / 200, 0.65, 1);
  const drawdownPenalty = clamp(1 - context.recentDrawdown / 50, 0.65, 1);
  const volatilityPenalty = clamp(1 - context.volatilityLevel / 10, 0.65, 1);

  const regimeMultiplier = context.marketRegime === 'volatile'
    ? 0.85
    : context.marketRegime === 'ranging'
      ? 0.95
      : 1.0;

  const exposureAdjustment = snapshot.normalizedExposure > 1
    ? 0.75
    : 1.0;

  const size = clamp(
    baseSize * confidenceBand * fakeoutPenalty * drawdownPenalty * volatilityPenalty * regimeMultiplier * exposureAdjustment,
    baseSize * 0.25,
    baseSize
  );

  const reasonParts = [
    `Base ${baseSize}%`,
    `AI confidence ${context.aiConfidence}%`,
    `Market regime ${context.marketRegime}`,
    `Fakeout penalty ${Math.round((1 - fakeoutPenalty) * 100)}%`,
    `Drawdown penalty ${Math.round((1 - drawdownPenalty) * 100)}%`,
    `Exposure adj ${Math.round(exposureAdjustment * 100)}%`,
  ];

  return {
    positionSizePct: Number(size.toFixed(2)),
    targetRiskPct: Number(clamp(baseSize * 0.8, 0.1, baseSize).toFixed(2)),
    maxPositionPct: baseSize,
    reason: reasonParts.join(', '),
  };
}
