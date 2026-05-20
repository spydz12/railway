// AI Module - Institutional-grade trading intelligence
export { FakeBreakoutDetector, type FakeoutAnalysis } from './fakeBreakoutDetector';
export { AdaptiveAIStrategyEngine, type MarketCondition, type StrategyPerformance, type AdaptiveRecommendation } from './adaptiveEngine';

// Re-export from other modules for convenience
export { RelativeStrengthEngine, type RelativeStrengthMetrics, type SectorData } from '../market/relativeStrength';
export { PremarketScanner, type PremarketData, type PremarketSignal } from '../premarket/scanner';
export { NewsSentimentEngine, type NewsArticle, type SentimentAnalysis, type SocialSentiment } from '../news/sentiment';
export { SmartWatchlistGenerator, type WatchlistCriteria, type StockMetrics, type SmartWatchlist } from '../watchlist/generator';
export { BacktestEngine, type BacktestConfig, type BacktestResult, type TradeRecord } from '../backtest/engine';