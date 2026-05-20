import { Candle } from '../utils/indicators';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('market:relativeStrength');

export interface RelativeStrengthMetrics {
  rsScore: number; // 0-100 scale
  momentum: number; // Rate of change
  percentile: number; // Performance percentile vs peers
  trendStrength: number;
  volatilityAdjustedRS: number;
}

export interface SectorData {
  symbol: string;
  candles: Candle[];
  marketCap?: number;
}

export class RelativeStrengthEngine {
  private marketData: Map<string, Candle[]> = new Map();
  private sectorData: Map<string, SectorData[]> = new Map();

  /**
   * Analyzes relative strength of a stock vs market and sector peers
   */
  analyzeStock(
    symbol: string,
    candles: Candle[],
    marketCandles: Candle[],
    sectorPeers: SectorData[] = []
  ): RelativeStrengthMetrics {
    if (candles.length < 20 || marketCandles.length < 20) {
      return {
        rsScore: 50,
        momentum: 0,
        percentile: 50,
        trendStrength: 0,
        volatilityAdjustedRS: 50
      };
    }

    // Calculate price performance over different periods
    const periods = [20, 50, 100]; // 1M, 2.5M, 5M equivalent
    const performances: number[] = [];

    for (const period of periods) {
      if (candles.length >= period) {
        const stockReturn = this.calculateReturn(candles.slice(-period));
        const marketReturn = this.calculateReturn(marketCandles.slice(-period));
        const rs = stockReturn - marketReturn;
        performances.push(rs);
      }
    }

    // Weighted RS score (more recent periods have higher weight)
    const weights = [0.5, 0.3, 0.2];
    let rsScore = 0;
    let totalWeight = 0;

    performances.forEach((perf, index) => {
      const weight = weights[index] || 0;
      rsScore += perf * weight;
      totalWeight += weight;
    });

    rsScore = totalWeight > 0 ? rsScore / totalWeight : 0;

    // Normalize to 0-100 scale (assuming -50% to +50% range is reasonable)
    const normalizedRS = Math.max(0, Math.min(100, 50 + rsScore * 100));

    // Calculate momentum (rate of change of RS)
    const momentum = this.calculateMomentum(performances);

    // Calculate percentile vs sector peers
    const percentile = this.calculatePercentile(symbol, candles, sectorPeers);

    // Trend strength using linear regression slope
    const trendStrength = this.calculateTrendStrength(candles);

    // Volatility-adjusted RS (RS divided by volatility)
    const volatility = this.calculateVolatility(candles);
    const volatilityAdjustedRS = volatility > 0 ? normalizedRS / volatility : normalizedRS;

    log.debug(`RS Analysis for ${symbol}: RS=${normalizedRS.toFixed(1)}, Momentum=${momentum.toFixed(2)}, Percentile=${percentile.toFixed(1)}%`);

    return {
      rsScore: normalizedRS,
      momentum,
      percentile,
      trendStrength,
      volatilityAdjustedRS
    };
  }

  /**
   * Identifies stocks with improving relative strength
   */
  findStrengtheningStocks(
    stocks: Array<{ symbol: string; candles: Candle[] }>,
    marketCandles: Candle[]
  ): Array<{ symbol: string; metrics: RelativeStrengthMetrics; rank: number }> {
    const analyzed = stocks.map(stock => ({
      symbol: stock.symbol,
      metrics: this.analyzeStock(stock.symbol, stock.candles, marketCandles),
      rank: 0
    }));

    // Rank by composite score (RS + momentum + trend strength)
    analyzed.forEach(stock => {
      stock.rank = stock.metrics.rsScore * 0.4 +
                  (stock.metrics.momentum + 1) * 25 + // Normalize momentum to 0-50
                  stock.metrics.trendStrength * 0.3;
    });

    // Sort by rank descending
    analyzed.sort((a, b) => b.rank - a.rank);

    return analyzed;
  }

