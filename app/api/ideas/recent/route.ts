import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This route queries Supabase directly (server-side, service role) so the
// dashboard works independently of the bot backend process.

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawLimit = parseInt(searchParams.get('limit') ?? '200', 10)
  const limit = Math.min(isNaN(rawLimit) ? 200 : rawLimit, 500)

  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('trade_ideas')
      .select(
        'id, ticker, direction, strategy_slug, confidence_score, signal_quality, status, ' +
        'take_profit_1, take_profit_2, stop_loss, created_at, market_type, ai_decision'
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[api/ideas/recent] Supabase error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
