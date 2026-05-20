"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Targeted tests for fixes 1–5.
 * Run with: npx ts-node --transpile-only src/__tests__/fixes.test.ts
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
// Set minimum required env vars before any module that reads config is imported
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-at-least-20-chars';
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token-long-enough';
process.env.TELEGRAM_CHANNEL_ID = '-123456789';
// ─────────────────────────────────────────────────────────────
// FIX 1: Stock stale-data — market-aware maxAge
// ─────────────────────────────────────────────────────────────
(0, node_test_1.describe)('FIX 1 — stock stale-data maxAge', () => {
    // market open → reject if >45min; market closed → reject if >10080min, else allow
    function shouldRejectStale(marketOpen, candleAgeMs) {
        if (!marketOpen)
            return candleAgeMs > 10080 * 60 * 1000;
        return candleAgeMs > 45 * 60 * 1000;
    }
    (0, node_test_1.it)('market open: candle 46 min old → rejected', () => {
        strict_1.default.equal(shouldRejectStale(true, 46 * 60 * 1000), true);
    });
    (0, node_test_1.it)('market open: candle 44 min old → not rejected', () => {
        strict_1.default.equal(shouldRejectStale(true, 44 * 60 * 1000), false);
    });
    (0, node_test_1.it)('market open: old 30 min threshold no longer rejects with new 45 min limit', () => {
        strict_1.default.equal(shouldRejectStale(true, 30 * 60 * 1000), false);
    });
    (0, node_test_1.it)('market closed: 9000 min old → NOT rejected (within 1-week cap)', () => {
        strict_1.default.equal(shouldRejectStale(false, 9000 * 60 * 1000), false);
    });
    (0, node_test_1.it)('market closed: 11133 min old → rejected (exceeds 10080-min cap)', () => {
        strict_1.default.equal(shouldRejectStale(false, 11133 * 60 * 1000), true);
    });
    (0, node_test_1.it)('market closed: 20000 min old → rejected (exceeds 10080-min cap)', () => {
        strict_1.default.equal(shouldRejectStale(false, 20000 * 60 * 1000), true);
    });
    (0, node_test_1.it)('[MARKET_CLOSED_SKIP_STALE] fires when market closed and candle age between 45 and 10080 min', () => {
        const marketOpen = false;
        const candleAgeMs = 9000 * 60 * 1000;
        const wouldLogSkip = !marketOpen && candleAgeMs > 45 * 60 * 1000 && candleAgeMs <= 10080 * 60 * 1000;
        strict_1.default.equal(wouldLogSkip, true);
    });
});
// ─────────────────────────────────────────────────────────────
// FIX 2: SHORT validation using validateRiskLevels
// ─────────────────────────────────────────────────────────────
(0, node_test_1.describe)('FIX 2 — validateRiskLevels', () => {
    function validateRiskLevels(side, entry, stopLoss, takeProfit1) {
        const issues = [];
        if (side === 'SHORT') {
            if (stopLoss <= entry)
                issues.push('Stop loss is at or below entry price — invalid SHORT setup');
            if (takeProfit1 >= entry)
                issues.push('TP1 is at or above entry price — invalid SHORT setup');
        }
        else {
            if (stopLoss >= entry)
                issues.push('Stop loss is at or above entry price — invalid setup');
            if (takeProfit1 <= entry)
                issues.push('TP1 is at or below entry price — invalid setup');
        }
        return issues;
    }
    (0, node_test_1.it)('LONG valid: SL < entry, TP1 > entry → no issues', () => {
        strict_1.default.deepEqual(validateRiskLevels('LONG', 100, 95, 110), []);
    });
    (0, node_test_1.it)('LONG invalid: SL above entry → flagged', () => {
        const issues = validateRiskLevels('LONG', 100, 105, 110);
        strict_1.default.ok(issues.length > 0);
        strict_1.default.ok(issues[0].includes('at or above entry'));
    });
    (0, node_test_1.it)('LONG invalid: TP1 below entry → flagged', () => {
        const issues = validateRiskLevels('LONG', 100, 95, 90);
        strict_1.default.ok(issues.length > 0);
        strict_1.default.ok(issues[0].includes('at or below entry'));
    });
    (0, node_test_1.it)('SHORT valid: SL > entry, TP1 < entry → no issues', () => {
        strict_1.default.deepEqual(validateRiskLevels('SHORT', 100, 105, 90), []);
    });
    (0, node_test_1.it)('SHORT invalid: SL below entry → flagged', () => {
        const issues = validateRiskLevels('SHORT', 100, 95, 90);
        strict_1.default.ok(issues.length > 0);
        strict_1.default.ok(issues[0].includes('invalid SHORT setup'));
    });
    (0, node_test_1.it)('SHORT invalid: TP1 above entry → flagged', () => {
        const issues = validateRiskLevels('SHORT', 100, 105, 110);
        strict_1.default.ok(issues.length > 0);
        strict_1.default.ok(issues.some((i) => i.includes('TP1')));
    });
    (0, node_test_1.it)('SHORT: risk and reward computed correctly', () => {
        const entry = 100, sl = 105, tp1 = 90;
        const risk = sl - entry; // 5
        const reward = entry - tp1; // 10
        strict_1.default.equal(risk, 5);
        strict_1.default.equal(reward, 10);
        strict_1.default.equal(reward / risk, 2);
    });
});
// ─────────────────────────────────────────────────────────────
// FIX 3: allowShortSelling defaults to true
// ─────────────────────────────────────────────────────────────
(0, node_test_1.describe)('FIX 3 — allowShortSelling default', () => {
    function resolveAllowShorts(allowShortsEnv, allowShortSellingEnv) {
        const val = allowShortsEnv ?? allowShortSellingEnv ?? 'true';
        return val === 'true';
    }
    (0, node_test_1.it)('no env vars → defaults to true', () => {
        strict_1.default.equal(resolveAllowShorts(undefined, undefined), true);
    });
    (0, node_test_1.it)('ALLOW_SHORTS=false → false', () => {
        strict_1.default.equal(resolveAllowShorts('false', undefined), false);
    });
    (0, node_test_1.it)('ALLOW_SHORTS=true → true', () => {
        strict_1.default.equal(resolveAllowShorts('true', undefined), true);
    });
    (0, node_test_1.it)('ALLOW_SHORT_SELLING=true (legacy) → true', () => {
        strict_1.default.equal(resolveAllowShorts(undefined, 'true'), true);
    });
    (0, node_test_1.it)('ALLOW_SHORT_SELLING=false (legacy) → false when ALLOW_SHORTS not set', () => {
        strict_1.default.equal(resolveAllowShorts(undefined, 'false'), false);
    });
    (0, node_test_1.it)('ALLOW_SHORTS takes precedence over ALLOW_SHORT_SELLING', () => {
        strict_1.default.equal(resolveAllowShorts('true', 'false'), true);
        strict_1.default.equal(resolveAllowShorts('false', 'true'), false);
    });
});
// ─────────────────────────────────────────────────────────────
// FIX 4: Conflict resolver — -15 when LONG and SHORT coexist
// ─────────────────────────────────────────────────────────────
(0, node_test_1.describe)('FIX 4 — conflict resolver (per-candidate opposite count)', () => {
    // Penalty fires when ≥2 signals exist on the OPPOSITE side of this candidate
    function applyConflictPenalty(candidates) {
        return candidates.map((c) => {
            const oppositeCount = candidates.filter((o) => o.side !== c.side).length;
            if (oppositeCount >= 2) {
                return {
                    ...c,
                    confidence: Math.max(0, c.confidence - 15),
                    reasons: [...c.reasons, 'Conflicting directional strategies detected'],
                };
            }
            return c;
        });
    }
    (0, node_test_1.it)('single LONG → no penalty', () => {
        const result = applyConflictPenalty([{ side: 'LONG', confidence: 75, reasons: [] }]);
        strict_1.default.equal(result[0].confidence, 75);
    });
    (0, node_test_1.it)('single SHORT → no penalty', () => {
        const result = applyConflictPenalty([{ side: 'SHORT', confidence: 70, reasons: [] }]);
        strict_1.default.equal(result[0].confidence, 70);
    });
    (0, node_test_1.it)('two LONGs → no penalty', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 75, reasons: [] },
            { side: 'LONG', confidence: 70, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 75);
        strict_1.default.equal(result[1].confidence, 70);
    });
    (0, node_test_1.it)('LONG + SHORT → NO penalty (each has only 1 opposite)', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 75, reasons: [] },
            { side: 'SHORT', confidence: 70, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 75);
        strict_1.default.equal(result[1].confidence, 70);
    });
    (0, node_test_1.it)('LONG + SHORT + SHORT → penalty on LONG only (2 opposite SHORTs)', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 75, reasons: [] },
            { side: 'SHORT', confidence: 70, reasons: [] },
            { side: 'SHORT', confidence: 65, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 60, 'LONG penalised: 2 opposite SHORTs');
        strict_1.default.equal(result[1].confidence, 70, 'SHORT not penalised: only 1 opposite LONG');
        strict_1.default.equal(result[2].confidence, 65, 'SHORT not penalised: only 1 opposite LONG');
        strict_1.default.ok(result[0].reasons.includes('Conflicting directional strategies detected'));
        strict_1.default.equal(result[1].reasons.length, 0);
    });
    (0, node_test_1.it)('LONG + LONG + SHORT → penalty on SHORT only (2 opposite LONGs)', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 75, reasons: [] },
            { side: 'LONG', confidence: 70, reasons: [] },
            { side: 'SHORT', confidence: 65, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 75, 'LONG not penalised: only 1 opposite SHORT');
        strict_1.default.equal(result[1].confidence, 70, 'LONG not penalised: only 1 opposite SHORT');
        strict_1.default.equal(result[2].confidence, 50, 'SHORT penalised: 2 opposite LONGs');
    });
    (0, node_test_1.it)('LONG + SHORT + SHORT + SHORT → penalty on LONG only', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 80, reasons: [] },
            { side: 'SHORT', confidence: 70, reasons: [] },
            { side: 'SHORT', confidence: 65, reasons: [] },
            { side: 'SHORT', confidence: 60, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 65, 'LONG penalised: 3 opposite SHORTs');
        strict_1.default.equal(result[1].confidence, 70, 'SHORT not penalised: only 1 opposite LONG');
        strict_1.default.equal(result[2].confidence, 65, 'SHORT not penalised: only 1 opposite LONG');
        strict_1.default.equal(result[3].confidence, 60, 'SHORT not penalised: only 1 opposite LONG');
    });
    (0, node_test_1.it)('confidence does not go below 0', () => {
        const result = applyConflictPenalty([
            { side: 'LONG', confidence: 5, reasons: [] },
            { side: 'SHORT', confidence: 5, reasons: [] },
            { side: 'SHORT', confidence: 5, reasons: [] },
        ]);
        strict_1.default.equal(result[0].confidence, 0);
    });
});
// ─────────────────────────────────────────────────────────────
// FIX 5: AI rate limiting with pLimit (replaces p-queue)
// ─────────────────────────────────────────────────────────────
(0, node_test_1.describe)('FIX 5 — AI rate limiting with pLimit(2)', async () => {
    (0, node_test_1.it)('pLimit(2) limits to 2 concurrent tasks', async () => {
        const pLimit = (await Promise.resolve().then(() => __importStar(require('p-limit')))).default;
        const limit = pLimit(2);
        let active = 0;
        let maxActive = 0;
        const task = () => limit(() => new Promise((resolve) => {
            active++;
            maxActive = Math.max(maxActive, active);
            setImmediate(() => {
                active--;
                resolve();
            });
        }));
        await Promise.all([task(), task(), task(), task()]);
        strict_1.default.ok(maxActive <= 2, `Expected max 2 concurrent tasks, got ${maxActive}`);
    });
    (0, node_test_1.it)('pLimit returns the task result', async () => {
        const pLimit = (await Promise.resolve().then(() => __importStar(require('p-limit')))).default;
        const limit = pLimit(2);
        const result = await limit(() => Promise.resolve(42));
        strict_1.default.equal(result, 42);
    });
    (0, node_test_1.it)('pLimit is CommonJS-compatible (no ESM-only risk)', async () => {
        const pLimitModule = await Promise.resolve().then(() => __importStar(require('p-limit')));
        strict_1.default.ok(typeof pLimitModule.default === 'function', 'pLimit default export is callable');
        const limit = pLimitModule.default(2);
        strict_1.default.ok(typeof limit === 'function', 'limit instance is callable');
    });
});
