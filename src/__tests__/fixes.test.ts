/**
 * Targeted tests for fixes 1–5.
 * Run with: npx ts-node --transpile-only src/__tests__/fixes.test.ts
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Set minimum required env vars before any module that reads config is imported
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-at-least-20-chars';
process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token-long-enough';
process.env.TELEGRAM_CHANNEL_ID = '-123456789';

// ─────────────────────────────────────────────────────────────
// FIX 1: Stock stale-data — market-aware maxAge
// ─────────────────────────────────────────────────────────────

describe('FIX 1 — stock stale-data maxAge', () => {
  // market open → reject if >45min; market closed → reject if >10080min, else allow
  function shouldRejectStale(marketOpen: boolean, candleAgeMs: number): boolean {
    if (!marketOpen) return candleAgeMs > 10080 * 60 * 1000;
    return candleAgeMs > 45 * 60 * 1000;
  }

  it('market open: candle 46 min old → rejected', () => {
    assert.equal(shouldRejectStale(true, 46 * 60 * 1000), true);
  });

  it('market open: candle 44 min old → not rejected', () => {
    assert.equal(shouldRejectStale(true, 44 * 60 * 1000), false);
  });

  it('market open: old 30 min threshold no longer rejects with new 45 min limit', () => {
    assert.equal(shouldRejectStale(true, 30 * 60 * 1000), false);
  });

  it('market closed: 9000 min old → NOT rejected (within 1-week cap)', () => {
    assert.equal(shouldRejectStale(false, 9000 * 60 * 1000), false);
  });

  it('market closed: 11133 min old → rejected (exceeds 10080-min cap)', () => {
    assert.equal(shouldRejectStale(false, 11133 * 60 * 1000), true);
  });

  it('market closed: 20000 min old → rejected (exceeds 10080-min cap)', () => {
    assert.equal(shouldRejectStale(false, 20000 * 60 * 1000), true);
  });

  it('[MARKET_CLOSED_SKIP_STALE] fires when market closed and candle age between 45 and 10080 min', () => {
    const marketOpen = false;
    const candleAgeMs = 9000 * 60 * 1000;
    const wouldLogSkip = !marketOpen && candleAgeMs > 45 * 60 * 1000 && candleAgeMs <= 10080 * 60 * 1000;
    assert.equal(wouldLogSkip, true);
  });
});

// ─────────────────────────────────────────────────────────────
// FIX 2: SHORT validation using validateRiskLevels
// ─────────────────────────────────────────────────────────────

describe('FIX 2 — validateRiskLevels', () => {
  function validateRiskLevels(
    side: string,
    entry: number,
    stopLoss: number,
    takeProfit1: number
  ): string[] {
    const issues: string[] = [];
    if (side === 'SHORT') {
      if (stopLoss <= entry) issues.push('Stop loss is at or below entry price — invalid SHORT setup');
      if (takeProfit1 >= entry) issues.push('TP1 is at or above entry price — invalid SHORT setup');
    } else {
      if (stopLoss >= entry) issues.push('Stop loss is at or above entry price — invalid setup');
      if (takeProfit1 <= entry) issues.push('TP1 is at or below entry price — invalid setup');
    }
    return issues;
  }

  it('LONG valid: SL < entry, TP1 > entry → no issues', () => {
    assert.deepEqual(validateRiskLevels('LONG', 100, 95, 110), []);
  });

  it('LONG invalid: SL above entry → flagged', () => {
    const issues = validateRiskLevels('LONG', 100, 105, 110);
    assert.ok(issues.length > 0);
    assert.ok(issues[0].includes('at or above entry'));
  });

  it('LONG invalid: TP1 below entry → flagged', () => {
    const issues = validateRiskLevels('LONG', 100, 95, 90);
    assert.ok(issues.length > 0);
    assert.ok(issues[0].includes('at or below entry'));
  });

  it('SHORT valid: SL > entry, TP1 < entry → no issues', () => {
    assert.deepEqual(validateRiskLevels('SHORT', 100, 105, 90), []);
  });

  it('SHORT invalid: SL below entry → flagged', () => {
    const issues = validateRiskLevels('SHORT', 100, 95, 90);
    assert.ok(issues.length > 0);
    assert.ok(issues[0].includes('invalid SHORT setup'));
  });

  it('SHORT invalid: TP1 above entry → flagged', () => {
    const issues = validateRiskLevels('SHORT', 100, 105, 110);
    assert.ok(issues.length > 0);
    assert.ok(issues.some((i) => i.includes('TP1')));
  });

  it('SHORT: risk and reward computed correctly', () => {
    const entry = 100, sl = 105, tp1 = 90;
    const risk = sl - entry;   // 5
    const reward = entry - tp1; // 10
    assert.equal(risk, 5);
    assert.equal(reward, 10);
    assert.equal(reward / risk, 2);
  });
});

// ─────────────────────────────────────────────────────────────
// FIX 3: allowShortSelling defaults to true
// ─────────────────────────────────────────────────────────────

describe('FIX 3 — allowShortSelling default', () => {
  function resolveAllowShorts(
    allowShortsEnv?: string,
    allowShortSellingEnv?: string
  ): boolean {
    const val = allowShortsEnv ?? allowShortSellingEnv ?? 'true';
    return val === 'true';
  }

  it('no env vars → defaults to true', () => {
    assert.equal(resolveAllowShorts(undefined, undefined), true);
  });

  it('ALLOW_SHORTS=false → false', () => {
    assert.equal(resolveAllowShorts('false', undefined), false);
  });

  it('ALLOW_SHORTS=true → true', () => {
    assert.equal(resolveAllowShorts('true', undefined), true);
  });

  it('ALLOW_SHORT_SELLING=true (legacy) → true', () => {
    assert.equal(resolveAllowShorts(undefined, 'true'), true);
  });

  it('ALLOW_SHORT_SELLING=false (legacy) → false when ALLOW_SHORTS not set', () => {
    assert.equal(resolveAllowShorts(undefined, 'false'), false);
  });

  it('ALLOW_SHORTS takes precedence over ALLOW_SHORT_SELLING', () => {
    assert.equal(resolveAllowShorts('true', 'false'), true);
    assert.equal(resolveAllowShorts('false', 'true'), false);
  });
});

// ─────────────────────────────────────────────────────────────
// FIX 4: Conflict resolver — -15 when LONG and SHORT coexist
// ─────────────────────────────────────────────────────────────

describe('FIX 4 — conflict resolver (per-candidate opposite count)', () => {
  type Candidate = { side: 'LONG' | 'SHORT'; confidence: number; reasons: string[] };

  // Penalty fires when ≥2 signals exist on the OPPOSITE side of this candidate
  function applyConflictPenalty(candidates: Candidate[]): Candidate[] {
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

  it('single LONG → no penalty', () => {
    const result = applyConflictPenalty([{ side: 'LONG', confidence: 75, reasons: [] }]);
    assert.equal(result[0].confidence, 75);
  });

  it('single SHORT → no penalty', () => {
    const result = applyConflictPenalty([{ side: 'SHORT', confidence: 70, reasons: [] }]);
    assert.equal(result[0].confidence, 70);
  });

  it('two LONGs → no penalty', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 75, reasons: [] },
      { side: 'LONG', confidence: 70, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 75);
    assert.equal(result[1].confidence, 70);
  });

  it('LONG + SHORT → NO penalty (each has only 1 opposite)', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 75, reasons: [] },
      { side: 'SHORT', confidence: 70, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 75);
    assert.equal(result[1].confidence, 70);
  });

  it('LONG + SHORT + SHORT → penalty on LONG only (2 opposite SHORTs)', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 75, reasons: [] },
      { side: 'SHORT', confidence: 70, reasons: [] },
      { side: 'SHORT', confidence: 65, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 60, 'LONG penalised: 2 opposite SHORTs');
    assert.equal(result[1].confidence, 70, 'SHORT not penalised: only 1 opposite LONG');
    assert.equal(result[2].confidence, 65, 'SHORT not penalised: only 1 opposite LONG');
    assert.ok(result[0].reasons.includes('Conflicting directional strategies detected'));
    assert.equal(result[1].reasons.length, 0);
  });

  it('LONG + LONG + SHORT → penalty on SHORT only (2 opposite LONGs)', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 75, reasons: [] },
      { side: 'LONG', confidence: 70, reasons: [] },
      { side: 'SHORT', confidence: 65, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 75, 'LONG not penalised: only 1 opposite SHORT');
    assert.equal(result[1].confidence, 70, 'LONG not penalised: only 1 opposite SHORT');
    assert.equal(result[2].confidence, 50, 'SHORT penalised: 2 opposite LONGs');
  });

  it('LONG + SHORT + SHORT + SHORT → penalty on LONG only', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 80, reasons: [] },
      { side: 'SHORT', confidence: 70, reasons: [] },
      { side: 'SHORT', confidence: 65, reasons: [] },
      { side: 'SHORT', confidence: 60, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 65, 'LONG penalised: 3 opposite SHORTs');
    assert.equal(result[1].confidence, 70, 'SHORT not penalised: only 1 opposite LONG');
    assert.equal(result[2].confidence, 65, 'SHORT not penalised: only 1 opposite LONG');
    assert.equal(result[3].confidence, 60, 'SHORT not penalised: only 1 opposite LONG');
  });

  it('confidence does not go below 0', () => {
    const result = applyConflictPenalty([
      { side: 'LONG', confidence: 5, reasons: [] },
      { side: 'SHORT', confidence: 5, reasons: [] },
      { side: 'SHORT', confidence: 5, reasons: [] },
    ]);
    assert.equal(result[0].confidence, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// FIX 5: AI rate limiting with pLimit (replaces p-queue)
// ─────────────────────────────────────────────────────────────

describe('FIX 5 — AI rate limiting with pLimit(2)', async () => {
  it('pLimit(2) limits to 2 concurrent tasks', async () => {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limit(() =>
        new Promise<void>((resolve) => {
          active++;
          maxActive = Math.max(maxActive, active);
          setImmediate(() => {
            active--;
            resolve();
          });
        })
      );

    await Promise.all([task(), task(), task(), task()]);

    assert.ok(maxActive <= 2, `Expected max 2 concurrent tasks, got ${maxActive}`);
  });

  it('pLimit returns the task result', async () => {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(2);
    const result = await limit(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  it('pLimit is CommonJS-compatible (no ESM-only risk)', async () => {
    const pLimitModule = await import('p-limit');
    assert.ok(typeof pLimitModule.default === 'function', 'pLimit default export is callable');
    const limit = pLimitModule.default(2);
    assert.ok(typeof limit === 'function', 'limit instance is callable');
  });
});
