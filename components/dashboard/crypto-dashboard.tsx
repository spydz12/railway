'use client'

import { useCallback, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../ui/table'
import {
  Activity, BrainCircuit, CheckCircle2, Eye,
  ShieldCheck, Target, TrendingDown, TrendingUp,
  XCircle, Zap, Trophy, AlertTriangle, Clock,
} from 'lucide-react'
import { useRealtimeOrPolling } from '../../hooks/useRealtimeOrPolling'

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = 'today' | '7d' | '30d' | 'month' | 'custom'

interface KPIs {
  totalSignals: number
  entered:      number
  activeTrades: number
  watching:     number
  entryMissed:  number
  wins:         number
  losses:       number
  tp1Hits:      number
  tp2Hits:      number
  tp3Hits:      number
  slHits:       number
  aiApproved:   number
  aiRejected:   number
  executionRate: number | null
  entryHitRate:  number | null
  winRate:       number | null
  aiAccuracy:    number | null
}

interface DailyBucket {
  date:        string
  signals:     number
  wins:        number
  losses:      number
  entryMissed: number
  entered:     number
}

interface StrategyRow {
  slug:         string
  signals:      number
  entered:      number
  wins:         number
  losses:       number
  entryMissed:  number
  winRate:      number | null
  slRate:       number | null
}

interface OutcomeRow {
  id:               string
  ticker:           string
  direction:        string
  strategy_slug:    string
  entry_price:      number | null
  current_price:    number | null
  result:           string | null
  profit_pct:       number | null
  lifecycle_status: string
  created_at:       string
  closed_at:        string | null
}

interface AnalyticsSummary {
  period:     { from: string; to: string; label: string }
  kpis:       KPIs
  daily:      DailyBucket[]
  strategies: StrategyRow[]
  outcomes:   OutcomeRow[]
}

// ─── Static config ────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today'      },
  { value: '7d',    label: '7 Days'     },
  { value: '30d',   label: '30 Days'    },
  { value: 'month', label: 'This Month' },
]

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  watch:        { label: 'Watch',        cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  pending:      { label: 'Pending',      cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  candidate:    { label: 'Candidate',    cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  active:       { label: 'Active',       cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40'      },
  entered:      { label: 'Entered',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40'      },
  tp1_reached:  { label: 'TP1 Hit',      cls: 'bg-green-500/20 text-green-400 border-green-500/40'  },
  tp2_reached:  { label: 'TP2 Hit',      cls: 'bg-green-600/20 text-green-300 border-green-600/40'  },
  tp3_reached:  { label: 'TP3 Hit',      cls: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40' },
  stopped:      { label: 'SL Hit',       cls: 'bg-red-500/20 text-red-400 border-red-500/40'        },
  entry_missed: { label: 'Entry Missed', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'     },
  invalidated:  { label: 'Invalidated',  cls: 'bg-red-500/20 text-red-400 border-red-500/40'        },
  expired:      { label: 'Expired',      cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'     },
  closed:       { label: 'Closed',       cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'     },
  rejected:     { label: 'Rejected',     cls: 'bg-red-500/20 text-red-400 border-red-500/40'        },
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status?.toLowerCase()] ?? { label: status, cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40' }
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
      {isLong ? 'UP' : 'DN'} {direction?.toUpperCase() ?? '---'}
    </span>
  )
}

function PnlCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">---</span>
  const isPos = pct >= 0
  return (
    <span className={`font-mono font-semibold text-sm ${isPos ? 'text-green-400' : 'text-red-400'}`}>
      {isPos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  )
}

function StatCard({
  title, value, sub, icon, accent,
}: {
  title: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={accent ?? 'text-primary'}>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function MiniCountCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${cls}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  )
}

function RateCard({ label, value }: { label: string; value: number | null }) {
  const display = value == null ? '---' : `${Math.round(value * 100)}%`
  const pct     = value == null ? 0     : Math.round(value * 100)
  const color   = pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-2xl font-bold mb-2">{display}</div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '---'
  return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(5)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '---'
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDayLabel(iso: string, periodLabel: string): string {
  if (periodLabel === 'Today') return iso
  const d = new Date(iso + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CryptoDashboard() {
  const [range, setRange]             = useState<Range>('7d')
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [summary, setSummary]         = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading]         = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const buildUrl = useCallback((r: Range, cf: string, ct: string): string => {
    if (r === 'custom' && cf && ct) {
      return `/api/analytics/summary?from=${cf}&to=${ct}&market=crypto`
    }
    return `/api/analytics/summary?range=${r}&market=crypto`
  }, [])

  const refresh = useCallback(async () => {
    const url = buildUrl(range, customFrom, customTo)
    try {
      const res  = await fetch(url)
      const data = await res.json() as AnalyticsSummary
      setSummary(data)
      setLastUpdated(new Date())
    } catch {
      // keep previous data on transient error
    } finally {
      setLoading(false)
    }
  }, [range, customFrom, customTo, buildUrl])

  useRealtimeOrPolling({ refresh, pollIntervalMs: 15_000, table: 'trade_ideas' })

  function handleRangeChange(r: Range) {
    setRange(r)
    setLoading(true)
    const url = buildUrl(r, customFrom, customTo)
    fetch(url)
      .then(res => res.json())
      .then((data: AnalyticsSummary) => { setSummary(data); setLastUpdated(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  function handleCustomApply() {
    if (!customFrom || !customTo) return
    setRange('custom')
    setLoading(true)
    fetch(buildUrl('custom', customFrom, customTo))
      .then(res => res.json())
      .then((data: AnalyticsSummary) => { setSummary(data); setLastUpdated(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const kpis        = summary?.kpis
  const daily       = summary?.daily ?? []
  const strategies  = summary?.strategies ?? []
  const outcomes    = summary?.outcomes ?? []
  const periodLabel = summary?.period?.label ?? '7D'

  const chartData = daily.map(d => ({
    date:           fmtDayLabel(d.date, periodLabel),
    Signals:        d.signals,
    Wins:           d.wins,
    Losses:         d.losses,
    'Entry Missed': d.entryMissed,
  }))

  const resolvedStrats = strategies.filter(s => (s.wins + s.losses) >= 2)
  const bestStrat  = resolvedStrats.length > 0
    ? resolvedStrats.reduce((a, b) => ((a.winRate ?? 0) >= (b.winRate ?? 0) ? a : b))
    : null
  const worstStrat = resolvedStrats.length > 0
    ? resolvedStrats.reduce((a, b) => ((a.slRate ?? 0) >= (b.slRate ?? 0) ? a : b))
    : null

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-14 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><div className="h-56 bg-muted animate-pulse rounded" /></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="h-40 bg-muted animate-pulse rounded" /></CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── HEADER: Range filter ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Historical Trade Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Event-based lifecycle analytics{lastUpdated ? ` · Updated ${fmtDate(lastUpdated.toISOString())}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => handleRangeChange(o.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${range === o.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range row */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40"
          >
            Apply Range
          </button>
          {range === 'custom' && (
            <span className="text-xs text-muted-foreground self-end pb-2">Custom range active</span>
          )}
        </div>
      </section>

      {/* ── SECTION 1: Primary KPI cards ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            title="Total Signals"
            value={kpis?.totalSignals ?? 0}
            sub={`${kpis?.aiApproved ?? 0} approved · ${kpis?.aiRejected ?? 0} rejected`}
            icon={<Activity className="h-4 w-4" />}
            accent="text-blue-400"
          />
          <StatCard
            title="Entered Trades"
            value={kpis?.entered ?? 0}
            sub="entry_triggered events"
            icon={<Zap className="h-4 w-4" />}
            accent="text-indigo-400"
          />
          <StatCard
            title="Active Now"
            value={kpis?.activeTrades ?? 0}
            sub="open positions"
            icon={<Eye className="h-4 w-4" />}
            accent="text-yellow-400"
          />
          <StatCard
            title="Wins"
            value={kpis?.wins ?? 0}
            sub={`TP1:${kpis?.tp1Hits ?? 0} TP2:${kpis?.tp2Hits ?? 0} TP3:${kpis?.tp3Hits ?? 0}`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="text-green-400"
          />
          <StatCard
            title="Entry Missed"
            value={kpis?.entryMissed ?? 0}
            sub="price never hit zone"
            icon={<XCircle className="h-4 w-4" />}
            accent="text-zinc-400"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <RateCard label="Win Rate"       value={kpis?.winRate      ?? null} />
          <RateCard label="Execution Rate" value={kpis?.executionRate ?? null} />
          <RateCard label="Entry Hit Rate" value={kpis?.entryHitRate  ?? null} />
          <RateCard label="AI Accuracy"    value={kpis?.aiAccuracy    ?? null} />
        </div>
      </section>

      {/* ── SECTION 2: TP / SL / AI breakdown ───────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Signal Outcome Breakdown
        </h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <MiniCountCard label="TP1 Hits"    value={kpis?.tp1Hits    ?? 0} cls="border-green-500/30 text-green-400" />
          <MiniCountCard label="TP2 Hits"    value={kpis?.tp2Hits    ?? 0} cls="border-green-600/30 text-green-300" />
          <MiniCountCard label="TP3 Hits"    value={kpis?.tp3Hits    ?? 0} cls="border-emerald-600/30 text-emerald-300" />
          <MiniCountCard label="SL Hits"     value={kpis?.slHits     ?? 0} cls="border-red-500/30 text-red-400" />
          <MiniCountCard label="AI Approved" value={kpis?.aiApproved ?? 0} cls="border-blue-500/30 text-blue-400" />
          <MiniCountCard label="AI Rejected" value={kpis?.aiRejected ?? 0} cls="border-zinc-500/30 text-zinc-400" />
        </div>
      </section>

      {/* ── SECTION 3: Daily activity chart ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Signal Activity</CardTitle>
          <p className="text-xs text-muted-foreground">Signals / Wins / Losses / Entry Missed sourced from event log</p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.2)" />
                <YAxis tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.2)" />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="Signals"      fill="#6366f1" radius={[2,2,0,0]} />
                <Bar dataKey="Wins"         fill="#22c55e" radius={[2,2,0,0]} />
                <Bar dataKey="Losses"       fill="#ef4444" radius={[2,2,0,0]} />
                <Bar dataKey="Entry Missed" fill="#71717a" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 4: Strategy analytics ───────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Strategy Analytics
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-400" />
                <CardTitle className="text-sm">Best Strategy</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {bestStrat ? (
                <>
                  <div className="font-semibold text-base">{bestStrat.slug}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {bestStrat.signals} signals · {bestStrat.wins}W / {bestStrat.losses}L ·{' '}
                    <span className="text-green-400 font-medium">
                      {Math.round((bestStrat.winRate ?? 0) * 100)}% win rate
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Not enough resolved trades yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <CardTitle className="text-sm">Worst Strategy</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {worstStrat ? (
                <>
                  <div className="font-semibold text-base">{worstStrat.slug}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {worstStrat.signals} signals · {worstStrat.wins}W / {worstStrat.losses}L ·{' '}
                    <span className="text-red-400 font-medium">
                      {Math.round((worstStrat.slRate ?? 0) * 100)}% SL rate
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Not enough resolved trades yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {strategies.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Performance by Strategy</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Signals</TableHead>
                    <TableHead className="text-right">Entered</TableHead>
                    <TableHead className="text-right">Wins</TableHead>
                    <TableHead className="text-right">SL Hits</TableHead>
                    <TableHead className="text-right">Missed</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategies.map(s => {
                    const wr = s.winRate != null ? Math.round(s.winRate * 100) : null
                    return (
                      <TableRow key={s.slug}>
                        <TableCell className="font-mono text-xs">{s.slug}</TableCell>
                        <TableCell className="text-right">{s.signals}</TableCell>
                        <TableCell className="text-right">{s.entered}</TableCell>
                        <TableCell className="text-right text-green-400">{s.wins}</TableCell>
                        <TableCell className="text-right text-red-400">{s.losses}</TableCell>
                        <TableCell className="text-right text-zinc-400">{s.entryMissed}</TableCell>
                        <TableCell className="text-right">
                          {wr == null ? (
                            <span className="text-muted-foreground">---</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${wr >= 60 ? 'bg-green-500' : wr >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${wr}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium">{wr}%</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── SECTION 5: Outcome table ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Trade Outcomes</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Lifecycle resolved from event log · {outcomes.length} records
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Event-sourced
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {outcomes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No outcomes for this period</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Last Price</TableHead>
                  <TableHead className="text-right">PnL %</TableHead>
                  <TableHead>Lifecycle</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Closed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcomes.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.ticker}</TableCell>
                    <TableCell><DirectionBadge direction={row.direction} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[140px] truncate">
                      {row.strategy_slug}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtPrice(row.entry_price)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtPrice(row.current_price)}</TableCell>
                    <TableCell className="text-right"><PnlCell pct={row.profit_pct} /></TableCell>
                    <TableCell><StatusBadge status={row.lifecycle_status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.closed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
