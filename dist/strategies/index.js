"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_RESULT = void 0;
exports.getEnabledStrategies = getEnabledStrategies;
exports.getStrategyBySlug = getStrategyBySlug;
const trendPullback_1 = require("./trendPullback");
const breakoutVolume_1 = require("./breakoutVolume");
const supportBounce_1 = require("./supportBounce");
const vwap_1 = require("./vwap");
const orb_1 = require("./orb");
const trend_1 = require("./trend");
const meanReversion_1 = require("./meanReversion");
const config_1 = require("../config");
var base_1 = require("./base");
Object.defineProperty(exports, "EMPTY_RESULT", { enumerable: true, get: function () { return base_1.EMPTY_RESULT; } });
const ALL_STRATEGIES = [
    new trendPullback_1.TrendPullbackStrategy(),
    new breakoutVolume_1.BreakoutVolumeStrategy(),
    new supportBounce_1.SupportBounceStrategy(),
    new vwap_1.VWAPReclaimStrategy(),
    new orb_1.ORBStrategy(),
    new trend_1.EMACloudTrendStrategy(),
    new meanReversion_1.MeanReversionStrategy(),
];
function getEnabledStrategies() {
    const enabled = config_1.config.scanner.enabledStrategies;
    return ALL_STRATEGIES.filter((s) => enabled.includes(s.slug));
}
function getStrategyBySlug(slug) {
    return ALL_STRATEGIES.find((s) => s.slug === slug);
}
