import { Candle, averageVolume, volatility } from '../utils/indicators';
import { RelativeStrengthMetrics, RelativeStrengthEngine } from '../market/relativeStrength';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('watchlist:generator');

export interface WatchlistCriteria {
  minVolume?: number;
  maxVolatility?: number;
  minRelativeStrength?: number;
  maxRelativeStrength?: number;
  minPrice?: number;
  maxPrice?: number;
  sector?: string;
  marketCap?: 'large' | 'mid' | 'small';
  trendDirection?: 'up' | 'down' | 'sideways';
  minLiquidityScore?: number;
}

export interface StockMetrics {
  symbol: string;
  price: number;
  volume: number;
  volatility: number;
  relativeStrength: RelativeStrengthMetrics;
  liquidityScore: number;
  trendDirection: 'up' | 'down' | 'sideways';
  sector?: string;
  marketCap?: number;
}

export interface SmartWatchlist {
  name: string;
  description: string;
  criteria: WatchlistCriteria;
  stocks: StockMetrics[];
  generatedAt: Date;
  performance: {
    averageRS: number;
    averageVolume: number;
    sectorDistribution: Record<string, number>;
  };
}

export class SmartWatchlistGenerator {
  private rsEngine = new RelativeStrengthEngine();

  /**
   * Generates a smart watchlist based on specified criteria
   */
  async generateWatchlist(
    name: string,
    description: string,
    criteria: WatchlistCriteria,
    stockData: Array<{
      symbol: string;
      candles: Candle[];
      sector?: string;
      marketCap?: number;
    }>,
    marketCandles: Candle[]
  ): Promise<SmartWatchlist> {
    log.info(`Generating smart watchlist: ${name}`);

    // Calculate metrics for all stocks
    const stockMetrics = await this.calculateStockMetrics(stockData, marketCandles);

    // Apply filters
    const filteredStocks = this.applyFilters(stockMetrics, criteria);

    // Sort by relevance score
    const sortedStocks = this.sortByRelevance(filteredStocks, criteria);

    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(sortedStocks);

    const watchlist: SmartWatchlist = {
      name,
      description,
      criteria,
      stocks: sortedStocks,
      generatedAt: new Date(),
      performance
    };

    log.info(`Watchlist ${name} generated: ${sortedStocks.length} stocks`);
    return watchlist;
  }

  /**
   * Generates predefined watchlists for common strategies
   */
  async generatePredefinedWatchlists(
    stockData: Array<{
      symbol: string;
      candles: Candle[];
      sector?: string;
      marketCap?: number;
    }>,
    marketCandles: Candle[]
  ): Promise<SmartWatchlist[]> {
    const watchlists: SmartWatchlist[] = [];

    // High Relative Strength Watchlist
    watchlists.push(await this.generateWatchlist(
      'High RS Momentum',
      'Stocks showing strong relative strength and positive momentum',
      {
        minRelativeStrength: 70,
        minVolume: 500000,
        trendDirection: 'up'
      },
      stockData,
      marketCandles
    ));

    // Low Volatility Value Watchlist
    watchlists.push(await this.generateWatchlist(
      'Low Vol Value',
      'Low volatility stocks with solid fundamentals',
      {
        maxVolatility: 0.25,
        minVolume: 200000,
        minLiquidityScore: 70
      },
      stockData,
      marketCandles
    ));

    // Breakout Candidates
    watchlists.push(await this.generateWatchlist(
      'Breakout Candidates',
      'Stocks consolidating with increasing volume',
      {
        minVolume: 300000,
        trendDirection: 'sideways',
        minLiquidityScore: 60
      },
      stockData,
      marketCandles
    ));

    // Oversold Bounce Candidates
    watchlists.push(await this.generateWatchlist(
      'Oversold Bounce',
      'Stocks with weak relative strength showing potential reversal',
      {
        maxRelativeStrength: 30,
        minVolume: 100000,
        trendDirection: 'down'
      },
      stockData,
      marketCandles
    ));

    // High Volume Alerts
    watchlists.push(await this.generateWatchlist(
      'High Volume Alerts',
      'Stocks with unusually high volume today',
      {
        minVolume: 1000000 // Very high volume threshold
      },
      stockData,
      marketCandles
    ));

    return watchlists;
  }

