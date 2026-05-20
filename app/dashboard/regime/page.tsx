'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from 'recharts'
import { Activity, Waves } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { RegimeBadge } from '../../../components/dashboard/regime-badge'
import { RiskBadge } from '../../../components/dashboard/risk-badge'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface RegimePerformanceRow {
  marketRegime: string
  totalTrades: number
  winRate: number
  averageRR: number
  averageAiConfidence: number
}

interface RegimePoint {
  index: number
  createdAt: string
  regime: string
  volatility: string
  btcBias: string
  winLoss: boolean
}

interface RegimeResponse {
  currentRegime: string
  stressLevel: string
  btcMarketCondition: string
  regimePerformance: RegimePerformanceRow[]
  regimeTimeline: RegimePoint[]
}

export default function MarketRegimePage() {
  const [data, setData] = useState<RegimeResponse | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/analytics/market-regime')
    if (!response.ok) return
    const payload = (await response.json()) as RegimeResponse
    setData(payload)
  }, [])

  useRealtimeOrPolling({ refresh, table: 'signal_performance', pollIntervalMs: 5000 })

  const timelineEncoded = useMemo(() => {
    return (data?.regimeTimeline ?? []).map((point) => ({
      index: point.index,
      regimeCode:
        point.regime === 'trending' ? 3 : point.regime === 'ranging' ? 2 : point.regime === 'volatile' ? 1 : 0,
    }))
  }, [data])

  const volatilityHeatmap = useMemo(() => {
    const regimes = Array.from(new Set((data?.regimeTimeline ?? []).map((point) => point.regime)))
    const volLevels = Array.from(new Set((data?.regimeTimeline ?? []).map((point) => point.volatility)))

    return { regimes, volLevels }
  }, [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Market Regime</h1>
        <p className="text-sm text-slate-400">Current state, timeline behavior, and volatility stress matrix.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Current Regime" value={data?.currentRegime ?? 'unknown'} icon={<Waves className="h-4 w-4" />} />
        <MetricCard title="BTC Market Condition" value={data?.btcMarketCondition ?? 'neutral'} icon={<Activity className="h-4 w-4" />} />
        <MetricCard title="Stress Level" value={data?.stressLevel ?? 'UNKNOWN'} subtitle="Risk guard derived" />
        <MetricCard title="Tracked Regimes" value={`${data?.regimePerformance.length ?? 0}`} subtitle="Regime buckets" />
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-4">
        <RegimeBadge regime={data?.currentRegime ?? 'unknown'} animated />
        <RiskBadge risk={data?.stressLevel ?? 'LOW'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Regime Timeline</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineEncoded}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[0, 3]} />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Line type="stepAfter" dataKey="regimeCode" stroke="#38bdf8" dot={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Performance By Regime</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.regimePerformance ?? []}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="marketRegime" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="winRate" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Volatility Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `170px repeat(${volatilityHeatmap.volLevels.length || 1}, minmax(96px, 1fr))`,
              }}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Regime</div>
              {volatilityHeatmap.volLevels.map((vol) => (
                <div key={vol} className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {vol}
                </div>
              ))}

              {volatilityHeatmap.regimes.map((regime) => (
                <div key={regime} className="contents">
                  <div key={`${regime}-name`} className="text-sm font-medium text-slate-200">{regime}</div>
                  {volatilityHeatmap.volLevels.map((vol) => {
                    const points = (data?.regimeTimeline ?? []).filter(
                      (item) => item.regime === regime && item.volatility === vol
                    )
                    const wins = points.filter((item) => item.winLoss).length
                    const winRate = points.length > 0 ? (wins / points.length) * 100 : 0
                    const tone =
                      winRate >= 60 ? 'bg-emerald-500/30 text-emerald-200' : winRate >= 45 ? 'bg-amber-500/30 text-amber-200' : 'bg-red-500/25 text-red-200'

                    return (
                      <div key={`${regime}-${vol}`} className={`rounded-md border border-slate-700 p-2 text-center text-xs font-semibold ${tone}`}>
                        {winRate.toFixed(1)}%
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
