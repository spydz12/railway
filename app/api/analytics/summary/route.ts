import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Row types ────────────────────────────────────────────────────────────────

type IdeaRow = {
  id: string
  ticker: string
  direction: string
  strategy_slug: string
  entry_price: number | null
  status: string
  market_type: string | null
  ai_decision: string | null
  created_at: string
  closed_at: string | null
  take_profit_1: number | null
  take_profit_2: number | null
  take_profit_3: number | null
  stop_loss: number | null
  confidence_score: number | null
}

type UpdateRow = {
  id: string
  trade_idea_id: string
  update_type: string
  price_at_update: number | null
  created_at: string
}

type OutcomeRow = {
  id: string
  signal_id: string
  result: string
  profit_percent: number | null
  exit_price: number | null
  tp_hit: number | null
  closed_at: string | null
  created_at: string
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Date range parser ────────────────────────────────────────────────────────

function parseDateRange(params: URLSearchParams): { from: Date; to: Date; label: string } {
  const customFrom = params.get('from')
  const customTo   = params.get('to')
  const range      = params.get('range') ?? '7d'

  const now      = new Date()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  if (customFrom && customTo) {
    return {
      from:  new Date(customFrom + 'T00:00:00'),
      to:    new Date(customTo + 'T23:59:59'),
      label: 'Custom',
    }
  }

  switch (range) {
    case 'today': {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      return { from, to: todayEnd, label: 'Today' }
    }
    case '30d': {
      const from = new Date()
      from.setDate(from.getDate() - 29)
      from.setHours(0, 0, 0, 0)
      return { from, to: todayEnd, label: '30D' }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from, to: todayEnd, label: 'This Month' }
    }
    default: { // 7d
      const from = new Date()
      from.setDate(from.getDate() - 6)
      from.setHours(0, 0, 0, 0)
      return { from, to: todayEnd, label: '7D' }
    }
  }
}

// ─── Lifecycle resolver ───────────────────────────────────────────────────────

interface LifecycleResult {
  terminalStatus: string
  wasEntered:     boolean
  hadEntryMissed: boolean
  tp1Hit:         boolean
  tp2Hit:         boolean
  tp3Hit:         boolean
  slHit:          boolean
}

function resolveLifecycle(
  idea:    IdeaRow,
  updates: UpdateRow[],
  outcome: OutcomeRow | undefined,
): LifecycleResult {
  const types = new Set(updates.map(u => u.update_type))
  const s     = (idea.status ?? '').toLowerCase()

  // event-first: check actual fired events before falling back to status column
  const hadEntryMissed =
    types.has('entry_missed') ||
    s === 'entry_missed'

  const tp1Hit =
    types.has('tp1_reached') ||
    s === 'tp1_reached' ||
    (outcome != null && outcome.result === 'WIN' && (outcome.tp_hit ?? 0) >= 1)

  const tp2Hit =
    types.has('tp2_reached') ||
    s === 'tp2_reached' ||
    (outcome != null && outcome.result === 'WIN' && (outcome.tp_hit ?? 0) >= 2)

  const tp3Hit =
    (outcome != null && outcome.result === 'WIN' && (outcome.tp_hit ?? 0) >= 3)

  const slHit =
    types.has('stop_hit') ||
    ['stopped', 'sl_hit'].includes(s) ||
    outcome?.result === 'LOSS'

  const wasEntered =
    types.has('entry_triggered') ||
    ['entered', 'active', 'open', 'candidate'].includes(s) ||
    tp1Hit || tp2Hit || tp3Hit || slHit ||
    outcome != null

  const isExpired =
    types.has('time_exit') ||
    s === 'expired'

  const isClosed =
    types.has('closed') ||
    s === 'closed'

  const isInvalidated =
    types.has('invalidated') ||
    types.has('breakout_failed') ||
    s === 'invalidated'

  const isActive    = ['active', 'candidate'].includes(s)
  const isWatching  = ['watch', 'pending'].includes(s)

  let terminalStatus: string
  if      (tp3Hit)          terminalStatus = 'tp3_reached'
  else if (tp2Hit)          terminalStatus = 'tp2_reached'
  else if (tp1Hit)          terminalStatus = 'tp1_reached'
  else if (slHit)           terminalStatus = 'stopped'
  else if (hadEntryMissed)  terminalStatus = 'entry_missed'
  else if (isExpired)       terminalStatus = 'expired'
  else if (isClosed)        terminalStatus = 'closed'
  else if (isInvalidated)   terminalStatus = 'invalidated'
  else if (isActive)        terminalStatus = 'active'
  else if (wasEntered)      terminalStatus = 'entered'
  else if (isWatching)      terminalStatus = 'watch'
  else                      terminalStatus = 'pending'

  return { terminalStatus, wasEntered, hadEntryMissed, tp1Hit, tp2Hit, tp3Hit, slHit }
}

