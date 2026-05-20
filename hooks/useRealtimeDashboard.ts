'use client'

import { useCallback, useState } from 'react'
import { useRealtimeOrPolling } from './useRealtimeOrPolling'

export interface DashboardOverviewPayload {
  generatedAt: string
  liveSignals: {
    activeSignals: number
    closedSignals: number
    winRate: number
    totalPnL: number
    avgProfit: number
    profitFactor: number
    totalTrackedTrades: number
    rows: Array<{
      id: string
      ticker: string
      direction: string
      strategy: string
      confidence: number
      status: string
      profit: number
      created: string
      durationMinutes: number
    }>
  }
  reinforcementIntelligence: {
    topStrategy: any
    bestContext: any
    bestMarketRegime: any
    currentModifiers: {
      strategy: Array<{ strategy: string; modifier: number }>
      context: Array<{ key: string; modifier: number }>
      marketRegime: Array<{ key: string; modifier: number }>
    }
    recentLearningUpdates: any[]
    strategyLearning: any[]
    contextLearning: any[]
    marketRegimeLearning: any[]
  }
  sourceCompetition: {
    priorityFlow: string[]
    competitions: Array<{
      timestamp: string
      winner: string
      losers: Array<{ source: string; reason: string; effectiveModifier: number }>
      adjustedConfidence?: number
    }>
    decisions: Array<{
      timestamp: string
      strategy: string
      source: string
      effectiveModifier: number
      recencyWeight: number
      sampleWeight: number
      decision: string
    }>
    latestWinner: string | null
  }
  signalPerformance: {
    winRateHistory: Array<{ index: number; time: string; winRate: number }>
    pnlOverTime: Array<{ index: number; time: string; pnl: number }>
    strategyBreakdown: Array<{ strategy: string; signals: number; wins: number; losses: number; winRate: number; avgProfit: number; avgDuration: number; totalPnL: number }>
    marketRegimePerformance: Array<{ regime: string; trades: number; winRate: number; totalPnL: number }>
    contextPerformance: Array<{ context: string; trades: number; winRate: number; totalPnL: number }>
  }
  telegramActivity: {
    signalsSent: number
    errors: number
    lastMessage: any
    deliveryHealth: number
    pendingSignals: number
    telegramModeLogs: Array<{
      timestamp: string
      mode: string
      isTest: boolean
      showTestLabel: boolean
      reason?: string
    }>
  }
  systemHealth: {
    scannerStatus: string
    telegramStatus: string
    databaseStatus: string
    cronStatus: string
    trackingStatus: string
    heartbeat: string | null
  }
  deployment: {
    blockers: string[]
    details: Array<{ check: string; found: boolean; status: 'READY' | 'NOT READY' | 'BLOCKED'; note: string }>
  }
}

export function useRealtimeDashboard() {
  const [data, setData] = useState<DashboardOverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/dashboard/overview')
    if (!res.ok) return
    const payload = (await res.json()) as DashboardOverviewPayload
    setData(payload)
    setLoading(false)
  }, [])

  useRealtimeOrPolling({ refresh, pollIntervalMs: 5000, table: 'signal_execution_outcomes' })

  return { data, loading, refresh }
}
