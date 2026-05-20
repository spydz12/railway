import { createComponentLogger } from '../utils/logger';
import { getAllSignalPerformances, getContextLearningModifierSource, getMarketRegimeLearningModifierSource, getRecentSignalPerformances, getStrategyLearningModifierSource, type SignalPerformance } from '../database/queries';
import { StrategyResult } from '../strategies/base';

const log = createComponentLogger('performance:strategy');

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface StrategyPerformanceSummary {
  strategy: string;
  totalTrades: number;
  winRate: number;
  averageRR: number;
  profitFactor: number;
  averageDurationHours: number;
  bestMarketRegime: string | null;
  worstMarketRegime: string | null;
  totalWins: number;
  totalLosses: number;
}

export interface MarketRegimePerformanceSummary {
  marketRegime: string;
  totalTrades: number;
  winRate: number;
  averageRR: number;
  averageAiConfidence: number;
}

export interface AIDecisionSummary {
  decision: string;
  count: number;
  averageConfidence: number;
}

export interface DrawdownAnalytics {
  totalTrades: number;
  consecutiveLosses: number;
  worstLosingStreak: number;
  lossRate: number;
  currentWinRate: number;
  estimatedDrawdownPct: number;
}

export interface AIPerformanceMetrics {
  totalAIReviewed: number;
  approveAccuracy: number;
  rejectAccuracy: number;
  watchConversionRate: number;
  falseRejectRate: number;
  fakeoutPredictionAccuracy: number;
}

export interface StrategyRegimePerformanceSummary {
  strategy: string;
  marketRegime: string;
  totalTrades: number;
  winRate: number;
  averageRR: number;
  profitFactor: number;
}

export interface ReinforcementContext {
  ticker: string;
  timeframe: string;
  session: string;
  direction: 'LONG' | 'SHORT';
  marketRegime?: string;
}

