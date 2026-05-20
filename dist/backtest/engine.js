"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestEngine = void 0;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('backtest:engine');
class BacktestEngine {
    /**
     * Runs a comprehensive backtest for a strategy
     */
    async runBacktest(strategyFunction, symbol, candles, config) {
        log.info(`Starting backtest for ${symbol}: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
        // Filter candles by date range
        const filteredCandles = candles.filter(candle => new Date(candle.time) >= config.startDate && new Date(candle.time) <= config.endDate);
        if (filteredCandles.length < 100) {
            throw new Error('Insufficient data for backtest period');
        }
        // Run strategy on historical data
        const signals = await strategyFunction(filteredCandles, symbol);
        // Execute trades based on signals
        const trades = this.executeTrades(signals, filteredCandles, config);
        // Calculate performance metrics
        const result = this.calculatePerformanceMetrics(trades, config);
        log.info(`Backtest completed: ${result.totalTrades} trades, ${result.totalReturn.toFixed(2)}% return`);
        return result;
    }
    /**
     * Runs multiple strategies in parallel for comparison
     */
    async runStrategyComparison(strategies, symbol, candles, config) {
        const results = new Map();
        const promises = strategies.map(async (strategy) => {
            try {
                const result = await this.runBacktest(strategy.function, symbol, candles, config);
                results.set(strategy.name, result);
            }
            catch (error) {
                log.error(`Backtest failed for ${strategy.name}:`, error);
            }
        });
        await Promise.all(promises);
        return results;
    }
    /**
     * Executes trades based on strategy signals
     */
    executeTrades(signals, candles, config) {
        const trades = [];
        let capital = config.initialCapital;
        let openPositions = 0;
        // Sort signals by candle time (assuming signals correspond to candle order)
        signals.sort((a, b) => {
            const aIndex = signals.indexOf(a);
            const bIndex = signals.indexOf(b);
            return aIndex - bIndex; // Maintain original order if no timestamp
        });
        for (let i = 0; i < signals.length; i++) {
            const signal = signals[i];
            // Skip if maximum positions reached
            if (openPositions >= config.maxPositions)
                continue;
            // Find the corresponding candle (assume signals are in same order as recent candles)
            const signalCandle = candles[Math.max(0, candles.length - signals.length + i)];
            if (!signalCandle)
                continue;
            // Calculate position size
            const positionSize = Math.min(config.maxPositionSize * capital / 100, capital * 0.1 // Maximum 10% of capital per trade
            );
            const quantity = Math.floor(positionSize / signalCandle.close);
            if (quantity === 0)
                continue;
            // Apply slippage and commission
            const entryPrice = signalCandle.close * (1 + config.slippage / 100);
            const commission = config.commission * 2; // Round trip
            // Find exit condition (simplified - exit after holding period or stop loss)
            const exitIndex = this.findExitPoint(candles, signalCandle, signal, config);
            if (exitIndex === -1)
                continue;
            const exitCandle = candles[exitIndex];
            const exitPrice = exitCandle.close * (1 - config.slippage / 100);
            // Calculate P&L
            const grossPnl = (exitPrice - entryPrice) * quantity;
            const netPnl = grossPnl - commission;
            const pnlPercent = (netPnl / positionSize) * 100;
            const trade = {
                entryDate: new Date(signalCandle.time),
                exitDate: new Date(exitCandle.time),
                symbol: signal.symbol,
                side: 'long', // Assuming long for now
                entryPrice,
                exitPrice,
                quantity,
                pnl: netPnl,
                pnlPercent,
                holdingPeriod: Math.ceil((exitCandle.time - signalCandle.time) / (1000 * 60 * 60 * 24)),
                strategy: signal.strategy,
                reason: signal.reason || signal.reasons.join(', ')
            };
            trades.push(trade);
            capital += netPnl;
            openPositions = Math.max(0, openPositions - 1); // Simplified position tracking
        }
        return trades;
    }
    /**
     * Finds exit point for a trade (simplified implementation)
     */
    findExitPoint(candles, entryCandle, signal, config) {
        const entryIndex = candles.findIndex(c => c.time === entryCandle.time);
        if (entryIndex === -1)
            return -1;
        const maxHoldPeriod = 20; // Maximum 20 days hold
        const stopLossPercent = 0.05; // 5% stop loss
        const takeProfitPercent = 0.10; // 10% take profit
        for (let i = entryIndex + 1; i < Math.min(candles.length, entryIndex + maxHoldPeriod); i++) {
            const currentPrice = candles[i].close;
            const priceChange = (currentPrice - entryCandle.close) / entryCandle.close;
            // Check stop loss
            if (priceChange <= -stopLossPercent) {
                return i;
            }
            // Check take profit
            if (priceChange >= takeProfitPercent) {
                return i;
            }
            // Check if signal is no longer valid (simplified)
            if (signal.stopLoss && currentPrice <= signal.stopLoss) {
                return i;
            }
        }
        // Exit at end of hold period
        return Math.min(candles.length - 1, entryIndex + maxHoldPeriod - 1);
    }
    /**
     * Calculates comprehensive performance metrics
     */
    calculatePerformanceMetrics(trades, config) {
        if (trades.length === 0) {
            return {
                totalReturn: 0,
                annualizedReturn: 0,
                maxDrawdown: 0,
                winRate: 0,
                profitFactor: 0,
                totalTrades: 0,
                avgTradeReturn: 0,
                sharpeRatio: 0,
                calmarRatio: 0,
                trades: [],
                equityCurve: [],
                monthlyReturns: []
            };
        }
        // Calculate basic metrics
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        const totalReturn = (trades.reduce((sum, t) => sum + t.pnl, 0) / config.initialCapital) * 100;
        const winRate = (winningTrades.length / trades.length) * 100;
        const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
        const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
        const avgTradeReturn = trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length;
        // Calculate equity curve
        const equityCurve = this.calculateEquityCurve(trades, config);
        // Calculate drawdown
        const maxDrawdown = this.calculateMaxDrawdown(equityCurve);
        // Calculate annualized return
        const days = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);
        const years = days / 365;
        const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : 0;
        // Calculate Sharpe ratio (simplified - assuming 0% risk-free rate)
        const returns = equityCurve.slice(1).map((point, i) => (point.equity - equityCurve[i].equity) / equityCurve[i].equity);
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
        const sharpeRatio = stdDev > 0 ? avgReturn / stdDev * Math.sqrt(252) : 0;
        // Calculate Calmar ratio
        const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;
        // Calculate monthly returns
        const monthlyReturns = this.calculateMonthlyReturns(trades, config);
        return {
            totalReturn,
            annualizedReturn,
            maxDrawdown,
            winRate,
            profitFactor,
            totalTrades: trades.length,
            avgTradeReturn,
            sharpeRatio,
            calmarRatio,
            trades,
            equityCurve,
            monthlyReturns
        };
    }
    /**
     * Calculates equity curve over time
     */
    calculateEquityCurve(trades, config) {
        const curve = [];
        let equity = config.initialCapital;
        curve.push({ date: config.startDate, equity });
        // Sort trades by exit date
        const sortedTrades = [...trades].sort((a, b) => a.exitDate.getTime() - b.exitDate.getTime());
        for (const trade of sortedTrades) {
            equity += trade.pnl;
            curve.push({ date: trade.exitDate, equity });
        }
        // Fill in the end date if not already there
        if (curve[curve.length - 1].date.getTime() !== config.endDate.getTime()) {
            curve.push({ date: config.endDate, equity });
        }
        return curve;
    }
    /**
     * Calculates maximum drawdown from equity curve
     */
    calculateMaxDrawdown(equityCurve) {
        let maxDrawdown = 0;
        let peak = equityCurve[0].equity;
        for (const point of equityCurve) {
            if (point.equity > peak) {
                peak = point.equity;
            }
            const drawdown = (peak - point.equity) / peak * 100;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        return maxDrawdown;
    }
    /**
     * Calculates monthly returns
     */
    calculateMonthlyReturns(trades, config) {
        const monthlyPnL = new Map();
        for (const trade of trades) {
            const monthKey = `${trade.exitDate.getFullYear()}-${String(trade.exitDate.getMonth() + 1).padStart(2, '0')}`;
            monthlyPnL.set(monthKey, (monthlyPnL.get(monthKey) || 0) + trade.pnl);
        }
        const monthlyReturns = [];
        for (const [month, pnl] of monthlyPnL) {
            const returnPct = (pnl / config.initialCapital) * 100;
            monthlyReturns.push({ month, return: returnPct });
        }
        return monthlyReturns.sort((a, b) => a.month.localeCompare(b.month));
    }
    /**
     * Generates a performance report
     */
    generateReport(result) {
        const report = [
            '=== BACKTEST PERFORMANCE REPORT ===',
            '',
            `Total Return: ${result.totalReturn.toFixed(2)}%`,
            `Annualized Return: ${result.annualizedReturn.toFixed(2)}%`,
            `Max Drawdown: ${result.maxDrawdown.toFixed(2)}%`,
            `Win Rate: ${result.winRate.toFixed(1)}%`,
            `Profit Factor: ${result.profitFactor.toFixed(2)}`,
            `Total Trades: ${result.totalTrades}`,
            `Average Trade Return: ${result.avgTradeReturn.toFixed(2)}%`,
            `Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`,
            `Calmar Ratio: ${result.calmarRatio.toFixed(2)}`,
            '',
            '=== TRADE ANALYSIS ===',
            `Winning Trades: ${result.trades.filter(t => t.pnl > 0).length}`,
            `Losing Trades: ${result.trades.filter(t => t.pnl < 0).length}`,
            `Average Holding Period: ${result.trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / result.trades.length} days`,
            '',
            '=== MONTHLY RETURNS ===',
            ...result.monthlyReturns.map(m => `${m.month}: ${m.return.toFixed(2)}%`),
            '',
            '=== BEST/WORST TRADES ===',
            ...result.trades
                .sort((a, b) => b.pnlPercent - a.pnlPercent)
                .slice(0, 3)
                .map(t => `Best: ${t.symbol} ${t.pnlPercent.toFixed(2)}% (${t.holdingPeriod}d)`),
            '',
            ...result.trades
                .sort((a, b) => a.pnlPercent - b.pnlPercent)
                .slice(0, 3)
                .map(t => `Worst: ${t.symbol} ${t.pnlPercent.toFixed(2)}% (${t.holdingPeriod}d)`)
        ];
        return report.join('\n');
    }
    /**
     * Validates backtest configuration
     */
    validateConfig(config) {
        const errors = [];
        if (config.initialCapital <= 0) {
            errors.push('Initial capital must be positive');
        }
        if (config.commission < 0) {
            errors.push('Commission cannot be negative');
        }
        if (config.slippage < 0) {
            errors.push('Slippage cannot be negative');
        }
        if (config.maxPositionSize <= 0 || config.maxPositionSize > 100) {
            errors.push('Max position size must be between 0 and 100');
        }
        if (config.maxPositions <= 0) {
            errors.push('Max positions must be positive');
        }
        if (config.startDate >= config.endDate) {
            errors.push('Start date must be before end date');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
}
exports.BacktestEngine = BacktestEngine;
