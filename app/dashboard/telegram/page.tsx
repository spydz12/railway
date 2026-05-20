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
import { MessageCircleMore, Send, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { MetricCard } from '../../../components/dashboard/metric-card'
import { useRealtimeOrPolling } from '../../../hooks/useRealtimeOrPolling'

interface TelegramAnalytics {
  totalSignals: number
  sentSignals: number
  sendSuccessRate: number
  rejectedSignals: number
  approvedSignals: number
  approvedAndSent: number
  watchSignals: number
  delivery: {
    delivered: number
    pending: number
  }
  timeline: Array<{
    index: number
    createdAt: string
    aiDecision: string
    sent: boolean
    status: string
  }>
}

const DELIVERY_COLORS = ['#14b8a6', '#f59e0b']

export default function TelegramMonitorPage() {
  const [data, setData] = useState<TelegramAnalytics | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/analytics/telegram')
    if (!response.ok) return
    const payload = (await response.json()) as TelegramAnalytics
    setData(payload)
  }, [])

  useRealtimeOrPolling({ refresh, table: 'trade_ideas', pollIntervalMs: 5000 })

  const sendTrend = useMemo(() => {
    let cumulativeSent = 0
    return (data?.timeline ?? []).map((point) => {
      if (point.sent) cumulativeSent += 1
      return {
        index: point.index,
        cumulativeSent,
      }
    })
  }, [data])

  const deliveryPie = useMemo(
    () => [
      { name: 'Delivered', value: data?.delivery.delivered ?? 0 },
      { name: 'Pending', value: data?.delivery.pending ?? 0 },
    ],
    [data]
  )

  const approvedVsSent = useMemo(
    () => [
      { name: 'AI Approved', value: data?.approvedSignals ?? 0 },
      { name: 'Sent', value: data?.approvedAndSent ?? 0 },
      { name: 'Rejected', value: data?.rejectedSignals ?? 0 },
      { name: 'WATCH', value: data?.watchSignals ?? 0 },
    ],
    [data]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Telegram Monitor</h1>
        <p className="text-sm text-slate-400">Signal delivery integrity and AI-to-telegram execution trace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Signals Sent" value={`${data?.sentSignals ?? 0}`} icon={<Send className="h-4 w-4" />} />
        <MetricCard title="Delivery Success" value={`${data?.sendSuccessRate?.toFixed(1) ?? '0.0'}%`} icon={<MessageCircleMore className="h-4 w-4" />} />
        <MetricCard title="Rejected Signals" value={`${data?.rejectedSignals ?? 0}`} icon={<ShieldAlert className="h-4 w-4" />} />
        <MetricCard title="WATCH Signals" value={`${data?.watchSignals ?? 0}`} subtitle={`${data?.totalSignals ?? 0} total reviewed`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950/45">
          <CardHeader>
            <CardTitle className="text-slate-200">Delivery Status</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={deliveryPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={92}>
                  {deliveryPie.map((entry, index) => (
                    <Cell key={entry.name} fill={DELIVERY_COLORS[index % DELIVERY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-950/45 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-slate-200">AI Approved vs Sent</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={approvedVsSent}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Signal Send Timeline</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sendTrend}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="index" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
              <Line type="monotone" dataKey="cumulativeSent" stroke="#22d3ee" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
