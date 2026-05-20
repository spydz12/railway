'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'

interface DeploymentReadiness {
  status: 'READY' | 'NOT READY' | 'BLOCKED'
  architecture: {
    web: string
    runtime: string
    workers: string[]
    database: string
  }
  explanation: {
    keepsBotAlive: string
    failsOnVercel: string
    serverlessSafe: string[]
    requiresWorkers: string[]
  }
  blockers: Array<{ check: string; found: boolean; status: 'READY' | 'NOT READY' | 'BLOCKED'; note: string }>
  warnings: string[]
}

interface DashboardHealthPayload {
  runtime?: {
    scanner: boolean
    tracking: boolean
    workers: boolean
    cron: boolean
    telegram: boolean
    database: boolean
    heartbeat: string
  }
}

function statusTone(status: 'ONLINE' | 'OFFLINE' | 'BLOCKED'): string {
  if (status === 'ONLINE') return 'bg-emerald-600 text-white'
  if (status === 'OFFLINE') return 'bg-slate-600 text-white'
  return 'bg-red-600 text-white'
}

export function DeploymentReadinessPanel() {
  const [data, setData] = useState<DeploymentReadiness | null>(null)
  const [runtime, setRuntime] = useState<DashboardHealthPayload['runtime']>()

  const refresh = useCallback(async () => {
    const [deploymentRes, healthRes] = await Promise.all([
      fetch('/api/dashboard/deployment'),
      fetch('/api/dashboard/health'),
    ])
    if (deploymentRes.ok) {
      setData((await deploymentRes.json()) as DeploymentReadiness)
    }
    if (healthRes.ok) {
      const health = (await healthRes.json()) as DashboardHealthPayload
      setRuntime(health.runtime)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!data) {
    return <div className="text-sm text-slate-400">Loading deployment analysis...</div>
  }

  const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')
  const scannerStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = data.status === 'BLOCKED' ? 'BLOCKED' : runtime?.scanner ? 'ONLINE' : 'OFFLINE'
  const trackingStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = data.status === 'BLOCKED' ? 'BLOCKED' : runtime?.tracking ? 'ONLINE' : 'OFFLINE'
  const workersStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = data.status === 'BLOCKED' ? 'BLOCKED' : runtime?.workers ? 'ONLINE' : 'OFFLINE'
  const cronStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = data.status === 'BLOCKED' ? 'BLOCKED' : runtime?.cron ? 'ONLINE' : 'OFFLINE'
  const databaseStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = runtime?.database ? 'ONLINE' : 'OFFLINE'
  const telegramStatus: 'ONLINE' | 'OFFLINE' | 'BLOCKED' = runtime?.telegram ? 'ONLINE' : 'OFFLINE'

  return (
    <div className="space-y-6">
      {isVercelHost ? (
        <Card className="border-amber-700 bg-amber-950/35">
          <CardContent className="pt-6 text-sm text-amber-100">Bot workers disabled</CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Runtime Services</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Scanner</span><Badge className={statusTone(scannerStatus)}>{scannerStatus}</Badge></div>
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Tracking</span><Badge className={statusTone(trackingStatus)}>{trackingStatus}</Badge></div>
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Workers</span><Badge className={statusTone(workersStatus)}>{workersStatus}</Badge></div>
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Cron</span><Badge className={statusTone(cronStatus)}>{cronStatus}</Badge></div>
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Database</span><Badge className={statusTone(databaseStatus)}>{databaseStatus}</Badge></div>
          <div className="flex items-center justify-between rounded border border-slate-800 p-2"><span>Telegram</span><Badge className={statusTone(telegramStatus)}>{telegramStatus}</Badge></div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Deployment Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-200">
          <div>
            <Badge className={data.status === 'READY' ? 'bg-emerald-600 text-white' : data.status === 'BLOCKED' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}>
              {data.status}
            </Badge>
          </div>
          <div><b>Current architecture:</b> {data.architecture.web}</div>
          <div><b>What keeps bot alive:</b> {data.explanation.keepsBotAlive}</div>
          <div><b>What fails on Vercel:</b> {data.explanation.failsOnVercel}</div>
          <div><b>What runs serverless:</b> {data.explanation.serverlessSafe.join(', ')}</div>
          <div><b>What requires workers:</b> {data.explanation.requiresWorkers.join(', ')}</div>
        </CardContent>
      </Card>

      {data.warnings.length > 0 ? (
        <Card className="border-red-700 bg-red-950/35">
          <CardHeader>
            <CardTitle className="text-red-200">Warnings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-red-100">
            {data.warnings.map((warning, idx) => (
              <div key={idx}>Will stop on Vercel: {warning}</div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Readiness Checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.blockers.map((b) => (
            <div key={b.check} className="flex items-center justify-between rounded border border-slate-800 p-2">
              <div>
                <div className="font-medium text-slate-200">{b.check}</div>
                <div className="text-xs text-slate-400">{b.note}</div>
              </div>
              <Badge className={b.status === 'READY' ? 'bg-emerald-600 text-white' : b.status === 'BLOCKED' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}>
                {b.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
