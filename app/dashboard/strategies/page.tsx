'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Gauge, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { StrategyHeatmap, type StrategyHeatmapCell } from '../../../components/dashboard/strategy-heatmap'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface StrategySummary {
  strategy: string
  totalTrades: number
  winRate: number
  averageRR: number
  profitFactor: number
  bestMarketRegime: string | null
  worstMarketRegime: string | null
}

interface PerformancePoint {
  index: number
  createdAt: string
  strategy: string
  outcome: number
  rr: number
  pnl: number
}

interface WeightPoint {
  index: number
  createdAt: string
  strategy: string
  baseWeight: number
  adjustedWeight: number
  marketRegime: string
}

interface ReinforcementRow {
  strategy: string
  marketType: 'stocks' | 'crypto'
  totalTrades: number
  winRate: number
  averageRR: number
  profitFactor: number
  reinforcementScore: number
}

interface StrategyAnalyticsResponse {
  summaries: StrategySummary[]
  performanceTimeline: PerformancePoint[]
  strategyWeightingHistory: WeightPoint[]
}

export default function StrategiesPage() {
  const [data, setData] = useState<StrategyAnalyticsResponse | null>(null)
  const [reinforcement, setReinforcement] = useState<ReinforcementRow[]>([])

  const refresh = useCallback(async () => {
    const [strategiesRes, reinforcementRes] = await Promise.all([
      fetch('/api/analytics/strategies'),
      fetch('/api/analytics/reinforcement'),
    ])

    if (strategiesRes.ok) {
      const payload = (await strategiesRes.json()) as StrategyAnalyticsResponse
      setData(payload)
    }

    if (reinforcementRes.ok) {
      const payload = (await reinforcementRes.json()) as ReinforcementRow[]
      setReinforcement(payload)
    }
  }, [])

  useRealtimeOrPolling({ refresh, table: 'signal_performance', pollIntervalMs: 5000 })

  const topSummary = useMemo(() => data?.summaries?.[0] ?? null, [data])

  const performanceOverTime = useMemo(() => {
    const points = data?.performanceTimeline ?? []
    let cumulative = 0
    return points.map((point) => {
      cumulative += point.pnl
      return {
        index: point.index,
        cumulativePnl: Number(cumulative.toFixed(2)),
      }
    })
  }, [data])

  const heatmapCells = useMemo<StrategyHeatmapCell[]>(() => {
    return reinforcement.map((row) => ({
      strategy: row.strategy,
      regime: row.marketType,
      score: row.reinforcementScore,
    }))
  }, [reinforcement])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Strategy Analytics</h1>
        <p className="text-sm text-slate-400">Institutional view of strategy edge, regime fit, and adaptive weighting.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Top Strategy Win Rate"
          value={`${topSummary?.winRate?.toFixed(1) ?? '0.0'}%`}
          subtitle={topSummary ? topSummary.strategy : 'No data'}
          icon={<Trophy className="h-4 w-4" />}
        />
        <MetricCard
          title="Profit Factor"
          value={topSummary?.profitFactor?.toFixed(2) ?? '0.00'}
          subtitle="Leading strategy"
          icon={<Gauge className="h-4 w-4" />}
        />
        <MetricCard
          title="Average RR"
          value={topSummary?.averageRR?.toFixed(2) ?? '0.00'}
          subtitle="Recent signal outcomes"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <MetricCard
          title="Best vs Worst Regime"
          value={`${topSummary?.bestMarketRegime ?? '-'} / ${topSummary?.worstMarketRegime ?? '-'}`}
          subtitle="Top strategy regime sensitivity"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Strategy Win Rate By Model</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.summaries ?? []}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="strategy" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="winRate" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Strategy Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceOverTime}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Line type="monotone" dataKey="cumulativePnl" stroke="#22c55e" strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Adaptive Weighting History</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.strategyWeightingHistory ?? []}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="index" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" domain={[0, 1.5]} />
              <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              <Line type="monotone" dataKey="baseWeight" stroke="#38bdf8" dot={false} />
              <Line type="monotone" dataKey="adjustedWeight" stroke="#f59e0b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Strategy Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <StrategyHeatmap cells={heatmapCells} />
        </CardContent>
      </Card>
    </div>
  )
}
