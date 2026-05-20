'use client'

import { useCallback, useMemo, useState } from 'react'
import {
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
  Bar,
  BarChart,
} from 'recharts'
import { Brain, ShieldCheck, ShieldX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { AIConfidenceBar } from '../../../components/dashboard/ai-confidence-bar'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface AIPerformanceMetrics {
  totalAIReviewed: number
  approveAccuracy: number
  rejectAccuracy: number
  watchConversionRate: number
  falseRejectRate: number
  fakeoutPredictionAccuracy: number
}

interface AIDecisionSummary {
  decision: string
  count: number
  averageConfidence: number
}

interface DecisionPoint {
  index: number
  createdAt: string
  decision: string
  confidence: number
  fakeoutConfidence: number
  winLoss: boolean
}

interface AIAnalyticsResponse {
  summary: AIDecisionSummary[]
  metrics: AIPerformanceMetrics
  decisionsOverTime: DecisionPoint[]
}

const PIE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#64748b']

export default function AIAnalyticsPage() {
  const [data, setData] = useState<AIAnalyticsResponse | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/analytics/ai-decisions')
    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as AIAnalyticsResponse
    setData(payload)
  }, [])

  useRealtimeOrPolling({ refresh, table: 'signal_performance', pollIntervalMs: 5000 })

  const decisionTrend = useMemo(() => {
    let approve = 0
    let reject = 0
    let watch = 0

    return (data?.decisionsOverTime ?? []).map((point) => {
      if (point.decision === 'APPROVE') approve += 1
      if (point.decision === 'REJECT') reject += 1
      if (point.decision === 'WATCH') watch += 1
      return {
        index: point.index,
        approve,
        reject,
        watch,
      }
    })
  }, [data])

  const confidenceHistogram = useMemo(() => {
    const bins = Array.from({ length: 10 }, (_, index) => ({
      bucket: `${index * 10}-${index * 10 + 9}`,
      count: 0,
    }))

    for (const point of data?.decisionsOverTime ?? []) {
      const idx = Math.min(9, Math.max(0, Math.floor(point.confidence / 10)))
      bins[idx].count += 1
    }

    return bins
  }, [data])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">AI Analytics</h1>
        <p className="text-sm text-slate-400">Decision quality, confidence behavior, and model execution conversion.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="AI Approval Accuracy"
          value={`${data?.metrics.approveAccuracy?.toFixed(1) ?? '0.0'}%`}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <MetricCard
          title="AI Rejection Accuracy"
          value={`${data?.metrics.rejectAccuracy?.toFixed(1) ?? '0.0'}%`}
          icon={<ShieldX className="h-4 w-4" />}
        />
        <MetricCard
          title="WATCH Conversion"
          value={`${data?.metrics.watchConversionRate?.toFixed(1) ?? '0.0'}%`}
          icon={<Brain className="h-4 w-4" />}
        />
        <MetricCard
          title="Fakeout Prediction"
          value={`${data?.metrics.fakeoutPredictionAccuracy?.toFixed(1) ?? '0.0'}%`}
          subtitle={`${data?.metrics.totalAIReviewed ?? 0} reviewed`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950/45 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-slate-200">Decision Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.summary ?? []} dataKey="count" nameKey="decision" innerRadius={50} outerRadius={95}>
                  {(data?.summary ?? []).map((entry, index) => (
                    <Cell key={entry.decision} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-slate-200">AI Decisions Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={decisionTrend}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="index" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Line type="monotone" dataKey="approve" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="reject" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="watch" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">AI Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={confidenceHistogram}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Average Confidence By Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(data?.summary ?? []).map((row) => (
              <AIConfidenceBar key={row.decision} value={row.averageConfidence} label={row.decision} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
