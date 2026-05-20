'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { MetricCard } from '../../../components/dashboard/metric-card'

interface BacktestTrade {
  entryDate: string
  exitDate: string
  symbol: string
  side: 'long' | 'short'
  entryPrice: number
  exitPrice: number
  quantity: number
  pnl: number
  pnlPercent: number
  holdingPeriod: number
  strategy: string
  reason: string
}

interface BacktestResult {
  totalReturn: number
  annualizedReturn: number
  maxDrawdown: number
  winRate: number
  profitFactor: number
  totalTrades: number
  avgTradeReturn: number
  sharpeRatio: number
  calmarRatio: number
  trades: BacktestTrade[]
  equityCurve: Array<{ date: string; equity: number }>
  monthlyReturns: Array<{ month: string; return: number }>
}

export default function BacktestsPage() {
  const [strategy, setStrategy] = useState('trend_pullback')
  const [timeframe, setTimeframe] = useState('15m')
  const [symbol, setSymbol] = useState('SPY')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)

  const runBacktest = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        strategy,
        timeframe,
        symbol,
      })
      if (start) params.set('start', start)
      if (end) params.set('end', end)

      const response = await fetch(`/api/analytics/backtests?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Backtest failed (${response.status})`)
      }

      const payload = (await response.json()) as BacktestResult
      setResult(payload)
    } finally {
      setLoading(false)
    }
  }

  const drawdownSeries = useMemo(() => {
    const curve = result?.equityCurve ?? []
    let peak = Number.NEGATIVE_INFINITY
    return curve.map((row) => {
      peak = Math.max(peak, row.equity)
      const dd = peak > 0 ? ((peak - row.equity) / peak) * 100 : 0
      return {
        date: row.date,
        drawdown: Number(dd.toFixed(2)),
      }
    })
  }, [result])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Backtests</h1>
        <p className="text-sm text-slate-400">Institutional validation with real historical candles and strategy outcomes.</p>
      </div>

      <Card className="border-slate-800 bg-slate-950/45">
        <CardHeader>
          <CardTitle className="text-slate-200">Backtest Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200">
              <option value="trend_pullback">Trend Pullback</option>
              <option value="breakout_volume">Breakout Volume</option>
              <option value="support_bounce">Support Bounce</option>
              <option value="vwap_reclaim">VWAP Reclaim</option>
              <option value="orb">ORB</option>
              <option value="ema_cloud_trend">EMA Cloud Trend</option>
              <option value="mean_reversion">Mean Reversion</option>
            </select>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200">
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200" />
            <input value={start} onChange={(e) => setStart(e.target.value)} type="date" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200" />
            <input value={end} onChange={(e) => setEnd(e.target.value)} type="date" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200" />
          </div>
          <div className="mt-4">
            <Button onClick={runBacktest} disabled={loading}>{loading ? 'Running...' : 'Run Backtest'}</Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total Return" value={`${result.totalReturn.toFixed(2)}%`} />
            <MetricCard title="Win Rate" value={`${result.winRate.toFixed(2)}%`} />
            <MetricCard title="Sharpe" value={result.sharpeRatio.toFixed(3)} />
            <MetricCard title="Max Drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-slate-800 bg-slate-950/45">
              <CardHeader><CardTitle className="text-slate-200">Equity Curve</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.equityCurve}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#94a3b8" hide />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                    <Line type="monotone" dataKey="equity" stroke="#22d3ee" dot={false} strokeWidth={2.2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/45">
              <CardHeader><CardTitle className="text-slate-200">Drawdown Chart</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={drawdownSeries}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#94a3b8" hide />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                    <Line type="monotone" dataKey="drawdown" stroke="#ef4444" dot={false} strokeWidth={2.2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-800 bg-slate-950/45">
            <CardHeader><CardTitle className="text-slate-200">Monthly Returns</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.monthlyReturns}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ background: '#020617', borderColor: '#334155' }} />
                  <Bar dataKey="return" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/45">
            <CardHeader><CardTitle className="text-slate-200">Trades</CardTitle></CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto rounded-md border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Symbol</th>
                      <th className="px-3 py-2 text-left">Entry</th>
                      <th className="px-3 py-2 text-left">Exit</th>
                      <th className="px-3 py-2 text-left">PnL</th>
                      <th className="px-3 py-2 text-left">PnL %</th>
                      <th className="px-3 py-2 text-left">Hold (d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((trade, idx) => (
                      <tr key={`${trade.symbol}-${idx}`} className="border-t border-slate-800 text-slate-200">
                        <td className="px-3 py-2">{trade.symbol}</td>
                        <td className="px-3 py-2">{trade.entryPrice.toFixed(2)}</td>
                        <td className="px-3 py-2">{trade.exitPrice.toFixed(2)}</td>
                        <td className={`px-3 py-2 ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{trade.pnl.toFixed(2)}</td>
                        <td className={`px-3 py-2 ${trade.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{trade.pnlPercent.toFixed(2)}%</td>
                        <td className="px-3 py-2">{trade.holdingPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