  /**
   * Updates existing watchlist with fresh data
   */
  async updateWatchlist(
    watchlist: SmartWatchlist,
    newStockData: Array<{
      symbol: string;
      candles: Candle[];
      sector?: string;
      marketCap?: number;
    }>,
    marketCandles: Candle[]
  ): Promise<SmartWatchlist> {
    log.info(`Updating watchlist: ${watchlist.name}`);

    // Recalculate metrics
    const updatedMetrics = await this.calculateStockMetrics(newStockData, marketCandles);

    // Reapply filters
    const filteredStocks = this.applyFilters(updatedMetrics, watchlist.criteria);

    // Resort
    const sortedStocks = this.sortByRelevance(filteredStocks, watchlist.criteria);

    // Update performance
    const performance = this.calculatePerformanceMetrics(sortedStocks);

    return {
      ...watchlist,
      stocks: sortedStocks,
      generatedAt: new Date(),
      performance
    };
  }

  private async calculateStockMetrics(
    stockData: Array<{
      symbol: string;
      candles: Candle[];
      sector?: string;
      marketCap?: number;
    }>,
    marketCandles: Candle[]
  ): Promise<StockMetrics[]> {
    const metrics: StockMetrics[] = [];

    for (const stock of stockData) {
      if (stock.candles.length < 20) continue;

      const latestCandle = stock.candles[stock.candles.length - 1];
      const price = latestCandle.close;
      const volume = latestCandle.volume;

      // Calculate volatility
      const vol = volatility(stock.candles, 20);

      // Calculate relative strength
      const rsMetrics = this.rsEngine.analyzeStock(
        stock.symbol,
        stock.candles,
        marketCandles
      );

      // Calculate liquidity score (volume relative to price)
      const liquidityScore = this.calculateLiquidityScore(volume, price);

      // Determine trend direction
      const trendDirection = this.determineTrendDirection(stock.candles);

      metrics.push({
        symbol: stock.symbol,
        price,
        volume,
        volatility: vol,
        relativeStrength: rsMetrics,
        liquidityScore,
        trendDirection,
        sector: stock.sector,
        marketCap: stock.marketCap
      });
    }

    return metrics;
  }

  private applyFilters(stocks: StockMetrics[], criteria: WatchlistCriteria): StockMetrics[] {
    return stocks.filter(stock => {
      // Volume filter
      if (criteria.minVolume && stock.volume < criteria.minVolume) return false;

      // Volatility filter
      if (criteria.maxVolatility && stock.volatility > criteria.maxVolatility) return false;

      // Relative strength filters
      if (criteria.minRelativeStrength && stock.relativeStrength.rsScore < criteria.minRelativeStrength) return false;
      if (criteria.maxRelativeStrength && stock.relativeStrength.rsScore > criteria.maxRelativeStrength) return false;

      // Price filters
      if (criteria.minPrice && stock.price < criteria.minPrice) return false;
      if (criteria.maxPrice && stock.price > criteria.maxPrice) return false;

      // Sector filter
      if (criteria.sector && stock.sector !== criteria.sector) return false;

      // Market cap filter
      if (criteria.marketCap) {
        const capCategory = this.getMarketCapCategory(stock.marketCap);
        if (capCategory !== criteria.marketCap) return false;
      }

      // Trend direction filter
      if (criteria.trendDirection && stock.trendDirection !== criteria.trendDirection) return false;

      // Liquidity score filter
      if (criteria.minLiquidityScore && stock.liquidityScore < criteria.minLiquidityScore) return false;

      return true;
    });
  }

  private sortByRelevance(stocks: StockMetrics[], criteria: WatchlistCriteria): StockMetrics[] {
    return stocks.sort((a, b) => {
      // Calculate relevance score based on criteria priorities
      let scoreA = 0;
      let scoreB = 0;

      // Primary sort by relative strength for momentum-focused lists
      if (criteria.minRelativeStrength || criteria.maxRelativeStrength) {
        scoreA += a.relativeStrength.rsScore;
        scoreB += b.relativeStrength.rsScore;
      }

      // Volume importance
      if (criteria.minVolume) {
        scoreA += Math.min(1, a.volume / (criteria.minVolume * 2)) * 20;
        scoreB += Math.min(1, b.volume / (criteria.minVolume * 2)) * 20;
      }

      // Volatility preference (lower volatility gets higher score for stability)
      if (criteria.maxVolatility) {
        scoreA += (1 - a.volatility / criteria.maxVolatility) * 15;
        scoreB += (1 - b.volatility / criteria.maxVolatility) * 15;
      }

      // Liquidity bonus
      scoreA += a.liquidityScore * 0.1;
      scoreB += b.liquidityScore * 0.1;

      return scoreB - scoreA; // Higher score first
    });
  }

