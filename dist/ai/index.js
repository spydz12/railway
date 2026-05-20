"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestEngine = exports.SmartWatchlistGenerator = exports.NewsSentimentEngine = exports.PremarketScanner = exports.RelativeStrengthEngine = exports.AdaptiveAIStrategyEngine = exports.FakeBreakoutDetector = void 0;
// AI Module - Institutional-grade trading intelligence
var fakeBreakoutDetector_1 = require("./fakeBreakoutDetector");
Object.defineProperty(exports, "FakeBreakoutDetector", { enumerable: true, get: function () { return fakeBreakoutDetector_1.FakeBreakoutDetector; } });
var adaptiveEngine_1 = require("./adaptiveEngine");
Object.defineProperty(exports, "AdaptiveAIStrategyEngine", { enumerable: true, get: function () { return adaptiveEngine_1.AdaptiveAIStrategyEngine; } });
// Re-export from other modules for convenience
var relativeStrength_1 = require("../market/relativeStrength");
Object.defineProperty(exports, "RelativeStrengthEngine", { enumerable: true, get: function () { return relativeStrength_1.RelativeStrengthEngine; } });
var scanner_1 = require("../premarket/scanner");
Object.defineProperty(exports, "PremarketScanner", { enumerable: true, get: function () { return scanner_1.PremarketScanner; } });
var sentiment_1 = require("../news/sentiment");
Object.defineProperty(exports, "NewsSentimentEngine", { enumerable: true, get: function () { return sentiment_1.NewsSentimentEngine; } });
var generator_1 = require("../watchlist/generator");
Object.defineProperty(exports, "SmartWatchlistGenerator", { enumerable: true, get: function () { return generator_1.SmartWatchlistGenerator; } });
var engine_1 = require("../backtest/engine");
Object.defineProperty(exports, "BacktestEngine", { enumerable: true, get: function () { return engine_1.BacktestEngine; } });
