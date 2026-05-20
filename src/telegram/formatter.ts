import { TradeIdea } from '../database/queries';
import { TrackingEvent } from '../tracking/monitor';
import { round2 } from '../utils/indicators';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('telegram:formatter');

// Escape HTML special characters to prevent Telegram HTML parse errors.
// This is critical for any user-controlled or dynamic content (company names,
// reason strings, ticker symbols) that could contain <, >, &, or ".
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Multilingual-ready: all text goes through these formatters.
// Add FR/AR implementations by exporting per-locale versions later.

export function formatNewIdeaMessage(idea: TradeIdea): string {
  // Normalize direction to LONG/SHORT for display
  const dir = idea.direction === 'BUY' || idea.direction === 'LONG' ? 'LONG' : 'SHORT';

  const entryLine =
    idea.entry_zone_low && idea.entry_zone_high
      ? `$${idea.entry_zone_low} – $${idea.entry_zone_high}`
      : `$${idea.entry_price}`;

  const tp2Line = idea.take_profit_2 ? `\nTP2: <b>$${idea.take_profit_2}</b>` : '';
  const tp3Line = idea.take_profit_3 ? `\nTP3: <b>$${idea.take_profit_3}</b>` : '';
  const trailingLine = idea.trailing_rule
    ? `\n<i>Trailing: ${esc(idea.trailing_rule)}</i>`
    : '';
  const companyLine = idea.company_name ? ` (${esc(idea.company_name)})` : '';

  const marketType = idea.market_type || 'stocks';
  const marketTypeLabel = marketType.toUpperCase();
  const marketExchange = idea.exchange ? ` (${esc(idea.exchange.toUpperCase())})` : '';

  const strategyName = idea.strategy_slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Quality badge
  let qualityBadge = 'STANDARD';
  if (idea.signal_quality === 'HIGH' || idea.signal_quality === 'HIGH_QUALITY' || idea.confidence_score >= 70) {
    qualityBadge = 'HIGH';
  } else if (idea.signal_quality === 'MEDIUM' || idea.confidence_score >= 55) {
    qualityBadge = 'MEDIUM';
  } else if (idea.signal_quality === 'WATCH' || idea.confidence_score >= 45) {
    qualityBadge = 'WATCH';
  }

  // Filter reasons: exclude any containing 'validation', 'test', or 'audit' (case-insensitive)
  const EXCLUDED_KEYWORDS = /\b(validation|test|audit)\b/i;
  const filteredReasons = Array.isArray(idea.reasons)
    ? idea.reasons.filter((r) => !EXCLUDED_KEYWORDS.test(r))
    : [];
  const fallbackReason =
    idea.reason && !EXCLUDED_KEYWORDS.test(idea.reason) ? idea.reason : null;
  const reasonsText =
    filteredReasons.length > 0
      ? filteredReasons.map((r) => `• ${esc(r)}`).join('\n')
      : fallbackReason
        ? `• ${esc(fallbackReason)}`
        : '';
  const reasonsBlock = reasonsText ? `\n\n💡 <b>Reasons</b>\n${reasonsText}` : '';

  // Invalidation block: hide entirely if empty
  const invalidationBlock =
    idea.invalidation_rule && idea.invalidation_rule.trim()
      ? `\n\n⚠️ <b>Invalidation</b>\n${esc(idea.invalidation_rule)}`
      : '';

  // AI Analysis: bullet-point format showing market reasoning, setup, and trigger
  let aiSection = '';
  if (idea.ai_decision && idea.ai_summary) {
    const bullets: string[] = [];
    if (idea.ai_approval_reasons && idea.ai_approval_reasons.length > 0) {
      bullets.push(...idea.ai_approval_reasons.map((r) => `• ${esc(r)}`));
    } else {
      bullets.push(`• ${esc(idea.ai_summary)}`);
    }
    if (idea.ai_risk_warnings && idea.ai_risk_warnings.length > 0) {
      bullets.push(...idea.ai_risk_warnings.map((r) => `⚠️ ${esc(r)}`));
    }
    if (idea.ai_suggested_action) {
      bullets.push(`→ ${esc(idea.ai_suggested_action)}`);
    }
    aiSection = `\n\n🧠 <b>AI Analysis</b>\n${bullets.join('\n')}`;
  }

  // Enterprise risk and execution metadata
  const portfolioRiskLabel = (idea as any).portfolioRiskLabel ? esc((idea as any).portfolioRiskLabel) : null;
  const riskGuardState = (idea as any).riskGuardState ? esc((idea as any).riskGuardState) : null;
  const sessionContext = (idea as any).sessionContext ? (idea as any).sessionContext : null;
  const marketStressLevel = (idea as any).marketStressLevel ? esc((idea as any).marketStressLevel) : null;
  const reinforcementScore = typeof (idea as any).reinforcementScore === 'number' ? `${(idea as any).reinforcementScore}%` : null;
  const suggestedPositionSizing = (idea as any).suggestedPositionSizing ? (idea as any).suggestedPositionSizing : null;
  const executionQuality = (idea as any).executionQuality ? (idea as any).executionQuality : null;

  const enterpriseSectionParts: string[] = [];
  if (portfolioRiskLabel) enterpriseSectionParts.push(`Portfolio Risk: <b>${portfolioRiskLabel}</b>`);
  if (riskGuardState) enterpriseSectionParts.push(`Risk Guard: <b>${riskGuardState}</b>`);
  if (sessionContext) enterpriseSectionParts.push(`Session: <b>${esc(sessionContext.session)}</b> — ${esc(sessionContext.description)}`);
  if (marketStressLevel) enterpriseSectionParts.push(`Market Stress: <b>${marketStressLevel}</b>`);
  if (reinforcementScore) enterpriseSectionParts.push(`Reinforcement: <b>${reinforcementScore}</b>`);
  if (executionQuality) enterpriseSectionParts.push(`Execution Slippage: <b>${executionQuality.slippagePct}%</b> | Adjusted Entry: <b>$${executionQuality.entryPrice}</b>`);
  if (suggestedPositionSizing) enterpriseSectionParts.push(`Suggested Size: <b>${suggestedPositionSizing.positionSizePct}%</b> | Max: <b>${suggestedPositionSizing.maxPositionPct}%</b>`);

  const enterpriseSection = enterpriseSectionParts.length > 0
    ? `\n\n🏛️ <b>Institutional Signal Metrics</b>\n${enterpriseSectionParts.map((line) => `• ${line}`).join('\n')}`
    : '';

  // Output guard: only explicit is_test=true can show TEST label.
  // Missing is_test is treated as false by strict equality check.
  const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
  const isTest = (idea as any).is_test === true;
  const showTestLabel = isTest;
  const reason = isTest
    ? 'explicit test signal'
    : (mode === 'development'
      ? 'dev mode does not force test label'
      : 'production non-test signal');
  log.info('[TELEGRAM_MODE]', {
    mode,
    isTest,
    showTestLabel,
    reason,
  });
  const testLabel = showTestLabel ? '\n\n🧪 <b>TEST SIGNAL — Validation only</b>' : '';

  return (
    `🚀 <b>${esc(idea.ticker)}${companyLine} ${dir}</b>\n` +
    `📋 ${esc(strategyName)}\n\n` +
    `Entry: <b>${entryLine}</b>\n` +
    `Stop Loss: <b>$${idea.stop_loss}</b>\n` +
    `TP1: <b>$${idea.take_profit_1}</b>${tp2Line}${tp3Line}${trailingLine}\n\n` +
    `📊 <b>Signal Details</b>\n` +
    `Signal Quality: <b>${qualityBadge}</b>\n` +
    `Confidence: <b>${idea.confidence_score}%</b>\n` +
    `Risk/Reward: <b>1:${round2(idea.risk_reward_ratio)}</b>\n` +
    `Timeframe: <b>${idea.timeframe}</b>\n` +
    `Market: <b>${marketTypeLabel}${marketExchange}</b>` +
    `${reasonsBlock}` +
    `${invalidationBlock}` +
    `${aiSection}` +
    `${enterpriseSection}` +
    `\n\n⏰ <i>${new Date().toUTCString()}</i>\n` +
    `📌 <i>For manual execution on eToro</i>` +
    `${testLabel}`
  );
}