export async function adjustStrategyConfidence(
  strategy: string,
  regime: string,
  baseConfidence: number,
  context?: ReinforcementContext
): Promise<number> {
  let effectiveSourceInfo = await getStrategyLearningModifierSource(strategy);
  const _compStrategySource = effectiveSourceInfo;
  let _compContextSource: typeof effectiveSourceInfo | null = null;
  let _compRegimeSource: typeof effectiveSourceInfo | null = null;

  if (context) {
    const contextSource = await getContextLearningModifierSource({
      strategy_slug: strategy,
      ticker: context.ticker,
      timeframe: context.timeframe,
      session: context.session,
      direction: context.direction,
    });
    _compContextSource = contextSource;

    const isSourceStale = (src: typeof contextSource) =>
      src.source !== 'fallback' && (
        src.effectiveModifier === 0 ||
        src.recencyWeight <= 0.10 ||
        (src.trades != null && src.trades < 5)
      );

    if (contextSource.source !== 'fallback' && !isSourceStale(contextSource)) {
      effectiveSourceInfo = contextSource;
    } else {
      if (contextSource.source !== 'fallback' && isSourceStale(contextSource)) {
        log.info('[REINFORCEMENT_SOURCE_SKIPPED]', {
          source: contextSource.source,
          reason: 'stale',
          trades: contextSource.trades,
          recencyWeight: contextSource.recencyWeight,
          effectiveModifier: contextSource.effectiveModifier,
        });
      }

      if (context.marketRegime) {
        const marketRegimeSource = await getMarketRegimeLearningModifierSource({
          strategy_slug: strategy,
          ticker: context.ticker,
          timeframe: context.timeframe,
          direction: context.direction,
          market_regime: context.marketRegime,
          session: context.session,
        });
        _compRegimeSource = marketRegimeSource;
        if (marketRegimeSource.source !== 'fallback' && !isSourceStale(marketRegimeSource)) {
          effectiveSourceInfo = marketRegimeSource;
        } else {
          if (marketRegimeSource.source !== 'fallback' && isSourceStale(marketRegimeSource)) {
            log.info('[REINFORCEMENT_SOURCE_SKIPPED]', {
              source: marketRegimeSource.source,
              reason: 'stale',
              trades: marketRegimeSource.trades,
              recencyWeight: marketRegimeSource.recencyWeight,
              effectiveModifier: marketRegimeSource.effectiveModifier,
            });
          }
        }
      }
    }
  }
  const rawModifier = effectiveSourceInfo.rawModifier;
  const confidenceWeight = effectiveSourceInfo.confidenceWeight;
  const recencyWeight = effectiveSourceInfo.recencyWeight;
  const daysSinceUpdate = effectiveSourceInfo.daysSinceUpdate;
  const sampleWeightedModifier = effectiveSourceInfo.sampleWeightedModifier;
  const beforeRound = rawModifier * confidenceWeight * recencyWeight;
  const effectiveModifier = effectiveSourceInfo.effectiveModifier;
  const learningModifier = effectiveModifier;
  const reasonFromSource = effectiveSourceInfo.source === 'context_learning'
    ? 'contextLearning'
    : (effectiveSourceInfo.source === 'market_regime_learning'
      ? 'marketRegimeLearning'
    : (effectiveSourceInfo.source === 'strategy_learning'
      ? 'strategyLearning'
      : 'insufficientHistoryFallback'));

  const sourceStrategy = context
    ? `${strategy}:${context.ticker}:${context.timeframe}:${context.session}:${context.direction}`
    : strategy;

  const sourceSession = context ? context.session : null;

  const sourceDirection = context ? context.direction : null;

  const sourceMarketRegime = context?.marketRegime ?? null;

  const sourceTicker = context ? context.ticker : null;

  const sourceTimeframe = context ? context.timeframe : null;

  const sourceTag = context ? 'context' : 'strategy';

  const sourceForRecords = strategy;

  const sourceForLog = effectiveSourceInfo;

  const sourceName = sourceForLog.source;

  const sourceTrades = sourceForLog.trades;

  const sourceWinRate = sourceForLog.winRate;

  const sourceRowFound = sourceForLog.strategyRowFound;

  const sourceModifier = sourceForLog.modifier;

  const sourceContext = {
    sourceTag,
    sourceStrategy,
    sourceTicker,
    sourceTimeframe,
    sourceSession,
    sourceDirection,
    sourceMarketRegime,
  };

  const sourceFields = {
    source: sourceName,
    strategyRowFound: sourceRowFound,
    trades: sourceTrades,
    winRate: sourceWinRate,
    modifier: sourceModifier,
    rawModifier,
    confidenceWeight,
    recencyWeight,
    daysSinceUpdate,
    sampleWeightedModifier,
    effectiveModifier,
    ...sourceContext,
  };

  function buildDecision(src: string, trades: number | null, rw: number, em: number, hasContext: boolean): string {
    if (src === 'context_learning') {
      const reasons = [
        'source fresh',
        trades != null && trades >= 5 ? 'trades >= 5' : null,
        rw > 0.10 ? 'recency valid' : null,
        em > 0 ? 'effective modifier > 0' : null,
        'higher priority than market regime',
      ].filter(Boolean) as string[];
      return `Context source selected because: ${reasons.map((r) => `- ${r}`).join(', ')}`;
    }
    if (src === 'market_regime_learning') {
      return hasContext
        ? 'Market regime source selected because: - context_learning was stale or missing, - regime row is fresh and effective'
        : 'Market regime source selected because: - no context key provided, - regime row is fresh and effective';
    }
    if (src === 'strategy_learning') {
      return 'Strategy source selected because: - context and regime sources were stale, missing, or not provided';
    }
    return 'Fallback: no learning source available';
  }

  const _competitionData = await (async () => {
    let regimeComp = _compRegimeSource;
    if (regimeComp === null && context?.marketRegime) {
      regimeComp = await getMarketRegimeLearningModifierSource({
        strategy_slug: strategy,
        ticker: context.ticker,
        timeframe: context.timeframe,
        direction: context.direction,
        market_regime: context.marketRegime,
        session: context.session,
      });
    }
    const classifyReason = (src: typeof effectiveSourceInfo): 'stale' | 'no_row' | 'lower_priority' => {
      if (src.source === 'fallback') return 'no_row';
      if (src.effectiveModifier === 0 || src.recencyWeight <= 0.10 || (src.trades != null && src.trades < 5)) return 'stale';
      return 'lower_priority';
    };
    const candidates: Array<{ name: string; src: typeof effectiveSourceInfo | null }> = [
      { name: 'strategy_learning', src: _compStrategySource },
      { name: 'context_learning', src: _compContextSource },
      { name: 'market_regime_learning', src: regimeComp },
    ];
    const losers = candidates
      .filter((c) => c.src !== null && c.src.source !== sourceName)
      .map((c) => ({
        source: c.src!.source === 'fallback' ? c.name : c.src!.source,
        reason: classifyReason(c.src!),
        effectiveModifier: c.src!.effectiveModifier,
      }));
    return { winner: sourceName, losers };
  })();

  log.info('[SAMPLE_WEIGHT_APPLIED]', {
    strategy,
    trades: sourceTrades,
    rawModifier,
    confidenceWeight,
    effectiveModifier,
  });

  log.info('[RECENCY_WEIGHT_APPLIED]', {
    strategy,
    daysSinceUpdate,
    recencyWeight,
    rawModifier,
    sampleWeightedModifier,
    effectiveModifier,
  });

  const records = await getRecentSignalPerformances(sourceForRecords, 100);
  if (records.length < 5) {
    const adjustedEarly = clamp(baseConfidence + learningModifier, 0, 100);
    if (sourceName === 'market_regime_learning') {
      log.info('[MARKET_REGIME_SOURCE]', {
        strategy,
        marketRegime: sourceMarketRegime,
        session: sourceSession,
        wins: sourceTrades != null && sourceWinRate != null ? Math.round((sourceTrades * sourceWinRate) / 100) : null,
        losses: sourceTrades != null && sourceWinRate != null ? sourceTrades - Math.round((sourceTrades * sourceWinRate) / 100) : null,
        modifier: learningModifier,
        adjustedConfidence: adjustedEarly,
      });
      log.info('[MARKET_REGIME_REINFORCEMENT]', {
        baseConfidence,
        modifier: learningModifier,
        source: sourceName,
        adjustedConfidence: adjustedEarly,
      });
    }
    log.info('[REINFORCEMENT_PIPELINE]', {
      strategy,
      rawModifier,
      sampleWeight: confidenceWeight,
      sampleWeightedModifier,
      recencyWeight,
      beforeRound,
      effectiveModifier,
      baseConfidence,
      adjustedConfidence: adjustedEarly,
      source: sourceName,
      formula: `${rawModifier} x ${confidenceWeight} x ${recencyWeight} = ${beforeRound} -> round(${effectiveModifier})`,
    });
    log.info('[REINFORCEMENT_SOURCE]', {
      strategy,
      ...sourceFields,
      adjustedConfidence: adjustedEarly,
    });
    log.info('[REINFORCEMENT_APPLIED]', {
      strategy,
      baseConfidence,
      modifier: learningModifier,
      adjustedConfidence: adjustedEarly,
      reason: reasonFromSource,
    });
    if (context) {
      log.info('[CONTEXT_REINFORCEMENT_APPLIED]', {
        strategy,
        ticker: context.ticker,
        timeframe: context.timeframe,
        session: context.session,
        direction: context.direction,
        baseConfidence,
        modifier: learningModifier,
        adjustedConfidence: adjustedEarly,
      });
    }
    log.info('[REINFORCEMENT_EFFECTIVE]', {
      baseConfidence,
      rawModifier,
      effectiveModifier,
      adjustedConfidence: adjustedEarly,
    });
    log.info('[REINFORCEMENT_FINAL]', {
      baseConfidence,
      rawModifier,
      sampleWeight: confidenceWeight,
      recencyWeight,
      effectiveModifier,
      adjustedConfidence: adjustedEarly,
    });
    log.info('[REINFORCEMENT_DECISION]', {
      strategy,
      source: sourceName,
      rawModifier,
      sampleWeight: confidenceWeight,
      recencyWeight,
      effectiveModifier,
      baseConfidence,
      adjustedConfidence: adjustedEarly,
      decision: buildDecision(sourceName, sourceTrades, recencyWeight, effectiveModifier, !!context),
    });
    log.info('[REINFORCEMENT_COMPETITION]', { ..._competitionData, adjustedConfidence: adjustedEarly });
    return adjustedEarly;
  }

  const regimeRecords = records.filter((record) => record.market_regime === regime);
  const referenceRecords = regimeRecords.length >= 5 ? regimeRecords : records;

  const winCount = referenceRecords.filter((record) => record.win_loss).length;
  const winRate = referenceRecords.length > 0 ? winCount / referenceRecords.length : 0;

  const rewards = referenceRecords.map((record) => {
    const risk = Math.abs(Number(record.entry) - Number(record.stop_loss));
    const reward = record.take_profit ? Math.abs(Number(record.take_profit) - Number(record.entry)) : 0;
    return risk > 0 ? reward / risk : 0;
  });

  const averageRR = rewards.length > 0 ? rewards.reduce((sum, rr) => sum + rr, 0) / rewards.length : 0;
  const profitFactor = calculateProfitFactor(referenceRecords);

  const winRateAdjustment = (winRate - 0.5) * 0.25;
  const rrAdjustment = (averageRR - 1.5) * 0.06;
  const profitAdjustment = (profitFactor - 1.2) * 0.03;

  const adjustment = Math.max(-0.18, Math.min(0.18, winRateAdjustment + rrAdjustment + profitAdjustment));
  const adjustedBase = baseConfidence * (1 + adjustment);
  const adjusted = clamp(adjustedBase + learningModifier, 0, 100);

  if (sourceName === 'market_regime_learning') {
    log.info('[MARKET_REGIME_SOURCE]', {
      strategy,
      marketRegime: sourceMarketRegime,
      session: sourceSession,
      wins: sourceTrades != null && sourceWinRate != null ? Math.round((sourceTrades * sourceWinRate) / 100) : null,
      losses: sourceTrades != null && sourceWinRate != null ? sourceTrades - Math.round((sourceTrades * sourceWinRate) / 100) : null,
      modifier: learningModifier,
      adjustedConfidence: adjusted,
    });
    log.info('[MARKET_REGIME_REINFORCEMENT]', {
      baseConfidence,
      modifier: learningModifier,
      source: sourceName,
      adjustedConfidence: adjusted,
    });
  }

  log.info('[REINFORCEMENT_PIPELINE]', {
    strategy,
    rawModifier,
    sampleWeight: confidenceWeight,
    sampleWeightedModifier,
    recencyWeight,
    beforeRound,
    effectiveModifier,
    baseConfidence,
    adjustedConfidence: adjusted,
    source: sourceName,
    formula: `${rawModifier} x ${confidenceWeight} x ${recencyWeight} = ${beforeRound} -> round(${effectiveModifier})`,
  });

  log.info('[REINFORCEMENT_SOURCE]', {
    strategy,
    ...sourceFields,
    adjustedConfidence: adjusted,
  });

  log.info('[REINFORCEMENT_APPLIED]', {
    strategy,
    baseConfidence,
    modifier: learningModifier,
    adjustedConfidence: adjusted,
    reason: reasonFromSource,
  });
  if (context) {
    log.info('[CONTEXT_REINFORCEMENT_APPLIED]', {
      strategy,
      ticker: context.ticker,
      timeframe: context.timeframe,
      session: context.session,
      direction: context.direction,
      baseConfidence,
      modifier: learningModifier,
      adjustedConfidence: adjusted,
    });
  }
  log.info('[REINFORCEMENT_EFFECTIVE]', {
    baseConfidence,
    rawModifier,
    effectiveModifier,
    adjustedConfidence: adjusted,
  });
  log.info('[REINFORCEMENT_FINAL]', {
    baseConfidence,
    rawModifier,
    sampleWeight: confidenceWeight,
    recencyWeight,
    effectiveModifier,
    adjustedConfidence: adjusted,
  });
  log.info('[REINFORCEMENT_DECISION]', {
    strategy,
    source: sourceName,
    rawModifier,
    sampleWeight: confidenceWeight,
    recencyWeight,
    effectiveModifier,
    baseConfidence,
    adjustedConfidence: adjusted,
    decision: buildDecision(sourceName, sourceTrades, recencyWeight, effectiveModifier, !!context),
  });  log.info('[REINFORCEMENT_COMPETITION]', { ..._competitionData, adjustedConfidence: adjusted });
  log.debug('[ADAPTIVE_WEIGHT]', {
    strategy,
    regime,
    baseConfidence,
    learningModifier,
    adjusted,
    winRate: winRate.toFixed(3),
    averageRR: averageRR.toFixed(3),
    profitFactor: profitFactor.toFixed(3),
    adjustment: adjustment.toFixed(3),
    sampleSize: referenceRecords.length,
  });

  return adjusted;
}

