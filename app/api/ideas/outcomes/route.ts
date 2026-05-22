import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Returns trade ideas enriched with their latest tracked price from trade_idea_updates.
// Used by the Outcome Analytics table in the Crypto Dashboard.

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawLimit = parseInt(searchParams.get('limit') ?? '100', 10)
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 300)

  try {
    const supabase = getSupabaseAdmin()

    // Fetch recent trade ideas
    const { data: ideas, error: ideasError } = await supabase
      .from('trade_ideas')
      .select(
        'id, ticker, direction, strategy_slug, entry_price, status, ' +
        'market_type, ai_decision, created_at, take_profit_1, take_profit_2, stop_loss'
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (ideasError) {
      return NextResponse.json({ error: ideasError.message }, { status: 500 })
    }

    const ideaList = ideas ?? []
    if (ideaList.length === 0) return NextResponse.json([])

    const ideaIds = ideaList.map((i) => i.id)

    // Fetch latest update price per idea (get a generous batch, filter in JS)
    const { data: updates } = await supabase
      .from('trade_idea_updates')
      .select('trade_idea_id, price_at_update, created_at')
      .in('trade_idea_id', ideaIds)
      .order('created_at', { ascending: false })
      .limit(ideaIds.length * 5) // up to 5 updates per idea

    // Pick the latest price per idea
    const latestPrice: Record<string, number | null> = {}
    for (const upd of updates ?? []) {
      if (upd.trade_idea_id && !(upd.trade_idea_id in latestPrice)) {
        latestPrice[upd.trade_idea_id] = upd.price_at_update ?? null
      }
    }

    const result = ideaList.map((idea) => ({
      ...idea,
      current_price: latestPrice[idea.id] ?? null,
    }))

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
