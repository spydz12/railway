'use client'

import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { cn } from '../../lib/utils'

interface MetricCardProps {
  title: string
  value: string
  subtitle?: string
  icon?: ReactNode
  trend?: {
    direction: 'up' | 'down' | 'neutral'
    label: string
  }
  className?: string
}

export function MetricCard({ title, value, subtitle, icon, trend, className }: MetricCardProps) {
  const trendClass =
    trend?.direction === 'up'
      ? 'text-emerald-400'
      : trend?.direction === 'down'
      ? 'text-red-400'
      : 'text-slate-400'

  return (
    <Card className={cn('border-slate-800/80 bg-slate-950/40 backdrop-blur-sm', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</CardTitle>
          {icon ? <div className="text-slate-500">{icon}</div> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-slate-100">{value}</div>
        {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        {trend ? <p className={cn('mt-2 text-xs font-medium', trendClass)}>{trend.label}</p> : null}
      </CardContent>
    </Card>
  )
}
