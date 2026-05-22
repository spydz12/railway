'use client'

import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Badge } from '../ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { TrendingUp, Activity, BarChart2, ShieldCheck, BrainCircuit } from 'lucide-react'
import { useRealtimeOrPolling } from '../../hooks/useRealtimeOrPolling'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeIdea {
  id: string
  ticker: string
  direction: string
  strategy_slug: string
  confidence_score: number
  signal_quality: string
  status: string
  take_profit_1: number | null
  take_profit_2: number | null
  stop_loss: number | null
  created_at: string
  market_type: string
  ai_decision?: string | null
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  watch:        { label: 'Watch',        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  pending:      { label: 'Pending',      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  active:       { label: 'Active',       className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  entered:      { label: 'Entered',      className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  open:         { label: 'Open',         className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  tp1_reached:  { label: 'TP1 Hit',      className: 'bg-green-500/20 text-green-400 border-green-500/40' },
  tp2_reached:  { label: 'TP2 Hit',      className: 'bg-green-600/20 text-green-300 border-green-600/40' },
  closed:       { label: 'Closed',       className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  stopped:      { label: 'SL Hit',       className: 'bg-red-500/20 text-red-400 border-red-500/40' },
  invalidated:  { label: 'Invalidated',  className: 'bg-red-500/20 text-red-400 border-red-500/40' },
  rejected:     { label: 'Rejected',     className: 'bg-red-500/20 text-red-400 border-red-500/40' },
  expired:      { label: 'Expired',      className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  candidate:    { label: 'Candidate',    className: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status.toLowerCase()] ?? { label: status, className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  const isLong = direction?.toUpperCase() === 'LONG'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
      {isLong ? '▲' : '▼'} {direction?.toUpperCase() ?? '—'}
    </span>
  )
}

function QualityBadge({ quality }: { quality: string }) {
  const classMap: Record<string, string> = {
    ELITE:        'bg-violet-500/20 text-violet-400',
    HIGH_QUALITY: 'bg-green-500/20 text-green-400',
    MEDIUM:       'bg-yellow-500/20 text-yellow-400',
    WATCH:        'bg-orange-500/20 text-orange-400',
    REJECT:       'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${classMap[quality] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
      {quality ?? '—'}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: string
}

function StatCard({ title, value, sub, icon, accent = 'text-primary' }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={accent}>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPrice(v: number | null): string {
  if (v == null) return '—'
  return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay ? fmtTime(iso) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(iso)
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchIdeas(): Promise<TradeIdea[]> {
  const res = await fetch('/api/ideas/recent?limit=200')
  if (!res.ok) return []
  const data = await res.json()
  // Accept either array directly or { ideas: [...] }
  return Array.isArray(data) ? data : (data?.ideas ?? [])
}

// ─── Main component ───────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['closed', 'stopped', 'invalidated', 'expired', 'rejected', 'tp2_reached'])
const WIN_STATUSES       = new Set(['tp1_reached', 'tp2_reached'])
const LOSS_STATUSES      = new Set(['stopped'])
const ACTIVE_STATUSES    = new Set(['active', 'open', 'entered'])
const TODAY_OPEN_STATUSES = new Set(['pending', 'active', 'watch', 'open', 'entered', 'candidate'])

export function CryptoDashboard() {
  const [ideas, setIdeas] = useState<TradeIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchIdeas()
    // Crypto only
    setIdeas(data.filter(i => i.market_type === 'crypto' || !i.market_type))
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useRealtimeOrPolling({
    refresh,
    pollIntervalMs: 8000,
    table: 'trade_ideas',
  })

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayIdeas  = ideas.filter(i => new Date(i.created_at) >= todayStart)
    const activeTrades = ideas.filter(i => ACTIVE_STATUSES.has(i.status?.toLowerCase()))
    const closed = ideas.filter(i => TERMINAL_STATUSES.has(i.status?.toLowerCase()))
    const wins   = ideas.filter(i => WIN_STATUSES.has(i.status?.toLowerCase()))
    const losses = ideas.filter(i => LOSS_STATUSES.has(i.status?.toLowerCase()))
    const resolved = wins.length + losses.length
    const winRate = resolved > 0 ? Math.round((wins.length / resolved) * 100) : null

    const totalExposure = activeTrades.reduce((sum, i) => {
      const scoreWeight = (i.confidence_score ?? 50) / 100
      return sum + Math.min(1, scoreWeight)
    }, 0)
    const cryptoExposurePct = activeTrades.length > 0
      ? Math.round((totalExposure / 6) * 100)   // mirrors config.portfolio.targetExposureScore default=6
      : 0

    const aiApproved = todayIdeas.filter(i => i.ai_decision === 'APPROVE').length
    const aiTotal    = todayIdeas.filter(i => i.ai_decision != null).length

    return { todayIdeas, activeTrades, closed, winRate, wins, losses, cryptoExposurePct, aiApproved, aiTotal }
  }, [ideas])

  // ── Sorted table rows ──────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    return [...ideas].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [ideas])

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-12 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><div className="h-64 bg-muted animate-pulse rounded" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Signals Today"
          value={stats.todayIdeas.length}
          sub={`${stats.todayIdeas.filter(i => TODAY_OPEN_STATUSES.has(i.status?.toLowerCase())).length} still open`}
          icon={<Activity className="h-4 w-4" />}
          accent="text-blue-400"
        />
        <StatCard
          title="Active Trades"
          value={stats.activeTrades.length}
          sub="active / open / entered"
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-green-400"
        />
        <StatCard
          title="Win Rate"
          value={stats.winRate != null ? `${stats.winRate}%` : '—'}
          sub={`${stats.wins.length}W / ${stats.losses.length}L`}
          icon={<BarChart2 className="h-4 w-4" />}
          accent={stats.winRate != null && stats.winRate >= 55 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          title="Portfolio Exposure"
          value={`${stats.cryptoExposurePct}%`}
          sub={`${stats.activeTrades.length} positions`}
          icon={<ShieldCheck className="h-4 w-4" />}
          accent={stats.cryptoExposurePct > 80 ? 'text-red-400' : stats.cryptoExposurePct > 55 ? 'text-yellow-400' : 'text-green-400'}
        />
        <StatCard
          title="AI Approvals"
          value={stats.aiApproved}
          sub={`of ${stats.aiTotal} reviewed today`}
          icon={<BrainCircuit className="h-4 w-4" />}
          accent="text-violet-400"
        />
      </div>

      {/* ── Trade ideas table ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Crypto Trade Ideas</CardTitle>
            <CardDescription>
              {lastUpdated
                ? `Live — last updated ${fmtTime(lastUpdated.toISOString())}`
                : 'Connecting to realtime feed…'}
            </CardDescription>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse inline-block" />
            Realtime
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-center">Confidence</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">TP1</TableHead>
                  <TableHead className="text-right">TP2</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                      No crypto trade ideas found
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((idea) => (
                    <TableRow key={idea.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono font-semibold">{idea.ticker}</TableCell>
                      <TableCell><DirectionBadge direction={idea.direction} /></TableCell>
                      <TableCell className="max-w-[160px]">
                        <span className="text-xs text-muted-foreground truncate block" title={idea.strategy_slug}>
                          {idea.strategy_slug}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-semibold ${
                          idea.confidence_score >= 75 ? 'text-green-400'
                          : idea.confidence_score >= 55 ? 'text-yellow-400'
                          : 'text-red-400'
                        }`}>
                          {idea.confidence_score ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell><QualityBadge quality={idea.signal_quality} /></TableCell>
                      <TableCell><StatusBadge status={idea.status} /></TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPrice(idea.take_profit_1)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPrice(idea.take_profit_2)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-red-400">{fmtPrice(idea.stop_loss)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(idea.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
