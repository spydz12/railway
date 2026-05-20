import { Candle } from '../utils/indicators';
import { StrategyResult } from '../strategies/base';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('ai:adaptiveEngine');

export interface MarketCondition {
  volatility: number;
  trend: 'bull' | 'bear' | 'sideways';
  volume: 'high' | 'normal' | 'low';
  regime: 'trending' | 'ranging' | 'volatile';
}

export interface StrategyPerformance {
  strategyName: string;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalTrades: number;
  avgReturn: number;
  sharpeRatio: number;
  lastUpdated: Date;
}

export interface AdaptiveRecommendation {
  strategyName: string;
  confidence: number; // 0-100
  expectedReturn: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string;
  marketFit: number; // How well strategy fits current market
}

export class AdaptiveAIStrategyEngine {
  private performanceHistory = new Map<string, StrategyPerformance[]>();
  private marketHistory: MarketCondition[] = [];
  private readonly MAX_HISTORY_SIZE = 1000;

  /**
   * Learns from strategy performance and market conditions
   */
  learnFromPerformance(
    strategyName: string,
    performance: StrategyPerformance,
    marketCondition: MarketCondition
  ): void {
    // Store performance data
    if (!this.performanceHistory.has(strategyName)) {
      this.performanceHistory.set(strategyName, []);
    }

    const history = this.performanceHistory.get(strategyName)!;
    history.push(performance);

    // Keep only recent history
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.shift();
    }

    // Store market condition
    this.marketHistory.push(marketCondition);
    if (this.marketHistory.length > this.MAX_HISTORY_SIZE) {
      this.marketHistory.shift();
    }

