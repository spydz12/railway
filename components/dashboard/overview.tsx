'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Progress } from '../ui/progress'
import { TrendingUp, TrendingDown, Activity, Shield, Zap, PieChart, AlertTriangle } from 'lucide-react'

interface DashboardMetrics {
  activeSignals: number
  aiApprovedToday: number
  aiRejectedToday: number
  portfolioExposure: number
  winRate: number
  drawdown: number
  profitFactor: number
  riskLevel: string
  marketRegime: string
  marketStress: string
  cryptoAllocation: number
  stocksAllocation: number
}

interface PortfolioResponse {
  activeTradeCount?: number
  normalizedExposure?: number
  cryptoAllocation?: number
}

interface StrategySummary {
  totalTrades: number
  winRate: number
  profitFactor: number
}

interface StrategyResponse {
  summaries?: StrategySummary[]
}

interface RiskGuardResponse {
  estimatedDrawdownPct?: number
  riskLevel?: string
}

interface AIDecisionResponse {
  metrics?: {
    totalAIReviewed?: number
    falseRejectRate?: number
  }
}

interface RegimeResponse {
  currentRegime?: string
  stressLevel?: string
}

function aggregateStrategyMetrics(summaries: StrategySummary[]): { winRate: number; profitFactor: number } {
  const totalTrades = summaries.reduce((sum, row) => sum + row.totalTrades, 0)
  if (totalTrades <= 0) {
    return { winRate: 0, profitFactor: 0 }
  }

  const winRate = summaries.reduce((sum, row) => sum + row.winRate * row.totalTrades, 0) / totalTrades
  const profitFactor = summaries.reduce((sum, row) => sum + row.profitFactor * row.totalTrades, 0) / totalTrades

  return { winRate, profitFactor }
}

export function DashboardOverview() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [portfolioRes, strategyRes, riskRes, aiRes, regimeRes] = await Promise.all([
          fetch('/api/analytics/portfolio'),
          fetch('/api/analytics/strategies'),
          fetch('/api/analytics/risk'),
          fetch('/api/analytics/ai-decisions'),
          fetch('/api/analytics/market-regime'),
        ])

        const portfolio = portfolioRes.ok ? ((await portfolioRes.json()) as PortfolioResponse) : null
        const strategy = strategyRes.ok ? ((await strategyRes.json()) as StrategyResponse) : null
        const risk = riskRes.ok ? ((await riskRes.json()) as RiskGuardResponse) : null
        const ai = aiRes.ok ? ((await aiRes.json()) as AIDecisionResponse) : null
        const regime = regimeRes.ok ? ((await regimeRes.json()) as RegimeResponse) : null

        const strategyMetrics = aggregateStrategyMetrics(strategy?.summaries ?? [])
        const totalAIReviewed = ai?.metrics?.totalAIReviewed ?? 0
        const falseRejectRate = ai?.metrics?.falseRejectRate ?? 0

        setMetrics({
          activeSignals: portfolio?.activeTradeCount ?? 0,
          aiApprovedToday: totalAIReviewed,
          aiRejectedToday: Math.round((falseRejectRate / 100) * totalAIReviewed),
          portfolioExposure: (portfolio?.normalizedExposure ?? 0) * 100,
          winRate: strategyMetrics.winRate,
          drawdown: risk?.estimatedDrawdownPct ?? 0,
          profitFactor: strategyMetrics.profitFactor,
          riskLevel: risk?.riskLevel ?? 'Unknown',
          marketRegime: regime?.currentRegime ?? 'unknown',
          marketStress: regime?.stressLevel ?? 'normal',
          cryptoAllocation: portfolio?.cryptoAllocation ?? 0,
          stocksAllocation: 100 - (portfolio?.cryptoAllocation ?? 0),
        })
      } catch (error) {
        console.error('Failed to fetch dashboard metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold">Unable to load dashboard</h3>
          <p className="mt-1 text-sm text-muted-foreground">Please check your backend connection</p>
        </div>
      </div>
    )
  }

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low':
        return 'bg-green-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'high':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStressColor = (stress: string) => {
    switch (stress.toLowerCase()) {
      case 'low':
        return 'text-green-500'
      case 'normal':
        return 'text-yellow-500'
      case 'high':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Signals</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeSignals}</div>
            <p className="text-xs text-muted-foreground">Currently active positions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Decisions Today</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.aiApprovedToday + metrics.aiRejectedToday}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">{metrics.aiApprovedToday}</span> reviewed,{' '}
              <span className="text-red-500">{metrics.aiRejectedToday}</span> false rejects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Exposure</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.portfolioExposure.toFixed(1)}%</div>
            <Progress value={metrics.portfolioExposure} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            {metrics.winRate >= 50 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.winRate.toFixed(1)}%</div>
            <Progress value={metrics.winRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drawdown</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">-{metrics.drawdown.toFixed(1)}%</div>
            <Progress value={metrics.drawdown} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.profitFactor.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.profitFactor > 1.5 ? 'Excellent' : metrics.profitFactor > 1.2 ? 'Good' : 'Developing'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={`${getRiskColor(metrics.riskLevel)} text-white`}>{metrics.riskLevel.toUpperCase()}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Stress</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getStressColor(metrics.marketStress)}`}>
              {metrics.marketStress.toUpperCase()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Regime: {metrics.marketRegime}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Current portfolio distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded bg-blue-500" />
                <span className="text-sm">Stocks</span>
              </div>
              <span className="text-sm font-medium">{metrics.stocksAllocation.toFixed(1)}%</span>
            </div>
            <Progress value={metrics.stocksAllocation} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded bg-orange-500" />
                <span className="text-sm">Crypto</span>
              </div>
              <span className="text-sm font-medium">{metrics.cryptoAllocation.toFixed(1)}%</span>
            </div>
            <Progress value={metrics.cryptoAllocation} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
