import { cn } from '../../lib/utils'

interface AIConfidenceBarProps {
  value: number
  label?: string
}

export function AIConfidenceBar({ value, label }: AIConfidenceBarProps) {
  const normalized = Math.max(0, Math.min(100, value))
  const tone = normalized >= 70 ? 'bg-emerald-500' : normalized >= 45 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-1">
      {label ? <div className="text-xs text-slate-400">{label}</div> : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn('h-full transition-all duration-700', tone)}
          style={{ width: `${normalized}%` }}
        />
      </div>
      <div className="text-right text-xs font-medium text-slate-300">{normalized.toFixed(1)}%</div>
    </div>
  )
}
