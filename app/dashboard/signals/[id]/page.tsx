'use client'

import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from 'recharts'
import { Brain, CandlestickChart, GaugeCircle, Layers } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { MetricCard } from '../../../../components/dashboard/metric-card'
import { AIConfidenceBar } from '../../../../components/dashboard/ai-confidence-bar'
import { SignalTimeline } from '../../../../components/dashboard/signal-timeline'
import { RiskBadge } from '../../../../components/dashboard/risk-badge'
import { useRealtimeOrPolling } from '../../../../hooks/useRealtimeOrPolling'

interface TradeIdea {
  id: string
  ticker: string
  strategy_slug: string
  timeframe: string
  entry_price: number | null
  stop_loss: number
  take_profit_1: number
  confidence_score: number
  risk_reward_ratio: number
  reason: string
  reasons: string[]
  status: string
  market_type: 'stocks' | 'crypto'
  market_condition: string
  ai_decision?: 'APPROVE' | 'REJECT' | 'WATCH' | null
  ai_confidence?: number | null
  ai_risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  ai_summary?: string | null
  ai_approval_reasons?: string[] | null
  ai_risk_warnings?: string[] | null
  fakeout_probability?: number | null
  adaptive_confidence_adjustment?: number | null
  created_at: string
}

interface TradeUpdate {
  id: string
  update_type: string
  message: string
  created_at: string
}

interface SymbolHistoryRow {
  id: string
  entry: number
  stop_loss: number
  take_profit: number | null
  duration_hours: number | null
  max_favorable_excursion: number | null
  max_adverse_excursion: number | null
  win_loss: boolean
  created_at: string
}

interface SimilarTrade {
  symbol: string
  outcome: string
  win_loss: boolean
  ai_decision: string | null
}

interface SignalDetailResponse {
  idea: TradeIdea
  updates: TradeUpdate[]
  symbolHistory: SymbolHistoryRow[]
  similarTrades: SimilarTrade[]
}

export default function SignalDetailsPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [data, setData] = useState<SignalDetailResponse | null>(null)

  const refresh = useCallback(async () => {
    if (!id) return

    const response = await fetch(`/api/analytics/signals/${id}`)
    if (!response.ok) return

    const payload = (await response.json()) as SignalDetailResponse
    if ('error' in payload) return
    setData(payload)
  }, [id])

  useRealtimeOrPolling({ refresh, table: 'trade_idea_updates', pollIntervalMs: 4000, enabled: Boolean(id) })

  const timelineEvents = useMemo(() => {
    const events = [
      {
        id: `${data?.idea.id ?? 'signal'}-created`,
        label: 'Signal Created',
        detail: `Signal ${data?.idea.ticker ?? ''} created with ${data?.idea.strategy_slug ?? ''}`,
        timestamp: data?.idea.created_at ?? new Date().toISOString(),
      },
      ...(data?.updates ?? []).map((update) => ({
        id: update.id,
        label: update.update_type,
        detail: update.message,
        timestamp: update.created_at,
      })),
    ]

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [data])

  const candleProxy = useMemo(() => {
    return (data?.symbolHistory ?? []).map((row, index) => ({
      index: index + 1,
      entry: row.entry,
      stop: row.stop_loss,
      tp: row.take_profit ?? row.entry,
      quality: row.win_loss ? 1 : 0,
    }))
  }, [data])

  const executionQuality = useMemo(() => {
    const rows = data?.symbolHistory ?? []
    if (rows.length === 0) {
      return { winRate: 0, avgDuration: 0, mfe: 0, mae: 0 }
    }

    const wins = rows.filter((row) => row.win_loss).length
    const avgDuration = rows.reduce((sum, row) => sum + (row.duration_hours ?? 0), 0) / rows.length
    const mfe = rows.reduce((sum, row) => sum + (row.max_favorable_excursion ?? 0), 0) / rows.length
    const mae = rows.reduce((sum, row) => sum + (row.max_adverse_excursion ?? 0), 0) / rows.length

    return {
      winRate: (wins / rows.length) * 100,
      avgDuration,
      mfe,
      mae,
    }
  }, [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Signal Details</h1>
        <p className="text-sm text-slate-400">Institutional execution dossier for signal {id}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Symbol" value={data?.idea.ticker ?? '-'} subtitle={data?.idea.strategy_slug ?? '-'} />
        <MetricCard title="Signal Status" value={data?.idea.status ?? '-'} subtitle={data?.idea.timeframe ?? '-'} />
        <MetricCard title="Risk/Reward" value={data?.idea.risk_reward_ratio?.toFixed(2) ?? '0.00'} />
        <MetricCard title="Execution Win Rate" value={`${executionQuality.winRate.toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950/45 xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              <CandlestickChart className="h-4 w-4" />
              Candle Chart And TP/SL Evolution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={candleProxy}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="quality" fill="#22c55e" barSize={6} />
                <Line type="monotone" dataKey="entry" stroke="#38bdf8" dot={false} />
                <Line type="monotone" dataKey="tp" stroke="#10b981" dot={false} />
                <Line type="monotone" dataKey="stop" stroke="#ef4444" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              <Brain className="h-4 w-4" />
              AI Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AIConfidenceBar value={data?.idea.ai_confidence ?? 0} label="AI Confidence" />
            <AIConfidenceBar value={data?.idea.confidence_score ?? 0} label="Signal Confidence" />
            <AIConfidenceBar value={data?.idea.fakeout_probability ?? 0} label="Fakeout Probability" />
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
              {data?.idea.ai_summary ?? data?.idea.reason ?? 'No AI summary available from backend'}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-400">Risk Level</span>
              <RiskBadge risk={data?.idea.ai_risk_level ?? 'LOW'} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              <Layers className="h-4 w-4" />
              Signal Lifecycle Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SignalTimeline events={timelineEvents} />
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-200">
              <GaugeCircle className="h-4 w-4" />
              Execution Quality And Reinforcement Memory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Avg Duration</p>
                <p className="mt-1 text-slate-200">{executionQuality.avgDuration.toFixed(2)}h</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Avg MFE</p>
                <p className="mt-1 text-slate-200">{executionQuality.mfe.toFixed(2)}</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Avg MAE</p>
                <p className="mt-1 text-slate-200">{executionQuality.mae.toFixed(2)}</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Adaptive Adj</p>
                <p className="mt-1 text-slate-200">{data?.idea.adaptive_confidence_adjustment?.toFixed(2) ?? '0.00'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Similar Historical Trades</p>
              <div className="mt-2 space-y-2">
                {(data?.similarTrades ?? []).map((trade, index) => (
                  <div key={`${trade.symbol}-${index}`} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                    <span>{trade.symbol}</span>
                    <span>{trade.outcome}</span>
                    <span>{trade.ai_decision ?? 'UNKNOWN'}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