export async function getStrategyRegimePerformanceSummary(
  strategy: string,
  regime: string,
  limit = 50
): Promise<StrategyRegimePerformanceSummary | null> {
  const records = await getRecentSignalPerformances(strategy, limit);
  if (records.length === 0) return null;

  const regimeRecords = records.filter((record) => record.market_regime === regime);
  const referenceRecords = regimeRecords.length >= 5 ? regimeRecords : records;
  if (referenceRecords.length === 0) return null;

  const totalTrades = referenceRecords.length;
  const wins = referenceRecords.filter((record) => record.win_loss).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const averageRR = calculateAverageRR(referenceRecords);
  const profitFactor = calculateProfitFactor(referenceRecords);

  return {
    strategy,
    marketRegime: regime,
    totalTrades,
    winRate: Number(winRate.toFixed(1)),
    averageRR: Number(averageRR.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
  };
}

export async function getPerformanceAnalytics() {
  const records = await getAllSignalPerformances(1000);
  const totalSignals = records.length;
  const wins = records.filter((record) => record.win_loss).length;
  const losses = totalSignals - wins;
  const averageRR = calculateAverageRR(records);
  const bestStrategy = getBestStrategy(records);

  return {
    totalSignals,
    wins,
    losses,
    winRate: totalSignals > 0 ? (wins / totalSignals) * 100 : 0,
    averageRR,
    bestPerformingStrategy: bestStrategy,
  };
}

function getBestStrategy(records: SignalPerformance[]): string | null {
  if (records.length === 0) return null;

  const summary = new Map<string, {
    trades: number;
    wins: number;
    totalRewardRisk: number;
    profitFactorPositive: number;
    profitFactorNegative: number;
  }>();

  for (const record of records) {
    const strategy = record.strategy;
    if (!summary.has(strategy)) {
      summary.set(strategy, {
        trades: 0,
        wins: 0,
        totalRewardRisk: 0,
        profitFactorPositive: 0,
        profitFactorNegative: 0,
      });
    }

    const stats = summary.get(strategy)!;
    stats.trades += 1;
    if (record.win_loss) stats.wins += 1;

    const risk = Math.abs(Number(record.entry) - Number(record.stop_loss));
    const reward = record.take_profit ? Math.abs(Number(record.take_profit) - Number(record.entry)) : 0;
    if (risk > 0) {
      stats.totalRewardRisk += reward / risk;
    }
    if (record.win_loss) {
      stats.profitFactorPositive += reward;
    } else {
      stats.profitFactorNegative += risk;
    }
  }

  let best: string | null = null;
  let bestScore = -Infinity;

  for (const [strategy, stats] of summary.entries()) {
    const winRate = stats.trades > 0 ? stats.wins / stats.trades : 0;
    const averageRR = stats.trades > 0 ? stats.totalRewardRisk / stats.trades : 0;
    const profitFactor = stats.profitFactorNegative > 0 ? stats.profitFactorPositive / stats.profitFactorNegative : 0;
    const score = winRate * 100 + averageRR * 2 + profitFactor * 5;
    if (score > bestScore) {
      bestScore = score;
      best = strategy;
    }
  }

  return best;
}

export async function getStrategyPerformanceSummaries(): Promise<StrategyPerformanceSummary[]> {
  const records = await getAllSignalPerformances(1000);
  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.strategy;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(record);
  }

  const summaries: StrategyPerformanceSummary[] = [];
  grouped.forEach((strategyRecords, strategy) => {
    const totalTrades = strategyRecords.length;
    const totalWins = strategyRecords.filter((record) => record.win_loss).length;
    const totalLosses = totalTrades - totalWins;
    const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;
    const averageRR = calculateAverageRR(strategyRecords);
    const profitFactor = calculateProfitFactor(strategyRecords);
    const averageDurationHours = calculateAverageDurationHours(strategyRecords);
    const regimeStats = calculateRegimeStats(strategyRecords);
    summaries.push({
      strategy,
      totalTrades,
      winRate: Number((winRate * 100).toFixed(1)),
      averageRR: Number(averageRR.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      averageDurationHours: Number(averageDurationHours.toFixed(2)),
      bestMarketRegime: regimeStats.bestRegime,
      worstMarketRegime: regimeStats.worstRegime,
      totalWins,
      totalLosses,
    });
  });

  return summaries.sort((a, b) => b.winRate - a.winRate);
}

export async function getMarketRegimeAnalytics(): Promise<MarketRegimePerformanceSummary[]> {
  const records = await getAllSignalPerformances(1000);
  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.market_regime || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(record);
  }

  const summaries: MarketRegimePerformanceSummary[] = [];
  grouped.forEach((regimeRecords, marketRegime) => {
    const totalTrades = regimeRecords.length;
    const wins = regimeRecords.filter((record) => record.win_loss).length;
    const averageRR = calculateAverageRR(regimeRecords);
    const averageAiConfidence = regimeRecords.reduce((sum, record) => sum + (record.ai_confidence ?? 0), 0) / totalTrades;
    summaries.push({
      marketRegime,
      totalTrades,
      winRate: Number(((wins / totalTrades) * 100).toFixed(1)),
      averageRR: Number(averageRR.toFixed(2)),
      averageAiConfidence: Number(averageAiConfidence.toFixed(1)),
    });
  });

  return summaries.sort((a, b) => b.winRate - a.winRate);
}