  /**
   * Detects relative strength divergences (early warning signals)
   */
  detectRSDivergences(
    symbol: string,
    candles: Candle[],
    marketCandles: Candle[]
  ): { hasDivergence: boolean; type: 'bullish' | 'bearish' | 'none'; strength: number } {
    if (candles.length < 50 || marketCandles.length < 50) {
      return { hasDivergence: false, type: 'none', strength: 0 };
    }

    // Calculate RS line
    const rsValues: number[] = [];
    for (let i = 49; i < candles.length; i++) {
      const stockReturn = this.calculateReturn(candles.slice(i - 49, i + 1));
      const marketReturn = this.calculateReturn(marketCandles.slice(i - 49, i + 1));
      rsValues.push(stockReturn - marketReturn);
    }

    // Check for divergences over last 20 periods
    const recentRS = rsValues.slice(-20);
    const recentPrices = candles.slice(-20).map(c => c.close);

    // Bullish divergence: price makes lower low, RS makes higher low
    const priceLowerLow = this.hasLowerLow(recentPrices);
    const rsHigherLow = this.hasHigherLow(recentRS);

    // Bearish divergence: price makes higher high, RS makes lower high
    const priceHigherHigh = this.hasHigherHigh(recentPrices);
    const rsLowerHigh = this.hasLowerHigh(recentRS);

    if (priceLowerLow && rsHigherLow) {
      const strength = this.calculateDivergenceStrength(recentPrices, recentRS, 'bullish');
      return { hasDivergence: true, type: 'bullish', strength };
    }

    if (priceHigherHigh && rsLowerHigh) {
      const strength = this.calculateDivergenceStrength(recentPrices, recentRS, 'bearish');
      return { hasDivergence: true, type: 'bearish', strength };
    }

    return { hasDivergence: false, type: 'none', strength: 0 };
  }

  private calculateReturn(candles: Candle[]): number {
    if (candles.length < 2) return 0;
    const startPrice = candles[0].close;
    const endPrice = candles[candles.length - 1].close;
    return (endPrice - startPrice) / startPrice;
  }

  private calculateMomentum(performances: number[]): number {
    if (performances.length < 2) return 0;

    // Rate of change of RS values
    const recent = performances[performances.length - 1];
    const previous = performances[performances.length - 2];

    return recent - previous;
  }

  private calculatePercentile(symbol: string, candles: Candle[], sectorPeers: SectorData[]): number {
    if (sectorPeers.length === 0) return 50;

    const stockReturn = this.calculateReturn(candles.slice(-50)); // 50 period return
    const peerReturns = sectorPeers.map(peer => this.calculateReturn(peer.candles.slice(-50)));

    const betterThan = peerReturns.filter(ret => stockReturn > ret).length;
    return (betterThan / peerReturns.length) * 100;
  }

  private calculateTrendStrength(candles: Candle[]): number {
    if (candles.length < 20) return 0;

    const closes = candles.map(c => c.close);
    const n = closes.length;

    // Linear regression slope
    const xMean = (n - 1) / 2;
    const yMean = closes.reduce((sum, y) => sum + y, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = closes[i];
      numerator += (x - xMean) * (y - yMean);
      denominator += Math.pow(x - xMean, 2);
    }

    if (denominator === 0) return 0;

    const slope = numerator / denominator;
    const slopePercent = slope / yMean; // Normalize by average price

    // Convert to 0-100 scale
    return Math.max(0, Math.min(100, 50 + slopePercent * 1000));
  }

  private calculateVolatility(candles: Candle[]): number {
    if (candles.length < 2) return 0;

    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(ret);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance * 252); // Annualized volatility
  }

  private hasLowerLow(prices: number[]): boolean {
    const recent = prices.slice(-10);
    const earlier = prices.slice(-20, -10);

    const recentLow = Math.min(...recent);
    const earlierLow = Math.min(...earlier);

    return recentLow < earlierLow;
  }

  private hasHigherLow(values: number[]): boolean {
    const recent = values.slice(-10);
    const earlier = values.slice(-20, -10);

    const recentLow = Math.min(...recent);
    const earlierLow = Math.min(...earlier);

    return recentLow > earlierLow;
  }

  private hasHigherHigh(prices: number[]): boolean {
    const recent = prices.slice(-10);
    const earlier = prices.slice(-20, -10);

    const recentHigh = Math.max(...recent);
    const earlierHigh = Math.max(...earlier);

    return recentHigh > earlierHigh;
  }

  private hasLowerHigh(values: number[]): boolean {
    const recent = values.slice(-10);
    const earlier = values.slice(-20, -10);

    const recentHigh = Math.max(...recent);
    const earlierHigh = Math.max(...earlier);

    return recentHigh < earlierHigh;
  }

  private calculateDivergenceStrength(prices: number[], rsValues: number[], type: 'bullish' | 'bearish'): number {
    // Strength based on how extreme the divergence is
    const priceSwing = type === 'bullish' ?
      (Math.min(...prices.slice(-10)) - Math.min(...prices.slice(-20, -10))) / Math.min(...prices.slice(-20, -10)) :
      (Math.max(...prices.slice(-10)) - Math.max(...prices.slice(-20, -10))) / Math.max(...prices.slice(-20, -10));

    const rsSwing = type === 'bullish' ?
      (Math.max(...rsValues.slice(-10)) - Math.max(...rsValues.slice(-20, -10))) :
      (Math.min(...rsValues.slice(-10)) - Math.min(...rsValues.slice(-20, -10)));

    return Math.abs(priceSwing) * Math.abs(rsSwing) * 100;
  }
}