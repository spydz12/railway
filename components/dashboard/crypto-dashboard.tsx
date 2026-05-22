'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart2,
  ShieldCheck,
  BrainCircuit,
  Eye,
  Target,
  Zap,
  XCircle,
  CheckCircle2,
  Trophy,
  AlertTriangle,
} from 'lucide-react'
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
  entry_price: number | null
  take_profit_1: number | null
  take_profit_2: number | null
  take_profit_3?: number | null
  stop_loss: number | null
  created_at: string
  market_type: string
  ai_decision?: string | null
}

interface OutcomeIdea {
  id: string
  ticker: string
  direction: string
  strategy_slug: string
  entry_price: number | null
  current_price: number | null
  status: string
  market_type: string
  ai_decision?: string | null
  created_at: string
}

// ─── Status configs ───────────────────────────────────────────────────────────

const STATUS_CONFIG_OUTCOME: Record<string, { label: string; cls: string }> = {
  watch:         { label: 'Watch',        cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  pending:       { label: 'Pending',      cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  active:        { label: 'Active',       cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  entered:       { label: 'Entered',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  open:          { label: 'Open',         cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  tp1_reached:   { label: 'TP1 Hit',      cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  tp2_reached:   { label: 'TP2 Hit',      cls: 'bg-green-600/20 text-green-300 border-green-600/40' },
  tp3_reached:   { label: 'TP3 Hit',      cls: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40' },
  closed:        { label: 'Closed',       cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  stopped:       { label: 'SL Hit',       cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  sl_hit:        { label: 'SL Hit',       cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  entry_missed:  { label: 'Entry Missed', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  invalidated:   { label: 'Invalidated',  cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  rejected:      { label: 'Rejected',     cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  expired:       { label: 'Expired',      cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' },
  candidate:     { label: 'Candidate',    cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG_OUTCOME[status?.toLowerCase()] ?? { label: status, cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  const isLong = direction?.toUpperCase() === 'LONG' || direction?.toUpperCase() === 'BUY'
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
    HIGH:         'bg-green-500/20 text-green-400',
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

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return `${v}%`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? fmtTime(iso)
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + fmtTime(iso)
}

function fmtDayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })
}

// ─── Status classifiers ───────────────────────────────────────────────────────

const isWin         = (s: string) => ['tp1_reached', 'tp2_reached', 'tp3_reached'].includes(s)
const isLoss        = (s: string) => ['stopped', 'sl_hit'].includes(s)
const isActive      = (s: string) => ['active', 'entered', 'open'].includes(s)
const isEntryMissed = (s: string) => s === 'entry_missed'
const isEntered     = (s: string) => s === 'entered'
const isRejected    = (s: string) => s === 'rejected'
const isWatching    = (s: string) => s === 'watch'

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchIdeas(): Promise<TradeIdea[]> {
  const res = await fetch('/api/ideas/recent?limit=500')
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : (data?.ideas ?? [])
}

async function fetchOutcomes(): Promise<OutcomeIdea[]> {
  const res = await fetch('/api/ideas/outcomes?limit=100')
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// ─── Custom Recharts Tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CryptoDashboard() {
  const [ideas, setIdeas] = useState<TradeIdea[]>([])
  const [outcomes, setOutcomes] = useState<OutcomeIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    const [ideasData, outcomesData] = await Promise.all([fetchIdeas(), fetchOutcomes()])
    const cryptoFilter = (i: { market_type?: string }) => i.market_type === 'crypto' || !i.market_type
    setIdeas(ideasData.filter(cryptoFilter))
    setOutcomes(outcomesData.filter(cryptoFilter))
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useRealtimeOrPolling({ refresh, pollIntervalMs: 8000, table: 'trade_ideas' })

  // ── KPI Derivations ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const s = (i: TradeIdea) => (i.status ?? '').toLowerCase()

    const wins        = ideas.filter(i => isWin(s(i))).length
    const losses      = ideas.filter(i => isLoss(s(i))).length
    const active      = ideas.filter(i => isActive(s(i))).length
    const watching    = ideas.filter(i => isWatching(s(i))).length
    const entryMissed = ideas.filter(i => isEntryMissed(s(i))).length
    const entered     = ideas.filter(i => isEntered(s(i))).length
    const rejected    = ideas.filter(i => isRejected(s(i))).length
    const total       = ideas.length

    // Execution Rate = entered / (total - rejected)
    const eligible         = total - rejected
    const executionRatePct = eligible > 0 ? Math.round((entered / eligible) * 100) : null

    // Entry Hit Rate = entered / (entered + entry_missed)
    const entryAttempts    = entered + entryMissed
    const entryHitRatePct  = entryAttempts > 0 ? Math.round((entered / entryAttempts) * 100) : null

    // AI Accuracy = approved that reached TP / all approved
    const approved       = ideas.filter(i => i.ai_decision === 'APPROVE')
    const approvedTpHit  = approved.filter(i => isWin(s(i))).length
    const aiAccuracyPct  = approved.length > 0 ? Math.round((approvedTpHit / approved.length) * 100) : null

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIdeas = ideas.filter(i => new Date(i.created_at) >= todayStart)
    const aiApproved = todayIdeas.filter(i => i.ai_decision === 'APPROVE').length
    const aiTotal    = todayIdeas.filter(i => i.ai_decision != null).length

    const resolved   = wins + losses
    const winRatePct = resolved > 0 ? Math.round((wins / resolved) * 100) : null

    const totalExposure = ideas.filter(i => isActive(s(i))).reduce((sum, i) => {
      return sum + Math.min(1, (i.confidence_score ?? 50) / 100)
    }, 0)
    const cryptoExposurePct = active > 0 ? Math.round((totalExposure / 6) * 100) : 0

    return {
      wins, losses, active, watching, entryMissed, entered, rejected, total,
      executionRatePct, entryHitRatePct, aiAccuracyPct, winRatePct,
      approved: approved.length, approvedTpHit,
      todayIdeas, aiApproved, aiTotal, cryptoExposurePct,
    }
  }, [ideas])

  // ── 7-day chart data ───────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const buckets: Record<string, { date: string; Signals: number; Wins: number; Losses: number; 'Entry Missed': number }> = {}
    for (let d = 0; d < 7; d++) {
      const day = new Date(sevenDaysAgo)
      day.setDate(day.getDate() + d)
      const key = day.toISOString().slice(0, 10)
      buckets[key] = { date: fmtDayLabel(key), Signals: 0, Wins: 0, Losses: 0, 'Entry Missed': 0 }
    }
    for (const idea of ideas) {
      const key = idea.created_at?.slice(0, 10)
      if (!key || !buckets[key]) continue
      const s = (idea.status ?? '').toLowerCase()
      buckets[key].Signals++
      if (isWin(s))         buckets[key].Wins++
      if (isLoss(s))        buckets[key].Losses++
      if (isEntryMissed(s)) buckets[key]['Entry Missed']++
    }
    return Object.values(buckets)
  }, [ideas])

  // ── Strategy summary ───────────────────────────────────────────────────────
  const strategySummary = useMemo(() => {
    const map: Record<string, { wins: number; losses: number; total: number }> = {}
    for (const idea of ideas) {
      const slug = idea.strategy_slug ?? 'unknown'
      if (!map[slug]) map[slug] = { wins: 0, losses: 0, total: 0 }
      map[slug].total++
      const s = (idea.status ?? '').toLowerCase()
      if (isWin(s))  map[slug].wins++
      if (isLoss(s)) map[slug].losses++
    }
    const resolved = Object.entries(map)
      .filter(([, v]) => v.wins + v.losses >= 2)
      .map(([slug, v]) => ({
        slug,
        total: v.total,
        wins: v.wins,
        losses: v.losses,
        winRate: Math.round((v.wins / (v.wins + v.losses)) * 100),
        slRate:  Math.round((v.losses / (v.wins + v.losses)) * 100),
      }))
    if (resolved.length === 0) return { best: null, worst: null }
    const best  = resolved.reduce((a, b) => (a.winRate >= b.winRate ? a : b))
    const worst = resolved.reduce((a, b) => (a.slRate  >= b.slRate  ? a : b))
    return { best, worst }
  }, [ideas])

  // ── Table rows ─────────────────────────────────────────────────────────────
  const outcomeRows = useMemo(() =>
    [...outcomes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [outcomes])

  const signalRows = useMemo(() =>
    [...ideas].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [ideas])

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-12 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><div className="h-64 bg-muted animate-pulse rounded" /></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="h-48 bg-muted animate-pulse rounded" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ═══════════════════════════════════════════════════════
          SECTION 1 — Trade Outcome KPIs
      ═══════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Trade Outcome Analytics</h2>
          <p className="text-sm text-muted-foreground">All-time crypto signal outcomes</p>
        </div>

        {/* Row 1 — outcome counts */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            title="Entry Missed"
            value={kpis.entryMissed}
            sub="Price never returned to zone"
            icon={<XCircle className="h-4 w-4" />}
            accent="text-zinc-400"
          />
          <StatCard
            title="Wins"
            value={kpis.wins}
            sub="TP1 / TP2 / TP3 reached"
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="text-green-400"
          />
          <StatCard
            title="Losses"
            value={kpis.losses}
            sub="Stop-loss triggered"
            icon={<TrendingDown className="h-4 w-4" />}
            accent="text-red-400"
          />
          <StatCard
            title="Active Trades"
            value={kpis.active}
            sub="active / entered / open"
            icon={<TrendingUp className="h-4 w-4" />}
            accent="text-blue-400"
          />
          <StatCard
            title="Watching"
            value={kpis.watching}
            sub="Monitoring for entry"
            icon={<Eye className="h-4 w-4" />}
            accent="text-yellow-400"
          />
        </div>

        {/* Row 2 — rate metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Win Rate"
            value={fmtPct(kpis.winRatePct)}
            sub={`${kpis.wins}W / ${kpis.losses}L resolved`}
            icon={<BarChart2 className="h-4 w-4" />}
            accent={kpis.winRatePct != null && kpis.winRatePct >= 55 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard
            title="Execution Rate"
            value={fmtPct(kpis.executionRatePct)}
            sub={`${kpis.entered} entered / ${kpis.total - kpis.rejected} eligible`}
            icon={<Zap className="h-4 w-4" />}
            accent={kpis.executionRatePct != null && kpis.executionRatePct >= 50 ? 'text-green-400' : 'text-yellow-400'}
          />
          <StatCard
            title="Entry Hit Rate"
            value={fmtPct(kpis.entryHitRatePct)}
            sub={`${kpis.entered} entered / ${kpis.entered + kpis.entryMissed} attempted`}
            icon={<Target className="h-4 w-4" />}
            accent={kpis.entryHitRatePct != null && kpis.entryHitRatePct >= 60 ? 'text-green-400' : 'text-orange-400'}
          />
          <StatCard
            title="AI Accuracy"
            value={fmtPct(kpis.aiAccuracyPct)}
            sub={`${kpis.approvedTpHit} TP hit / ${kpis.approved} AI-approved`}
            icon={<BrainCircuit className="h-4 w-4" />}
            accent={kpis.aiAccuracyPct != null && kpis.aiAccuracyPct >= 60 ? 'text-violet-400' : 'text-orange-400'}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2 — 7-day Chart
      ═══════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle>7-Day Signal Overview</CardTitle>
          <CardDescription>Daily breakdown — signals, wins, losses, missed entries</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} />
              <Bar dataKey="Signals"      fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Wins"         fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Losses"       fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Entry Missed" fill="#71717a" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3 — Strategy Summary
      ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <Trophy className="h-5 w-5 text-green-400" />
            <div>
              <CardTitle className="text-base">Best Strategy</CardTitle>
              <CardDescription>Highest win rate (≥2 resolved)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {strategySummary.best ? (
              <div className="space-y-2">
                <p className="font-mono text-sm font-semibold truncate">{strategySummary.best.slug}</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-400 font-bold text-xl">{strategySummary.best.winRate}%</span>
                  <span className="text-muted-foreground">win rate</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {strategySummary.best.wins}W / {strategySummary.best.losses}L — {strategySummary.best.total} signals
                </p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-400 rounded-full" style={{ width: `${strategySummary.best.winRate}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not enough resolved trades yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div>
              <CardTitle className="text-base">Worst Strategy</CardTitle>
              <CardDescription>Highest stop-loss rate (≥2 resolved)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {strategySummary.worst ? (
              <div className="space-y-2">
                <p className="font-mono text-sm font-semibold truncate">{strategySummary.worst.slug}</p>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-red-400 font-bold text-xl">{strategySummary.worst.slRate}%</span>
                  <span className="text-muted-foreground">SL rate</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {strategySummary.worst.wins}W / {strategySummary.worst.losses}L — {strategySummary.worst.total} signals
                </p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${strategySummary.worst.slRate}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not enough resolved trades yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 4 — Outcome Table
      ═══════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Outcome Table</CardTitle>
            <CardDescription>Latest 100 ideas — entry vs. last tracked price</CardDescription>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse inline-block" />
            {lastUpdated ? `Updated ${fmtTime(lastUpdated.toISOString())}` : 'Loading…'}
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
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Last Tracked</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcomeRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      No outcome data available
                    </TableCell>
                  </TableRow>
                ) : (
                  outcomeRows.map((row) => {
                    const priceDiff = row.current_price != null && row.entry_price != null
                      ? ((row.current_price - row.entry_price) / row.entry_price) * 100
                      : null
                    const isLongDir = row.direction?.toUpperCase() === 'LONG' || row.direction?.toUpperCase() === 'BUY'
                    const gainful   = priceDiff != null && (isLongDir ? priceDiff > 0 : priceDiff < 0)
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-mono font-semibold">{row.ticker}</TableCell>
                        <TableCell><DirectionBadge direction={row.direction} /></TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate block max-w-[150px]" title={row.strategy_slug}>
                            {row.strategy_slug}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-medium">
                          {fmtPrice(row.entry_price)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {row.current_price != null ? (
                            <span className={gainful ? 'text-green-400' : priceDiff != null ? 'text-red-400' : ''}>
                              {fmtPrice(row.current_price)}
                              {priceDiff != null && (
                                <span className="ml-1 text-[10px]">({priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(1)}%)</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════
          SECTION 5 — All Signals Table
      ═══════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle>All Crypto Signals</CardTitle>
          <CardDescription>{signalRows.length} signals — sorted newest first</CardDescription>
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
                {signalRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                      No crypto trade ideas found
                    </TableCell>
                  </TableRow>
                ) : (
                  signalRows.map((idea) => (
                    <TableRow key={idea.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono font-semibold">{idea.ticker}</TableCell>
                      <TableCell><DirectionBadge direction={idea.direction} /></TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate block max-w-[160px]" title={idea.strategy_slug}>
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
