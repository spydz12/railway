"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsSentimentEngine = void 0;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('news:sentiment');
class NewsSentimentEngine {
    constructor() {
        this.POSITIVE_WORDS = new Set([
            'upgrade', 'buy', 'bullish', 'surge', 'rally', 'beat', 'exceed', 'growth',
            'profit', 'revenue', 'earnings', 'acquisition', 'merger', 'partnership',
            'launch', 'expansion', 'increase', 'rise', 'gain', 'boost', 'strong',
            'positive', 'optimistic', 'breakthrough', 'innovation', 'milestone'
        ]);
        this.NEGATIVE_WORDS = new Set([
            'downgrade', 'sell', 'bearish', 'plunge', 'crash', 'miss', 'decline',
            'loss', 'debt', 'lawsuit', 'scandal', 'investigation', 'recall', 'breach',
            'fall', 'drop', 'decrease', 'weak', 'negative', 'pessimistic', 'concern',
            'warning', 'risk', 'threat', 'crisis', 'bankruptcy', 'layoff'
        ]);
        this.HIGH_IMPACT_KEYWORDS = new Set([
            'earnings', 'guidance', 'forecast', 'revenue', 'profit', 'loss', 'FDA',
            'SEC', 'lawsuit', 'merger', 'acquisition', 'bankruptcy', 'recall',
            'CEO', 'CFO', 'board', 'shareholder', 'dividend', 'split'
        ]);
        this.BREAKING_KEYWORDS = new Set([
            'breaking', 'urgent', 'emergency', 'crisis', 'scandal', 'arrest',
            'death', 'accident', 'disaster', 'explosion', 'fire', 'attack'
        ]);
    }
    /**
     * Analyzes sentiment of news articles
     */
    analyzeNewsSentiment(articles) {
        if (articles.length === 0) {
            return {
                overall: 0,
                confidence: 0,
                keywords: [],
                themes: [],
                impact: 'LOW',
                urgency: 'ROUTINE'
            };
        }
        const allText = articles.map(a => `${a.title} ${a.content}`).join(' ').toLowerCase();
        const words = this.tokenizeText(allText);
        // Calculate sentiment scores
        let positiveScore = 0;
        let negativeScore = 0;
        let totalWords = 0;
        const keywordCounts = new Map();
        for (const word of words) {
            if (this.POSITIVE_WORDS.has(word)) {
                positiveScore += 1;
                keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
            }
            else if (this.NEGATIVE_WORDS.has(word)) {
                negativeScore += 1;
                keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
            }
            totalWords++;
        }
        // Calculate overall sentiment (-1 to 1)
        const totalSentimentWords = positiveScore + negativeScore;
        const overall = totalSentimentWords > 0 ?
            (positiveScore - negativeScore) / totalSentimentWords : 0;
        // Calculate confidence based on volume and consistency
        const confidence = Math.min(100, (totalSentimentWords / Math.max(1, totalWords * 0.01)) * 50);
        // Extract top keywords
        const keywords = Array.from(keywordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
        // Determine themes
        const themes = this.extractThemes(articles);
        // Determine impact level
        const impact = this.determineImpact(articles, keywords);
        // Determine urgency
        const urgency = this.determineUrgency(articles);
        log.debug(`News sentiment analysis: ${overall.toFixed(2)} overall, ${confidence.toFixed(1)}% confidence, impact: ${impact}`);
        return {
            overall,
            confidence: Math.round(confidence),
            keywords,
            themes,
            impact,
            urgency
        };
    }
    /**
     * Analyzes social media sentiment for a symbol
     */
    analyzeSocialSentiment(symbol, twitterData, redditData, stocktwitsData) {
        const twitterSentiment = this.analyzePlatformSentiment(twitterData);
        const redditSentiment = this.analyzePlatformSentiment(redditData);
        const stocktwitsSentiment = this.analyzePlatformSentiment(stocktwitsData);
        const totalVolume = twitterData.length + redditData.length + stocktwitsData.length;
        // Weighted average sentiment (StockTwits gets higher weight for stock-specific sentiment)
        const overallSentiment = (twitterSentiment.sentiment * 0.3 +
            redditSentiment.sentiment * 0.3 +
            stocktwitsSentiment.sentiment * 0.4);
        // Calculate momentum (simplified - would need historical data for real momentum)
        const momentum = this.calculateSentimentMomentum([twitterSentiment, redditSentiment, stocktwitsSentiment]);
        return {
            symbol,
            twitterSentiment: twitterSentiment.sentiment,
            redditSentiment: redditSentiment.sentiment,
            stocktwitsSentiment: stocktwitsSentiment.sentiment,
            volume: totalVolume,
            momentum
        };
    }
    /**
     * Combines news and social sentiment for comprehensive analysis
     */
    getComprehensiveSentiment(newsAnalysis, socialSentiment) {
        // Weight news more heavily for institutional decisions
        const newsWeight = 0.6;
        const socialWeight = 0.4;
        const combinedScore = (newsAnalysis.overall * newsWeight +
            socialSentiment.twitterSentiment * 0.2 +
            socialSentiment.redditSentiment * 0.1 +
            socialSentiment.stocktwitsSentiment * 0.1);
        // Determine dominant source
        const newsStrength = Math.abs(newsAnalysis.overall) * newsAnalysis.confidence / 100;
        const socialStrength = Math.abs(socialSentiment.twitterSentiment) * socialSentiment.volume / 100;
        let dominantSource;
        if (newsStrength > socialStrength * 1.5) {
            dominantSource = 'news';
        }
        else if (socialStrength > newsStrength * 1.5) {
            dominantSource = 'social';
        }
        else {
            dominantSource = 'balanced';
        }
        // Determine trading implication
        let tradingImplication;
        if (combinedScore > 0.2) {
            tradingImplication = 'BULLISH';
        }
        else if (combinedScore < -0.2) {
            tradingImplication = 'BEARISH';
        }
        else {
            tradingImplication = 'NEUTRAL';
        }
        // Calculate confidence
        const confidence = Math.min(100, (newsAnalysis.confidence * newsWeight + (socialSentiment.volume > 10 ? 80 : 40) * socialWeight));
        return {
            combinedScore,
            dominantSource,
            tradingImplication,
            confidence: Math.round(confidence)
        };
    }
    tokenizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2);
    }
    extractThemes(articles) {
        const themes = new Set();
        for (const article of articles) {
            const text = `${article.title} ${article.content}`.toLowerCase();
            if (text.includes('earnings') || text.includes('revenue') || text.includes('profit')) {
                themes.add('earnings');
            }
            if (text.includes('merger') || text.includes('acquisition') || text.includes('deal')) {
                themes.add('M&A');
            }
            if (text.includes('lawsuit') || text.includes('legal') || text.includes('court')) {
                themes.add('legal');
            }
            if (text.includes('FDA') || text.includes('approval') || text.includes('clinical')) {
                themes.add('regulatory');
            }
            if (text.includes('CEO') || text.includes('management') || text.includes('board')) {
                themes.add('management');
            }
            if (text.includes('product') || text.includes('launch') || text.includes('technology')) {
                themes.add('product');
            }
        }
        return Array.from(themes);
    }
    determineImpact(articles, keywords) {
        // Check for high impact keywords
        const hasHighImpactKeyword = keywords.some(word => this.HIGH_IMPACT_KEYWORDS.has(word));
        // Check article sources (premium sources = higher impact)
        const premiumSources = ['Reuters', 'Bloomberg', 'WSJ', 'FT', 'CNBC'];
        const hasPremiumSource = articles.some(a => premiumSources.some(source => a.source.toLowerCase().includes(source.toLowerCase())));
        // Check recency (very recent = higher impact)
        const now = new Date();
        const recentArticles = articles.filter(a => (now.getTime() - a.publishedAt.getTime()) < (24 * 60 * 60 * 1000) // Within 24 hours
        );
        if (hasHighImpactKeyword || hasPremiumSource || recentArticles.length > articles.length * 0.7) {
            return 'HIGH';
        }
        else if (keywords.length > 3 || articles.length > 2) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    determineUrgency(articles) {
        const allText = articles.map(a => `${a.title} ${a.content}`).join(' ').toLowerCase();
        // Check for breaking keywords
        const hasBreakingKeyword = Array.from(this.BREAKING_KEYWORDS).some(keyword => allText.includes(keyword));
        // Check timing - very recent articles
        const now = new Date();
        const veryRecent = articles.filter(a => (now.getTime() - a.publishedAt.getTime()) < (2 * 60 * 60 * 1000) // Within 2 hours
        );
        if (hasBreakingKeyword || veryRecent.length > 0) {
            return 'BREAKING';
        }
        else if (articles.some(a => (now.getTime() - a.publishedAt.getTime()) < (12 * 60 * 60 * 1000))) {
            return 'TIMELY';
        }
        else {
            return 'ROUTINE';
        }
    }
    analyzePlatformSentiment(data) {
        if (data.length === 0) {
            return { sentiment: 0, volume: 0 };
        }
        // Simplified sentiment analysis - in real implementation would use ML models
        let positive = 0;
        let negative = 0;
        for (const item of data) {
            const text = (item.text || item.content || '').toLowerCase();
            const positiveWords = Array.from(this.POSITIVE_WORDS).some(word => text.includes(word));
            const negativeWords = Array.from(this.NEGATIVE_WORDS).some(word => text.includes(word));
            if (positiveWords)
                positive++;
            if (negativeWords)
                negative++;
        }
        const total = positive + negative;
        const sentiment = total > 0 ? (positive - negative) / total : 0;
        return { sentiment, volume: data.length };
    }
    calculateSentimentMomentum(sentiments) {
        // Simplified momentum calculation - would need time series data for real momentum
        const avgSentiment = sentiments.reduce((sum, s) => sum + s.sentiment, 0) / sentiments.length;
        const avgVolume = sentiments.reduce((sum, s) => sum + s.volume, 0) / sentiments.length;
        // Momentum as sentiment weighted by volume
        return avgSentiment * Math.min(1, avgVolume / 10);
    }
}
exports.NewsSentimentEngine = NewsSentimentEngine;