export function formatUpdateMessage(
  idea: TradeIdea,
  event: TrackingEvent,
  price: number
): string {
  const ticker = esc(idea.ticker);

  const updateMap: Record<TrackingEvent, string> = {
    entry_triggered:
      `✅ <b>ENTRY TRIGGERED</b>\n` +
      `${ticker} — Price at <b>$${price}</b>\n` +
      `Entry confirmed. Monitor TP1: <b>$${idea.take_profit_1}</b>`,

    entry_missed:
      `⚪ <b>ENTRY MISSED</b>\n` +
      `${ticker} — Price moved to $${price}\n` +
      `Entry zone was not triggered. Idea closed.`,

    tp1_reached:
      `🎯 <b>TP1 REACHED</b>\n` +
      `${ticker} — Price at <b>$${price}</b>\n` +
      `First target hit! Stop moved to break-even ($${idea.entry_price}).\n` +
      `Monitoring for TP2: <b>$${idea.take_profit_2 ?? 'N/A'}</b>`,

    tp2_reached:
      `🎯🎯 <b>TP2 REACHED — FULL TARGET HIT</b>\n` +
      `${ticker} — Price at <b>$${price}</b>\n` +
      `Both targets reached. Trade <b>CLOSED</b>. ✅`,

    stop_hit:
      `❌ <b>STOP LOSS HIT</b>\n` +
      `${ticker} — Price at <b>$${price}</b>\n` +
      `Stop triggered at $${idea.stop_loss}. Trade <b>CLOSED</b>.`,

    invalidated:
      `⚠️ <b>SETUP INVALIDATED</b>\n` +
      `${ticker} — Price at $${price}\n` +
      `${esc(idea.invalidation_rule)}`,

    breakout_failed:
      `⚠️ <b>BREAKOUT FAILED</b>\n` +
      `${ticker} — Price fell back to $${price}\n` +
      `Breakout could not sustain above resistance. Trade <b>CLOSED</b>.`,

    time_exit:
      `⏰ <b>TIME EXIT TRIGGERED</b>\n` +
      `${ticker} — Price at $${price}\n` +
      `Trade idea expired after ${config.risk.maxTradeAgeHours}h time limit. <b>CLOSED</b>.`,

    trailing_stop_activated:
      `🔄 <b>TRAILING STOP ACTIVATED</b>\n` +
      `${ticker} — Price at $${price}\n` +
      `Stop moved to protect profits. Monitor closely.`,

    closed:
      `🏁 <b>TRADE CLOSED</b>\n` +
      `${ticker} — Final price: $${price}`,
  };

  const body = updateMap[event] ?? `📊 Update for ${ticker} — Price: $${price}`;
  return `${body}\n\n<i>${new Date().toUTCString()}</i>`;
}