export async function getAIDecisionAnalytics(): Promise<AIDecisionSummary[]> {
  const records = await getAllSignalPerformances(1000);
  const grouped = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.ai_decision || 'UNKNOWN';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(record);
  }

  const summaries: AIDecisionSummary[] = [];
  grouped.forEach((decisionRecords, decision) => {
    const count = decisionRecords.length;
    const averageConfidence = count > 0 ? decisionRecords.reduce((sum, record) => sum + (record.ai_confidence ?? 0), 0) / count : 0;
    summaries.push({ decision, count, averageConfidence: Number(averageConfidence.toFixed(1)) });
  });

  return summaries.sort((a, b) => b.count - a.count);
}

export async function getDrawdownAnalytics(): Promise<DrawdownAnalytics> {
  const records = await getAllSignalPerformances(1000);
  const totalTrades = records.length;
  const wins = records.filter((record) => record.win_loss).length;
  const lossRate = totalTrades > 0 ? (totalTrades - wins) / totalTrades : 0;

  let consecutiveLosses = 0;
  let currentStreak = 0;
  let worstLosingStreak = 0;
  for (const record of records) {
    if (!record.win_loss) {
      currentStreak += 1;
      worstLosingStreak = Math.max(worstLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  consecutiveLosses = currentStreak;

  const estimatedDrawdownPct = Number(clamp(lossRate * 100 + worstLosingStreak * 1.5, 0, 100).toFixed(1));

  return {
    totalTrades,
    consecutiveLosses,
    worstLosingStreak,
    lossRate: Number((lossRate * 100).toFixed(1)),
    currentWinRate: Number((wins / Math.max(1, totalTrades) * 100).toFixed(1)),
    estimatedDrawdownPct,
  };
}

export async function getAIPerformanceAnalytics(): Promise<AIPerformanceMetrics> {
  const records = await getAllSignalPerformances(1000);
  const approved = records.filter((record) => record.ai_decision === 'APPROVE');
  const rejected = records.filter((record) => record.ai_decision === 'REJECT');
  const watched = records.filter((record) => record.ai_decision === 'WATCH');

  const approveAccuracy = approved.length > 0 ? approved.filter((record) => record.win_loss).length / approved.length : 0;
  const rejectAccuracy = rejected.length > 0 ? rejected.filter((record) => !record.win_loss).length / rejected.length : 0;
  const watchConversionRate = watched.length > 0 ? watched.filter((record) => record.win_loss).length / watched.length : 0;
  const falseRejectRate = rejected.length > 0 ? rejected.filter((record) => record.win_loss).length / rejected.length : 0;
  const fakeoutPredictions = records.filter((record) => (record.fakeout_confidence ?? 0) >= 50);
  const fakeoutPredictionAccuracy = fakeoutPredictions.length > 0 ? fakeoutPredictions.filter((record) => !record.win_loss).length / fakeoutPredictions.length : 0;

  return {
    totalAIReviewed: records.filter((record) => record.ai_decision !== null).length,
    approveAccuracy: Number((approveAccuracy * 100).toFixed(1)),
    rejectAccuracy: Number((rejectAccuracy * 100).toFixed(1)),
    watchConversionRate: Number((watchConversionRate * 100).toFixed(1)),
    falseRejectRate: Number((falseRejectRate * 100).toFixed(1)),
    fakeoutPredictionAccuracy: Number((fakeoutPredictionAccuracy * 100).toFixed(1)),
  };
}

function calculateProfitFactor(records: Array<{ win_loss: boolean; entry: number; stop_loss: number; take_profit: number | null }>): number {
  const wins = records.filter((record) => record.win_loss);
  const losses = records.filter((record) => !record.win_loss);

  const grossWin = wins.reduce((sum, record) => {
    const risk = Math.abs(record.entry - record.stop_loss);
    const reward = record.take_profit ? Math.abs(record.take_profit - record.entry) : 0;
    return sum + (risk > 0 ? reward : 0);
  }, 0);

  const grossLoss = losses.reduce((sum, record) => {
    const risk = Math.abs(record.entry - record.stop_loss);
    return sum + (risk > 0 ? risk : 0);
  }, 0);

  return grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : 0;
}

function calculateAverageRR(records: Array<{ entry: number; stop_loss: number; take_profit: number | null }>): number {
  if (records.length === 0) return 0;
  const rrTotals = records.map((record) => {
    const risk = Math.abs(record.entry - record.stop_loss);
    const reward = record.take_profit ? Math.abs(record.take_profit - record.entry) : 0;
    return risk > 0 ? reward / risk : 0;
  });
  return rrTotals.reduce((sum, rr) => sum + rr, 0) / rrTotals.length;
}

function calculateAverageDurationHours(records: Array<{ duration_hours: number | null }>): number {
  const valid = records.filter((record) => typeof record.duration_hours === 'number' && record.duration_hours !== null) as Array<{ duration_hours: number }>;
  if (valid.length === 0) return 0;
  return valid.reduce((sum, record) => sum + record.duration_hours, 0) / valid.length;
}

function calculateRegimeStats(records: Array<{ market_regime: string | null; win_loss: boolean }>) {
  const grouped = new Map<string, { wins: number; total: number }>();
  for (const record of records) {
    const regime = record.market_regime || 'unknown';
    if (!grouped.has(regime)) grouped.set(regime, { wins: 0, total: 0 });
    const summary = grouped.get(regime)!;
    summary.total += 1;
    if (record.win_loss) summary.wins += 1;
  }

  let bestRegime: string | null = null;
  let worstRegime: string | null = null;
  let bestRate = -Infinity;
  let worstRate = Infinity;

  grouped.forEach((summary, regime) => {
    const winRate = summary.total > 0 ? summary.wins / summary.total : 0;
    if (winRate > bestRate) {
      bestRate = winRate;
      bestRegime = regime;
    }
    if (winRate < worstRate) {
      worstRate = winRate;
      worstRegime = regime;
    }
  });

  return { bestRegime, worstRegime };
}