// ─── Empty response ───────────────────────────────────────────────────────────

function emptyResponse(label: string, from: string, to: string) {
  return {
    period: { from, to, label },
    kpis: {
      totalSignals: 0, entered: 0, activeTrades: 0, watching: 0,
      entryMissed: 0, wins: 0, losses: 0,
      tp1Hits: 0, tp2Hits: 0, tp3Hits: 0, slHits: 0,
      aiApproved: 0, aiRejected: 0,
      executionRate: null, entryHitRate: null, winRate: null, aiAccuracy: null,
    },
    daily: [] as unknown[],
    strategies: [] as unknown[],
    outcomes: [] as unknown[],
  }
}

// ─── GET /api/analytics/summary ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market') ?? 'crypto'
  const { from, to, label } = parseDateRange(searchParams)

  const fromISO = from.toISOString()
  const toISO   = to.toISOString()

  try {
    const supabase = getSupabase()

    // ── 1. Fetch trade_ideas in window ──────────────────────────────────────
    const { data: rawIdeas, error: ideasErr } = await supabase
      .from('trade_ideas')
      .select([
        'id', 'ticker', 'direction', 'strategy_slug',
        'entry_price', 'status', 'market_type', 'ai_decision',
        'created_at', 'closed_at',
        'take_profit_1', 'take_profit_2', 'take_profit_3', 'stop_loss',
        'confidence_score',
      ].join(', '))
      .eq('market_type', market)
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (ideasErr) return NextResponse.json({ error: ideasErr.message }, { status: 500 })

    const ideas = (rawIdeas ?? []) as unknown as IdeaRow[]
    if (ideas.length === 0) {
      return NextResponse.json(emptyResponse(label, fromISO, toISO))
    }

    const ideaIds = ideas.map(i => i.id)

    // ── 2. Fetch lifecycle events ────────────────────────────────────────────
    const { data: rawUpdates } = await supabase
      .from('trade_idea_updates')
      .select('id, trade_idea_id, update_type, price_at_update, created_at')
      .in('trade_idea_id', ideaIds)
      .order('created_at', { ascending: true })
      .limit(ideaIds.length * 25)

    const allUpdates = (rawUpdates ?? []) as unknown as UpdateRow[]

    // ── 3. Fetch execution outcomes ──────────────────────────────────────────
    const { data: rawOutcomes } = await supabase
      .from('signal_execution_outcomes')
      .select('id, signal_id, result, profit_percent, exit_price, tp_hit, closed_at, created_at')
      .in('signal_id', ideaIds)
      .order('created_at', { ascending: false })
      .limit(ideaIds.length * 5)

    const allOutcomes = (rawOutcomes ?? []) as unknown as OutcomeRow[]

    // ── Build lookup maps ────────────────────────────────────────────────────
    const updatesByIdea = new Map<string, UpdateRow[]>()
    for (const u of allUpdates) {
      if (!updatesByIdea.has(u.trade_idea_id)) updatesByIdea.set(u.trade_idea_id, [])
      updatesByIdea.get(u.trade_idea_id)!.push(u)
    }

    // best outcome per idea (prefer WIN over LOSS/OPEN)
    const outcomeByIdea = new Map<string, OutcomeRow>()
    for (const o of allOutcomes) {
      const existing = outcomeByIdea.get(o.signal_id)
      if (!existing || o.result === 'WIN') outcomeByIdea.set(o.signal_id, o)
    }

    // latest tracked price per idea
    const latestPriceByIdea = new Map<string, number>()
    for (const u of allUpdates) {
      if (u.price_at_update != null) latestPriceByIdea.set(u.trade_idea_id, u.price_at_update)
    }

    // ── 4. Enrich each idea with lifecycle data ──────────────────────────────
    type Enriched = IdeaRow & LifecycleResult & {
      currentPrice: number | null
      profitPct:    number | null
      exitPrice:    number | null
      closedAtResolved: string | null
      outcomeResult: string | null
    }

    const enriched: Enriched[] = ideas.map(idea => {
      const updates  = updatesByIdea.get(idea.id) ?? []
      const outcome  = outcomeByIdea.get(idea.id)
      const lc       = resolveLifecycle(idea, updates, outcome)

      const currentPrice = latestPriceByIdea.get(idea.id) ?? outcome?.exit_price ?? null

      // profit_pct: from outcome record first, then approximate from prices
      let profitPct = outcome?.profit_percent ?? null
      if (profitPct == null && idea.entry_price && currentPrice) {
        const raw = ((currentPrice - idea.entry_price) / idea.entry_price) * 100
        const dir = (idea.direction ?? '').toUpperCase()
        profitPct = parseFloat(((dir === 'SHORT' || dir === 'SELL') ? -raw : raw).toFixed(2))
      }

      // resolved closed_at
      const closedAtResolved =
        outcome?.closed_at ??
        idea.closed_at ??
        (lc.slHit || lc.tp1Hit || lc.tp2Hit || lc.tp3Hit
          ? ([...updates].reverse().find(u =>
              ['tp1_reached', 'tp2_reached', 'stop_hit', 'closed', 'time_exit'].includes(u.update_type)
            )?.created_at ?? null)
          : null)

      return {
        ...idea,
        ...lc,
        currentPrice,
        profitPct,
        exitPrice:        outcome?.exit_price ?? null,
        closedAtResolved: closedAtResolved ?? null,
        outcomeResult:    outcome?.result ?? null,
      }
    })

    // ── 5. KPIs ──────────────────────────────────────────────────────────────
    const total       = enriched.length
    const entered     = enriched.filter(i => i.wasEntered).length
    const entryMissed = enriched.filter(i => i.hadEntryMissed).length
    const tp1Hits     = enriched.filter(i => i.tp1Hit).length
    const tp2Hits     = enriched.filter(i => i.tp2Hit).length
    const tp3Hits     = enriched.filter(i => i.tp3Hit).length
    const wins        = enriched.filter(i => i.tp1Hit || i.tp2Hit || i.tp3Hit).length
    const slHits      = enriched.filter(i => i.slHit).length
    const losses      = slHits
    const activeTrades = enriched.filter(i => ['active', 'entered', 'candidate'].includes(i.terminalStatus)).length
    const watching     = enriched.filter(i => ['watch', 'pending'].includes(i.terminalStatus)).length
    const aiApproved   = enriched.filter(i => i.ai_decision === 'APPROVE').length
    const aiRejected   = enriched.filter(i => i.ai_decision === 'REJECT').length

    const approvedAndTp = enriched.filter(i => i.ai_decision === 'APPROVE' && (i.tp1Hit || i.tp2Hit || i.tp3Hit)).length

    const eligible        = total - aiRejected
    const executionRate   = eligible > 0 ? Math.round((entered / eligible) * 100) / 100 : null
    const entryAttempts   = entered + entryMissed
    const entryHitRate    = entryAttempts > 0 ? Math.round((entered / entryAttempts) * 100) / 100 : null
    const resolved        = wins + losses
    const winRate         = resolved > 0 ? Math.round((wins / resolved) * 100) / 100 : null
    const aiAccuracy      = aiApproved > 0 ? Math.round((approvedAndTp / aiApproved) * 100) / 100 : null

    // ── 6. Daily chart series ─────────────────────────────────────────────────
    const dayCount  = Math.min(Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1, 90)
    const dailyMap  = new Map<string, {
      date: string; signals: number; wins: number; losses: number
      entryMissed: number; entered: number
    }>()

    for (let d = 0; d < dayCount; d++) {
      const day = new Date(from)
      day.setDate(day.getDate() + d)
      const key = day.toISOString().slice(0, 10)
      dailyMap.set(key, { date: key, signals: 0, wins: 0, losses: 0, entryMissed: 0, entered: 0 })
    }

    for (const idea of enriched) {
      const key    = idea.created_at.slice(0, 10)
      const bucket = dailyMap.get(key)
      if (!bucket) continue
      bucket.signals++
      if (idea.tp1Hit || idea.tp2Hit || idea.tp3Hit) bucket.wins++
      if (idea.slHit)          bucket.losses++
      if (idea.hadEntryMissed) bucket.entryMissed++
      if (idea.wasEntered)     bucket.entered++
    }

    const daily = Array.from(dailyMap.values())

    // ── 7. Strategy breakdown ─────────────────────────────────────────────────
    const stratMap = new Map<string, {
      signals: number; entered: number; wins: number; losses: number; entryMissed: number
    }>()

    for (const idea of enriched) {
      const slug = idea.strategy_slug ?? 'unknown'
      if (!stratMap.has(slug)) stratMap.set(slug, { signals: 0, entered: 0, wins: 0, losses: 0, entryMissed: 0 })
      const st = stratMap.get(slug)!
      st.signals++
      if (idea.wasEntered)                           st.entered++
      if (idea.tp1Hit || idea.tp2Hit || idea.tp3Hit) st.wins++
      if (idea.slHit)                                st.losses++
      if (idea.hadEntryMissed)                       st.entryMissed++
    }

    const strategies = Array.from(stratMap.entries())
      .map(([slug, v]) => {
        const res = v.wins + v.losses
        return {
          slug,
          signals:      v.signals,
          entered:      v.entered,
          wins:         v.wins,
          losses:       v.losses,
          entryMissed:  v.entryMissed,
          winRate:      res > 0 ? Math.round((v.wins / res) * 100) / 100 : null,
          slRate:       res > 0 ? Math.round((v.losses / res) * 100) / 100 : null,
        }
      })
      .sort((a, b) => b.signals - a.signals)

    // ── 8. Outcome table (100 most recent) ────────────────────────────────────
    const outcomes = enriched.slice(0, 100).map(idea => ({
      id:               idea.id,
      ticker:           idea.ticker,
      direction:        idea.direction,
      strategy_slug:    idea.strategy_slug,
      entry_price:      idea.entry_price,
      current_price:    idea.currentPrice,
      result:           idea.outcomeResult,
      profit_pct:       idea.profitPct,
      lifecycle_status: idea.terminalStatus,
      created_at:       idea.created_at,
      closed_at:        idea.closedAtResolved,
    }))

    return NextResponse.json({
      period: { from: fromISO, to: toISO, label },
      kpis: {
        totalSignals: total,
        entered,
        activeTrades,
        watching,
        entryMissed,
        wins,
        losses,
        tp1Hits,
        tp2Hits,
        tp3Hits,
        slHits,
        aiApproved,
        aiRejected,
        executionRate,
        entryHitRate,
        winRate,
        aiAccuracy,
      },
      daily,
      strategies,
      outcomes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
