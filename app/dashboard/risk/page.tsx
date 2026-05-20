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
import { AlertTriangle, BarChart4, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { PortfolioExposureChart } from '../../../components/dashboard/portfolio-exposure-chart'
import { RiskBadge } from '../../../components/dashboard/risk-badge'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface PortfolioSnapshot {
  totalActiveExposure: number
  normalizedExposure: number
  stockExposure: number
  cryptoExposure: number
  cryptoAllocation: number
  stockAllocation: number
  sectorExposure: Record<string, number>
  regimeExposure: Record<string, number>
  correlationClusters: Array<{ cluster: string; symbols: string[]; exposure: number }>
  averageConfidence: number
  portfolioRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  activeTradeCount: number
}

interface RiskGuard {
  pauseTrading: boolean
  confidenceModifier: number
  positionModifier: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  consecutiveLosses: number
  estimatedDrawdownPct: number
  reason: string
}

interface DrawdownAnalytics {
  totalTrades: number
  consecutiveLosses: number
  worstLosingStreak: number
  lossRate: number
  currentWinRate: number
  estimatedDrawdownPct: number
}

export default function PortfolioRiskPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null)
  const [risk, setRisk] = useState<RiskGuard | null>(null)
  const [drawdown, setDrawdown] = useState<DrawdownAnalytics | null>(null)

  const refresh = useCallback(async () => {
    const [portfolioRes, riskRes, drawdownRes] = await Promise.all([
      fetch('/api/analytics/portfolio'),
      fetch('/api/analytics/risk'),
      fetch('/api/analytics/drawdown'),
    ])

    if (portfolioRes.ok) setPortfolio((await portfolioRes.json()) as PortfolioSnapshot)
    if (riskRes.ok) setRisk((await riskRes.json()) as RiskGuard)
    if (drawdownRes.ok) setDrawdown((await drawdownRes.json()) as DrawdownAnalytics)
  }, [])

  useRealtimeOrPolling({ refresh, table: 'trade_ideas', pollIntervalMs: 5000 })

  const sectorRows = useMemo(
    () =>
      Object.entries(portfolio?.sectorExposure ?? {}).map(([sector, value]) => ({
        sector,
        exposure: Number((value * 100).toFixed(1)),
      })),
    [portfolio]
  )

  const regimeRows = useMemo(
    () =>
      Object.entries(portfolio?.regimeExposure ?? {}).map(([regime, value]) => ({
        regime,
        exposure: Number((value * 100).toFixed(1)),
      })),
    [portfolio]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Portfolio Risk</h1>
        <p className="text-sm text-slate-400">Exposure concentration, drawdown pressure, and risk-guard posture.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Exposure" value={`${((portfolio?.normalizedExposure ?? 0) * 100).toFixed(1)}%`} icon={<BarChart4 className="h-4 w-4" />} />
        <MetricCard title="Correlated Trades" value={`${portfolio?.correlationClusters.length ?? 0}`} icon={<AlertTriangle className="h-4 w-4" />} />
        <MetricCard title="Current Drawdown" value={`${drawdown?.estimatedDrawdownPct?.toFixed(1) ?? '0.0'}%`} subtitle={`${drawdown?.worstLosingStreak ?? 0} worst loss streak`} />
        <MetricCard title="Risk Guard State" value={risk?.pauseTrading ? 'PAUSED' : 'ACTIVE'} icon={<Shield className="h-4 w-4" />} />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/45 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Portfolio Stress</p>
          <p className="mt-1 text-sm text-slate-200">{risk?.reason ?? 'No current risk reason'}</p>
        </div>
        <RiskBadge risk={risk?.riskLevel ?? 'LOW'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Crypto vs Stocks Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <PortfolioExposureChart stocks={portfolio?.stockAllocation ?? 0} crypto={portfolio?.cryptoAllocation ?? 0} />
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Sector Allocation</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorRows}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="sector" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="exposure" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Exposure By Regime</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={regimeRows}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="regime" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              <Line type="monotone" dataKey="exposure" stroke="#f59e0b" strokeWidth={2.4} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