  private calculatePerformanceMetrics(stocks: StockMetrics[]): SmartWatchlist['performance'] {
    if (stocks.length === 0) {
      return {
        averageRS: 0,
        averageVolume: 0,
        sectorDistribution: {}
      };
    }

    const averageRS = stocks.reduce((sum, s) => sum + s.relativeStrength.rsScore, 0) / stocks.length;
    const averageVolume = stocks.reduce((sum, s) => sum + s.volume, 0) / stocks.length;

    const sectorDistribution: Record<string, number> = {};
    for (const stock of stocks) {
      const sector = stock.sector || 'Unknown';
      sectorDistribution[sector] = (sectorDistribution[sector] || 0) + 1;
    }

    return {
      averageRS: Math.round(averageRS),
      averageVolume: Math.round(averageVolume),
      sectorDistribution
    };
  }

  private calculateLiquidityScore(volume: number, price: number): number {
    // Liquidity score based on dollar volume and price efficiency
    const dollarVolume = volume * price;

    // Scale: $1M = 50, $10M = 80, $100M = 100
    const score = Math.min(100, Math.max(0, (Math.log10(dollarVolume) - 6) * 25));

    return Math.round(score);
  }

  private determineTrendDirection(candles: Candle[]): 'up' | 'down' | 'sideways' {
    if (candles.length < 20) return 'sideways';

    const recent = candles.slice(-20);
    const older = candles.slice(-40, -20);

    if (older.length === 0) return 'sideways';

    const recentAvg = recent.reduce((sum, c) => sum + c.close, 0) / recent.length;
    const olderAvg = older.reduce((sum, c) => sum + c.close, 0) / older.length;

    const changePercent = (recentAvg - olderAvg) / olderAvg;

    if (changePercent > 0.03) return 'up';
    if (changePercent < -0.03) return 'down';
    return 'sideways';
  }

  private getMarketCapCategory(marketCap?: number): 'large' | 'mid' | 'small' {
    if (!marketCap) return 'small';

    if (marketCap >= 10000000000) return 'large'; // $10B+
    if (marketCap >= 2000000000) return 'mid';   // $2B+
    return 'small';
  }

  /**
   * Gets watchlist alerts for stocks that have moved significantly
   */
  getWatchlistAlerts(
    watchlist: SmartWatchlist,
    currentPrices: Map<string, number>
  ): Array<{
    symbol: string;
    alertType: 'price_alert' | 'volume_alert' | 'breakout';
    message: string;
    severity: 'high' | 'medium' | 'low';
  }> {
    const alerts: Array<{
      symbol: string;
      alertType: 'price_alert' | 'volume_alert' | 'breakout';
      message: string;
      severity: 'high' | 'medium' | 'low';
    }> = [];

    for (const stock of watchlist.stocks) {
      const currentPrice = currentPrices.get(stock.symbol);
      if (!currentPrice) continue;

      const priceChange = ((currentPrice - stock.price) / stock.price) * 100;

      // Price movement alerts
      if (Math.abs(priceChange) > 5) {
        alerts.push({
          symbol: stock.symbol,
          alertType: 'price_alert',
          message: `${stock.symbol} moved ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
          severity: Math.abs(priceChange) > 10 ? 'high' : 'medium'
        });
      }

      // Breakout alerts (for breakout candidate watchlists)
      if (watchlist.name.includes('Breakout') && priceChange > 3) {
        alerts.push({
          symbol: stock.symbol,
          alertType: 'breakout',
          message: `${stock.symbol} breaking out +${priceChange.toFixed(2)}%`,
          severity: 'high'
        });
      }
    }

    return alerts;
  }
}