"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPortfolioSnapshot = getPortfolioSnapshot;
exports.suggestPositionSizing = suggestPositionSizing;
const config_1 = require("../config");
const queries_1 = require("../database/queries");
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function calculateIdeaExposure(idea) {
    const scoreWeight = (idea.confidence_score ?? 50) / 100;
    const rrWeight = Math.min(1, (idea.risk_reward_ratio ?? 1) / 4);
    return clamp(scoreWeight * 0.65 + rrWeight * 0.35, 0.1, 1.0);
}
function calculatePortfolioRiskLevel(snapshot) {
    const score = snapshot.normalizedExposure * 0.6 +
        (Math.max(...Object.values(snapshot.sectorExposure), 0) / 100) * 0.25 +
        (snapshot.correlationClusters.length >= config_1.config.portfolio.correlatedTradeLimit ? 0.25 : 0);
    if (score >= 0.85)
        return 'HIGH';
    if (score >= 0.55)
        return 'MEDIUM';
    return 'LOW';
}
function normalizeSectorName(sector) {
    if (!sector)
        return 'Unknown';
    return sector.trim() === '' ? 'Unknown' : sector;
}
async function getPortfolioSnapshot() {
    const activeIdeas = await (0, queries_1.getActiveTradeIdeas)();
    const stocks = await (0, queries_1.getActiveStocks)();
    const stockMap = new Map(stocks.map((stock) => [stock.ticker, normalizeSectorName(stock.sector)]));
    let totalExposure = 0;
    let stockExposure = 0;
    let cryptoExposure = 0;
    let confidenceSum = 0;
    const sectorExposure = {};
    const regimeExposure = {};
    const clusterMap = new Map();
    activeIdeas.forEach((idea) => {
        const exposure = calculateIdeaExposure(idea);
        totalExposure += exposure;
        confidenceSum += idea.confidence_score ?? 0;
        if (idea.market_type === 'crypto') {
            cryptoExposure += exposure;
        }
        else {
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
    const normalizedExposure = clamp(totalExposure / config_1.config.portfolio.targetExposureScore, 0, 2);
    const correlationClusters = Array.from(clusterMap.entries())
        .filter(([, cluster]) => cluster.symbols.length > 1)
        .map(([cluster, value]) => ({ cluster, symbols: value.symbols, exposure: clamp(value.exposure, 0, 10) }))
        .sort((a, b) => b.exposure - a.exposure);
    const snapshot = {
        totalActiveExposure: Number(totalExposure.toFixed(2)),
        normalizedExposure: Number(normalizedExposure.toFixed(2)),
        stockExposure: Number(stockExposure.toFixed(2)),
        cryptoExposure: Number(cryptoExposure.toFixed(2)),
        cryptoAllocation: Number((cryptoExposure / Math.max(1, totalExposure) * 100).toFixed(1)),
        stockAllocation: Number((stockExposure / Math.max(1, totalExposure) * 100).toFixed(1)),
        sectorExposure,
        regimeExposure,
        correlationClusters,
        averageConfidence: activeIdeas.length > 0 ? Number((confidenceSum / activeIdeas.length).toFixed(1)) : 0,
        portfolioRiskLevel: 'LOW',
        activeTradeCount: activeIdeas.length,
    };
    snapshot.portfolioRiskLevel = calculatePortfolioRiskLevel(snapshot);
    return snapshot;
}
async function suggestPositionSizing(context) {
    const snapshot = await getPortfolioSnapshot();
    const baseSize = config_1.config.risk.maxRiskPerTradePct;
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
    const size = clamp(baseSize * confidenceBand * fakeoutPenalty * drawdownPenalty * volatilityPenalty * regimeMultiplier * exposureAdjustment, baseSize * 0.25, baseSize);
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
