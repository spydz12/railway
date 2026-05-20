"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRiskProfile = calculateRiskProfile;
exports.applyRiskRules = applyRiskRules;
const indicators_1 = require("../utils/indicators");
const config_1 = require("../config");
function calculateRiskProfile(result) {
    const entryPrice = result.entry || result.entryPrice || 0;
    const risk = entryPrice - result.stopLoss;
    const reward = result.takeProfit1 - entryPrice;
    const riskRewardRatio = risk > 0 ? (0, indicators_1.round2)(reward / risk) : 0;
    const riskPct = entryPrice > 0 ? (0, indicators_1.round2)((risk / entryPrice) * 100) : 0;
    // Hard limit: stop loss must never be more than 5% from entry.
    // This prevents extremely wide stops that can result from bad ATR values
    // or mis-calculated levels.
    const MAX_STOP_PCT = 5.0;
    const isAcceptable = riskRewardRatio >= config_1.config.risk.minRiskReward &&
        riskPct > 0 &&
        riskPct <= MAX_STOP_PCT;
    return { riskRewardRatio, riskPct, isAcceptable };
}
function applyRiskRules(result) {
    const profile = calculateRiskProfile(result);
    if (!profile.isAcceptable)
        return { ...result, valid: false };
    return result;
}
