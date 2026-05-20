'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Trophy, Percent, Activity, Sigma, TrendingUp, Clock } from 'lucide-react'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface StrategyBreakdownRow {
  strategy: string
  signals: number
  wins: number
  losses: number
  winRate: number
  avgProfit: number
  avgDuration: number
  totalPnL: number
}

interface RecentSignalRow {
  ticker: string
  direction: string
  strategy: string
  result: string
  profit_percent: number
  duration_minutes: number
  close_reason: string | null
  created_at: string
}

interface PerformanceOverviewResponse {
  totalSignals: number
  totalWins: number
  totalLosses: number
  winRate: number
  avgProfitPercent: number
  avgDurationMinutes: number
  bestStrategy: string | null
  worstStrategy: string | null
  mostUsedStrategy: string | null
  totalPnL: number
  profitFactor: number
  averageRR: number
  recentSignals: RecentSignalRow[]
  strategyBreakdown: StrategyBreakdownRow[]
}

const RESULT_COLORS: Record<string, string> = {
  WIN: '#22c55e',
  LOSS: '#ef4444',
  BREAKEVEN: '#eab308',
  EXPIRED: '#3b82f6',
}

export default function PerformanceDashboardPage() {
  const [data, setData] = useState<PerformanceOverviewResponse | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/performance/overview')
    if (!response.ok) return
    const payload = (await response.json()) as PerformanceOverviewResponse
    setData(payload)
  }, [])

  useRealtimeOrPolling({
    refresh,
    table: 'signal_execution_outcomes',
    pollIntervalMs: 8000,
  })

  const winLossTimeline = useMemo(() => {
    let wins = 0
    let losses = 0
    return (data?.recentSignals ?? [])
      .slice()
      .reverse()
      .map((row, idx) => {
        if (row.result === 'WIN') wins += 1
        if (row.result === 'LOSS') losses += 1
        return { index: idx + 1, wins, losses }
      })
  }, [data?.recentSignals])

  const profitDistribution = useMemo(() => {
    const buckets = [
      { bucket: '< -2%', count: 0 },
      { bucket: '-2% to 0%', count: 0 },
      { bucket: '0% to 2%', count: 0 },
      { bucket: '2% to 5%', count: 0 },
      { bucket: '> 5%', count: 0 },
    ]

    for (const row of data?.recentSignals ?? []) {
      const p = row.profit_percent
      if (p < -2) buckets[0].count += 1
      else if (p < 0) buckets[1].count += 1
      else if (p <= 2) buckets[2].count += 1
      else if (p <= 5) buckets[3].count += 1
      else buckets[4].count += 1
    }

    return buckets
  }, [data?.recentSignals])

  const signalsPerDay = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const row of data?.recentSignals ?? []) {
      const day = row.created_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }

    return Array.from(byDay.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }, [data?.recentSignals])

  const strategyWinRates = useMemo(() => {
    return (data?.strategyBreakdown ?? [])
      .map((row) => ({ strategy: row.strategy, winRate: row.winRate, signals: row.signals }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 12)
  }, [data?.strategyBreakdown])

  const strategyPerformance = useMemo(() => {
    return (data?.strategyBreakdown ?? [])
      .map((row) => ({ strategy: row.strategy, totalPnL: row.totalPnL, winRate: row.winRate }))
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, 10)
  }, [data?.strategyBreakdown])

  const recentResultMix = useMemo(() => {
    const summary = new Map<string, number>()
    for (const row of data?.recentSignals ?? []) {
      summary.set(row.result, (summary.get(row.result) ?? 0) + 1)
    }

    return Array.from(summary.entries()).map(([result, count]) => ({ result, count }))
  }, [data?.recentSignals])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Trade Performance</h1>
        <p className="text-sm text-slate-400">Institutional lifecycle analytics powered by execution outcomes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Total Signals" value={String(data?.totalSignals ?? 0)} icon={<Activity className="h-4 w-4" />} />
        <MetricCard title="Win Rate" value={`${(data?.winRate ?? 0).toFixed(1)}%`} icon={<Percent className="h-4 w-4" />} />
        <MetricCard title="Profit Factor" value={(data?.profitFactor ?? 0).toFixed(2)} icon={<Sigma className="h-4 w-4" />} />
        <MetricCard title="Avg Profit" value={`${(data?.avgProfitPercent ?? 0).toFixed(2)}%`} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard title="Total PnL" value={`${(data?.totalPnL ?? 0).toFixed(2)}%`} icon={<TrendingUp className="h-4 w-4" />} />
        <MetricCard title="Best Strategy" value={data?.bestStrategy ?? 'n/a'} icon={<Trophy className="h-4 w-4" />} subtitle={`Avg duration ${(data?.avgDurationMinutes ?? 0).toFixed(1)}m`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Win/Loss Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={winLossTimeline}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Line type="monotone" dataKey="wins" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="losses" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Strategy Performance (Total PnL)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strategyPerformance}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="strategy" stroke="#94a3b8" angle={-15} textAnchor="end" interval={0} height={80} />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="totalPnL" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Profit Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitDistribution}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Signals Per Day</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signalsPerDay}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Strategy Win Rates</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strategyWinRates} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis type="number" stroke="#94a3b8" domain={[0, 100]} />
                <YAxis type="category" dataKey="strategy" stroke="#94a3b8" width={120} />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="winRate" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Recent Signals (Last 20)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.recentSignals ?? []).map((row) => (
              <div key={`${row.ticker}-${row.strategy}-${row.created_at}`} className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="font-semibold text-slate-100">{row.ticker}</span>
                  <span>{row.strategy}</span>
                  <span className="text-slate-500">{row.result}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <span>{row.profit_percent.toFixed(2)}%</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{row.duration_minutes}m</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Recent Outcome Mix</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={recentResultMix} dataKey="count" nameKey="result" innerRadius={52} outerRadius={100}>
                  {recentResultMix.map((entry) => (
                    <Cell key={entry.result} fill={RESULT_COLORS[entry.result] ?? '#64748b'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
