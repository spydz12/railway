import { cn } from '../../lib/utils'

interface RiskBadgeProps {
  risk: string
}

const riskStyles: Record<string, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  high: 'border-red-500/40 bg-red-500/15 text-red-300',
}

export function RiskBadge({ risk }: RiskBadgeProps) {
  const style = riskStyles[risk.toLowerCase()] ?? 'border-slate-600/40 bg-slate-600/15 text-slate-300'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        style
      )}
    >
      {risk}
    </span>
  )
}
