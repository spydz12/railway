'use client'

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
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Badge } from '../ui/badge'
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard'

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase()
  const tone = lower.includes('online') || lower.includes('ready') ? 'bg-emerald-500' : lower.includes('degraded') ? 'bg-amber-500' : 'bg-red-500'
  return <Badge className={`${tone} text-white`}>{value}</Badge>
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
  )
}

export function ProductionDashboard() {
  const { data, loading } = useRealtimeDashboard()

  if (loading || !data) {
    return <div className="text-sm text-slate-400">Loading real-time dashboard...</div>
  }

  const live = data.liveSignals
  const reinf = data.reinforcementIntelligence
  const comp = data.sourceCompetition
  const perf = data.signalPerformance
  const tel = data.telegramActivity
  const health = data.systemHealth

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionTitle title="Live Signals" subtitle="Realtime trading visibility (refresh every 5 seconds)." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Active signals</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.activeSignals}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Closed signals</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.closedSignals}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Win rate</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.winRate.toFixed(1)}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Total PnL</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.totalPnL.toFixed(2)}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Avg profit</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.avgProfit.toFixed(2)}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Profit factor</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.profitFactor.toFixed(2)}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40 md:col-span-2"><CardHeader><CardTitle className="text-sm">Total tracked trades</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{live.totalTrackedTrades}</CardContent></Card>
        </div>

        <Card className="border-slate-800 bg-slate-950/40">
          <CardHeader><CardTitle className="text-slate-200">Live table</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {live.rows.slice(0, 15).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.ticker}</TableCell>
                    <TableCell>{row.direction}</TableCell>
                    <TableCell>{row.strategy}</TableCell>
                    <TableCell>{row.confidence}%</TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell>{Number(row.profit).toFixed(2)}</TableCell>
                    <TableCell>{new Date(row.created).toLocaleString()}</TableCell>
                    <TableCell>{row.durationMinutes}m</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Reinforcement Intelligence" subtitle="Learning memory from strategy, context, and market regime tables." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Top strategy</CardTitle></CardHeader><CardContent className="text-sm">{reinf.topStrategy?.strategy_slug ?? 'n/a'}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Best context</CardTitle></CardHeader><CardContent className="text-sm">{reinf.bestContext ? `${reinf.bestContext.strategy_slug}:${reinf.bestContext.ticker}` : 'n/a'}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Best market regime</CardTitle></CardHeader><CardContent className="text-sm">{reinf.bestMarketRegime?.market_regime ?? 'n/a'}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Current modifiers</CardTitle></CardHeader><CardContent className="text-sm">{reinf.currentModifiers.strategy.length}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Recent updates</CardTitle></CardHeader><CardContent className="text-sm">{reinf.recentLearningUpdates.length}</CardContent></Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">strategy_learning</CardTitle></CardHeader>
            <CardContent className="max-h-80 overflow-auto text-xs">
              {reinf.strategyLearning.slice(0, 12).map((row, i) => (
                <div key={`${row.strategy}-${i}`} className="mb-2 border-b border-slate-800 pb-2">
                  <div className="font-medium text-slate-200">{row.strategy}</div>
                  <div>W/L {row.wins}/{row.losses} | WR {row.winRate}% | Mod {row.modifier}</div>
                  <div>Recency {row.recencyWeight} | Sample {row.sampleWeight}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">context_learning</CardTitle></CardHeader>
            <CardContent className="max-h-80 overflow-auto text-xs">
              {reinf.contextLearning.slice(0, 12).map((row, i) => (
                <div key={`${row.strategy}-${i}`} className="mb-2 border-b border-slate-800 pb-2">
                  <div className="font-medium text-slate-200">{row.strategy} {row.ticker}</div>
                  <div>W/L {row.wins}/{row.losses} | WR {row.winRate}% | Mod {row.modifier}</div>
                  <div>Recency {row.recencyWeight} | Sample {row.sampleWeight}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">market_regime_learning</CardTitle></CardHeader>
            <CardContent className="max-h-80 overflow-auto text-xs">
              {reinf.marketRegimeLearning.slice(0, 12).map((row, i) => (
                <div key={`${row.strategy}-${i}`} className="mb-2 border-b border-slate-800 pb-2">
                  <div className="font-medium text-slate-200">{row.strategy} {row.marketRegime}</div>
                  <div>W/L {row.wins}/{row.losses} | WR {row.winRate}% | Mod {row.modifier}</div>
                  <div>Recency {row.recencyWeight} | Sample {row.sampleWeight}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Source Competition" subtitle="Decision flow Context → Market Regime → Strategy → Winner." />
        <Card className="border-slate-800 bg-slate-950/40">
          <CardContent className="pt-6 text-sm text-slate-200">
            <div className="mb-4">Context ↓ Market Regime ↓ Strategy ↓ Winner: <b>{comp.latestWinner ?? 'n/a'}</b></div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">REINFORCEMENT_COMPETITION</h3>
                {comp.competitions.slice(0, 8).map((row, i) => (
                  <div key={`${row.timestamp}-${i}`} className="mb-2 rounded border border-slate-800 p-2 text-xs">
                    <div>Winner: <b>{row.winner}</b> | Effective: {row.adjustedConfidence ?? 0}</div>
                    <div>Losers: {row.losers.map((l) => `${l.source} (${l.reason}, ${l.effectiveModifier})`).join(' | ')}</div>
                    <div className="text-slate-400">{new Date(row.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">REINFORCEMENT_DECISION</h3>
                {comp.decisions.slice(0, 8).map((row, i) => (
                  <div key={`${row.timestamp}-${i}`} className="mb-2 rounded border border-slate-800 p-2 text-xs">
                    <div><b>{row.strategy}</b> {'->'} {row.source} | eff {row.effectiveModifier}</div>
                    <div>recency {row.recencyWeight} | sample {row.sampleWeight}</div>
                    <div>{row.decision}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Signal Performance" subtitle="Win rate history, cumulative PnL, strategy and regime breakdown." />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">Win rate history</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perf.winRateHistory.slice(-120)}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="index" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                  <Line type="monotone" dataKey="winRate" stroke="#10b981" dot={false} strokeWidth={2.2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">PnL over time</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perf.pnlOverTime.slice(-120)}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="index" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                  <Line type="monotone" dataKey="pnl" stroke="#38bdf8" dot={false} strokeWidth={2.2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">Strategy breakdown</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perf.strategyBreakdown.slice(0, 12)}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="strategy" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                  <Bar dataKey="winRate" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/40">
            <CardHeader><CardTitle className="text-slate-200">Market regime performance</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perf.marketRegimePerformance.slice(0, 12)}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="regime" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                  <Bar dataKey="winRate" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-800 bg-slate-950/40">
          <CardHeader><CardTitle className="text-slate-200">Context performance</CardTitle></CardHeader>
          <CardContent className="max-h-72 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Context</TableHead><TableHead>Trades</TableHead><TableHead>Win rate</TableHead><TableHead>Total PnL</TableHead></TableRow></TableHeader>
              <TableBody>
                {perf.contextPerformance.slice(0, 15).map((row) => (
                  <TableRow key={row.context}><TableCell>{row.context}</TableCell><TableCell>{row.trades}</TableCell><TableCell>{row.winRate}%</TableCell><TableCell>{row.totalPnL}%</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle title="Telegram Activity" subtitle="Delivery throughput, errors, latest send status, and TELEGRAM_MODE logs." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Signals sent</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{tel.signalsSent}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Errors</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{tel.errors}</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Delivery health</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{tel.deliveryHealth}%</CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-sm">Pending</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{tel.pendingSignals}</CardContent></Card>
        </div>
        <Card className="border-slate-800 bg-slate-950/40">
          <CardHeader><CardTitle className="text-slate-200">TELEGRAM_MODE logs</CardTitle></CardHeader>
          <CardContent className="max-h-64 overflow-auto text-xs">
            {tel.telegramModeLogs.slice(0, 12).map((row, i) => (
              <div key={`${row.timestamp}-${i}`} className="mb-2 rounded border border-slate-800 p-2">
                <div>{new Date(row.timestamp).toLocaleString()} | mode={row.mode} | isTest={String(row.isTest)} | showTestLabel={String(row.showTestLabel)}</div>
                {row.reason ? <div className="text-slate-400">{row.reason}</div> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionTitle title="System Health" subtitle="Scanner, telegram, database, cron and tracking heartbeat." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Scanner</CardTitle></CardHeader><CardContent><StatusBadge value={health.scannerStatus} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Telegram</CardTitle></CardHeader><CardContent><StatusBadge value={health.telegramStatus} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Database</CardTitle></CardHeader><CardContent><StatusBadge value={health.databaseStatus} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Cron</CardTitle></CardHeader><CardContent><StatusBadge value={health.cronStatus} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Tracking</CardTitle></CardHeader><CardContent><StatusBadge value={health.trackingStatus} /></CardContent></Card>
          <Card className="border-slate-800 bg-slate-950/40"><CardHeader><CardTitle className="text-xs">Heartbeat</CardTitle></CardHeader><CardContent className="text-xs">{health.heartbeat ? new Date(health.heartbeat).toLocaleString() : 'n/a'}</CardContent></Card>
        </div>
      </section>
    </div>
  )
}
