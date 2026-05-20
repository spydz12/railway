'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Eye, TrendingUp } from 'lucide-react'

interface TradeIdea {
  id: string
  ticker: string
  strategy_slug: string
  confidence_score: number
  ai_decision?: 'APPROVE' | 'REJECT' | 'WATCH' | null
  market_condition: string
  ai_risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | null
  fakeout_probability?: number | null
  adaptive_confidence_adjustment?: number | null
  status: string
  created_at: string
}

export function LiveSignalsTable() {
  const [signals, setSignals] = useState<TradeIdea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const response = await fetch('/api/ideas/active')
        if (response.ok) {
          const data = (await response.json()) as TradeIdea[]
          setSignals(data)
        }
      } catch (error) {
        console.error('Failed to fetch signals:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSignals()
    const interval = setInterval(fetchSignals, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'APPROVE': return 'bg-green-500'
      case 'REJECT': return 'bg-red-500'
      case 'WATCH': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-500'
      case 'MEDIUM': return 'text-yellow-500'
      case 'HIGH': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-500'
      case 'pending': return 'bg-blue-500'
      case 'stopped': return 'bg-red-500'
      case 'watch': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Signals</CardTitle>
          <CardDescription>Loading signal feed...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Signals</CardTitle>
        <CardDescription>
          Real-time signal feed with AI analysis and market context
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>AI Decision</TableHead>
              <TableHead>Market Regime</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Fakeout Prob</TableHead>
              <TableHead>Reinforcement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="text-muted-foreground">
                    No active signals at the moment
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => (
                <TableRow key={signal.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center space-x-2">
                      {signal.ticker.includes('USDT') ? (
                        <TrendingUp className="h-4 w-4 text-orange-500" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                      )}
                      <span>{signal.ticker}</span>
                    </div>
                  </TableCell>
                  <TableCell>{signal.strategy_slug}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{signal.confidence_score}%</span>
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${signal.confidence_score}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getDecisionColor(signal.ai_decision ?? 'UNKNOWN')} text-white`}>
                      {signal.ai_decision ?? 'UNKNOWN'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{signal.market_condition}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${getRiskColor(signal.ai_risk_level ?? 'LOW')}`}>
                      {signal.ai_risk_level ?? 'LOW'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-red-500">{(signal.fakeout_probability ?? 0).toFixed(1)}%</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <span>{(signal.adaptive_confidence_adjustment ?? 0).toFixed(2)}</span>
                      <div className="w-8 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${Math.min(Math.abs(signal.adaptive_confidence_adjustment ?? 0) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getStatusColor(signal.status)} text-white`}>
                      {signal.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/signals/${signal.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}