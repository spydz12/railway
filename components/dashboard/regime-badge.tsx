import { cn } from '../../lib/utils'

interface RegimeBadgeProps {
  regime: string
  animated?: boolean
}

const regimeStyles: Record<string, string> = {
  trending: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  ranging: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  volatile: 'border-red-500/40 bg-red-500/15 text-red-300',
  unknown: 'border-slate-600/40 bg-slate-600/15 text-slate-300',
}

export function RegimeBadge({ regime, animated = false }: RegimeBadgeProps) {
  const key = regime.toLowerCase()
  const style = regimeStyles[key] ?? regimeStyles.unknown

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        style,
        animated && 'animate-pulse'
      )}
    >
      {regime || 'unknown'}
    </span>
  )
}