    log.debug(`Learned from ${strategyName}: winRate=${performance.winRate.toFixed(2)}, profitFactor=${performance.profitFactor.toFixed(2)}`);
  }

  /**
   * Gets adaptive recommendations for current market conditions
   */
  getRecommendations(currentMarket: MarketCondition): AdaptiveRecommendation[] {
    const recommendations: AdaptiveRecommendation[] = [];

    for (const [strategyName, performances] of this.performanceHistory) {
      const recommendation = this.analyzeStrategyFit(strategyName, performances, currentMarket);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    }

    // Sort by confidence and expected return
    recommendations.sort((a, b) => {
      const scoreA = a.confidence * 0.6 + a.expectedReturn * 0.4;
      const scoreB = b.confidence * 0.6 + b.expectedReturn * 0.4;
      return scoreB - scoreA;
    });

    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  /**
   * Analyzes how well a strategy fits current market conditions
   */
  private analyzeStrategyFit(
    strategyName: string,
    performances: StrategyPerformance[],
    currentMarket: MarketCondition
  ): AdaptiveRecommendation | null {
    if (performances.length < 5) return null; // Need minimum history

    // Find similar market conditions in history
    const similarConditions = this.findSimilarMarketConditions(currentMarket);

    if (similarConditions.length === 0) {
      return this.createDefaultRecommendation(strategyName, performances);
    }

    // Calculate performance in similar conditions
    const relevantPerformances = performances.filter((_, index) =>
      similarConditions.includes(index)
    );

    if (relevantPerformances.length === 0) {
      return this.createDefaultRecommendation(strategyName, performances);
    }

    // Aggregate performance metrics
    const avgWinRate = relevantPerformances.reduce((sum, p) => sum + p.winRate, 0) / relevantPerformances.length;
    const avgProfitFactor = relevantPerformances.reduce((sum, p) => sum + p.profitFactor, 0) / relevantPerformances.length;
    const avgReturn = relevantPerformances.reduce((sum, p) => sum + p.avgReturn, 0) / relevantPerformances.length;
    const avgMaxDrawdown = relevantPerformances.reduce((sum, p) => sum + p.maxDrawdown, 0) / relevantPerformances.length;

    // Calculate confidence based on consistency and sample size
    const consistency = this.calculateConsistency(relevantPerformances);
    const sampleSize = relevantPerformances.length;
    const confidence = Math.min(100, (consistency * 0.7 + Math.min(1, sampleSize / 20) * 0.3) * 100);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(avgMaxDrawdown, avgProfitFactor);

    // Calculate market fit score
    const marketFit = this.calculateMarketFit(strategyName, currentMarket);

    // Expected return based on historical performance and market fit
    const expectedReturn = avgReturn * (marketFit / 100);

    const reasoning = this.generateReasoning(strategyName, currentMarket, avgWinRate, avgProfitFactor, marketFit);

    return {
      strategyName,
      confidence: Math.round(confidence),
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      riskLevel,
      reasoning,
      marketFit: Math.round(marketFit)
    };
  }

  /**
   * Finds historical market conditions similar to current
   */
  private findSimilarMarketConditions(currentMarket: MarketCondition): number[] {
    const similarIndices: number[] = [];

    for (let i = 0; i < this.marketHistory.length; i++) {
      const historical = this.marketHistory[i];
      const similarity = this.calculateMarketSimilarity(currentMarket, historical);

      if (similarity >= 0.7) { // 70% similarity threshold
        similarIndices.push(i);
      }
    }

    return similarIndices;
  }

  /**
   * Calculates similarity between two market conditions
   */
  private calculateMarketSimilarity(a: MarketCondition, b: MarketCondition): number {
    let similarity = 0;
    let totalFactors = 0;

    // Trend similarity
    if (a.trend === b.trend) similarity += 1;
    totalFactors++;

    // Regime similarity
    if (a.regime === b.regime) similarity += 1;
    totalFactors++;

    // Volume similarity
    if (a.volume === b.volume) similarity += 1;
    totalFactors++;

    // Volatility similarity (within 20% range)
    const volDiff = Math.abs(a.volatility - b.volatility);
    const avgVol = (a.volatility + b.volatility) / 2;
    if (avgVol > 0 && volDiff / avgVol < 0.2) similarity += 1;
    totalFactors++;

    return similarity / totalFactors;
  }

  /**
   * Creates default recommendation when no similar conditions found
   */
  private createDefaultRecommendation(
    strategyName: string,
    performances: StrategyPerformance[]
  ): AdaptiveRecommendation {
    const recent = performances[performances.length - 1];
    const avgReturn = performances.reduce((sum, p) => sum + p.avgReturn, 0) / performances.length;

    return {
      strategyName,
      confidence: 40, // Lower confidence for default recommendations
      expectedReturn: Math.round(avgReturn * 100) / 100,
      riskLevel: this.determineRiskLevel(recent.maxDrawdown, recent.profitFactor),
      reasoning: `Default recommendation based on overall performance. Limited historical data for current market conditions.`,
      marketFit: 50
    };
  }

  /**
   * Calculates consistency of strategy performance
   */
  private calculateConsistency(performances: StrategyPerformance[]): number {
    if (performances.length < 2) return 0;

    const winRates = performances.map(p => p.winRate);
    const mean = winRates.reduce((sum, r) => sum + r, 0) / winRates.length;
    const variance = winRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / winRates.length;

    // Lower variance = higher consistency
    return Math.max(0, 1 - Math.sqrt(variance) / 0.5); // Normalize around 50% win rate variance
  }

  /**
   * Determines risk level based on drawdown and profit factor
   */
  private determineRiskLevel(maxDrawdown: number, profitFactor: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    const riskScore = (maxDrawdown * 0.6) + ((1 / Math.max(0.1, profitFactor)) * 0.4);

    if (riskScore < 0.3) return 'LOW';
    if (riskScore < 0.6) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Calculates how well a strategy fits current market conditions
   */
  private calculateMarketFit(strategyName: string, currentMarket: MarketCondition): number {
    // Strategy-specific market preferences (could be learned over time)
    const strategyPreferences: Record<string, Partial<MarketCondition>> = {
      'VWAP': { regime: 'trending', volume: 'high' },
      'ORB': { regime: 'ranging', volatility: 0.15 },
      'EMA_Cloud': { trend: 'bull', regime: 'trending' },
      'Mean_Reversion': { regime: 'ranging', volatility: 0.2 },
      'Breakout_Volume': { regime: 'volatile', volume: 'high' },
      'Support_Bounce': { trend: 'sideways', regime: 'ranging' }
    };

    const preferences = strategyPreferences[strategyName];
    if (!preferences) return 50; // Neutral fit

    let fitScore = 0;
    let totalFactors = 0;

    if (preferences.trend && preferences.trend === currentMarket.trend) {
      fitScore += 25;
    }
    if (preferences.trend) totalFactors += 25;

    if (preferences.regime && preferences.regime === currentMarket.regime) {
      fitScore += 25;
    }
    if (preferences.regime) totalFactors += 25;

    if (preferences.volume && preferences.volume === currentMarket.volume) {
      fitScore += 25;
    }
    if (preferences.volume) totalFactors += 25;

    if (preferences.volatility && Math.abs(preferences.volatility - currentMarket.volatility) < 0.05) {
      fitScore += 25;
    }
    if (preferences.volatility) totalFactors += 25;

    return totalFactors > 0 ? (fitScore / totalFactors) * 100 : 50;
  }

  /**
   * Generates human-readable reasoning for recommendation
   */
  private generateReasoning(
    strategyName: string,
    market: MarketCondition,
    winRate: number,
    profitFactor: number,
    marketFit: number
  ): string {
    const reasons: string[] = [];

    reasons.push(`${strategyName} has shown ${winRate.toFixed(1)}% win rate in similar conditions`);

    if (profitFactor > 1.5) {
      reasons.push('Strong profit factor indicates reliable returns');
    } else if (profitFactor > 1.2) {
      reasons.push('Moderate profit factor with acceptable risk');
    }

    if (marketFit > 70) {
      reasons.push('Excellent fit for current market conditions');
    } else if (marketFit > 50) {
      reasons.push('Good fit for current market regime');
    } else {
      reasons.push('Moderate fit - monitor performance closely');
    }

    reasons.push(`Market: ${market.trend} trend, ${market.regime} regime, ${market.volume} volume`);

    return reasons.join('. ');
  }

  /**
   * Updates strategy weights based on recent performance
   */
  updateStrategyWeights(): Map<string, number> {
    const weights = new Map<string, number>();

    for (const [strategyName, performances] of this.performanceHistory) {
      if (performances.length === 0) continue;

      const recent = performances.slice(-10); // Last 10 performance records
      const avgSharpe = recent.reduce((sum, p) => sum + p.sharpeRatio, 0) / recent.length;
      const avgWinRate = recent.reduce((sum, p) => sum + p.winRate, 0) / recent.length;

      // Weight based on risk-adjusted returns
      const weight = Math.max(0, avgSharpe * avgWinRate);
      weights.set(strategyName, weight);
    }

    // Normalize weights
    const totalWeight = Array.from(weights.values()).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      for (const [strategy, weight] of weights) {
        weights.set(strategy, weight / totalWeight);
      }
    }

    return weights;
  }

  /**
   * Gets market condition assessment
   */
  assessMarketCondition(candles: Candle[]): MarketCondition {
    if (candles.length < 20) {
      return {
        volatility: 0.2,
        trend: 'sideways',
        volume: 'normal',
        regime: 'ranging'
      };
    }

    // Calculate volatility (20-period)
    const prices = candles.map(c => c.close);
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252);

    // Determine trend
    const recentAvg = prices.slice(-10).reduce((sum, p) => sum + p, 0) / 10;
    const olderAvg = prices.slice(-20, -10).reduce((sum, p) => sum + p, 0) / 10;
    const trendChange = (recentAvg - olderAvg) / olderAvg;

    let trend: 'bull' | 'bear' | 'sideways';
    if (trendChange > 0.02) trend = 'bull';
    else if (trendChange < -0.02) trend = 'bear';
    else trend = 'sideways';

    // Determine volume
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const recentVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
    const volumeRatio = recentVolume / avgVolume;

    let volumeLevel: 'high' | 'normal' | 'low';
    if (volumeRatio > 1.5) volumeLevel = 'high';
    else if (volumeRatio < 0.7) volumeLevel = 'low';
    else volumeLevel = 'normal';

    // Determine regime using ADX-like calculation
    const regime = this.determineRegime(candles);

    return {
      volatility,
      trend,
      volume: volumeLevel,
      regime
    };
  }

  private determineRegime(candles: Candle[]): 'trending' | 'ranging' | 'volatile' {
    if (candles.length < 14) return 'ranging';

    // Simplified ADX calculation
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    let adxSum = 0;
    for (let i = 1; i < Math.min(14, candles.length); i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );

      const dmPlus = highs[i] - highs[i - 1] > lows[i - 1] - lows[i] ? Math.max(highs[i] - highs[i - 1], 0) : 0;
      const dmMinus = lows[i - 1] - lows[i] > highs[i] - highs[i - 1] ? Math.max(lows[i - 1] - lows[i], 0) : 0;

      if (i >= 13) { // Start calculating after 14 periods
        const diPlus = (dmPlus / tr) * 100;
        const diMinus = (dmMinus / tr) * 100;
        const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
        adxSum += dx;
      }
    }

    const adx = adxSum / Math.max(1, Math.min(14, candles.length) - 13);

    if (adx > 25) return 'trending';
    if (this.volatility(candles) > 0.03) return 'volatile';
    return 'ranging';
  }

  private volatility(candles: Candle[]): number {
    if (candles.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }
}