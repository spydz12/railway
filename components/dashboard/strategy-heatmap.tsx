import { cn } from '../../lib/utils'

export interface StrategyHeatmapCell {
  strategy: string
  regime: string
  score: number
}

interface StrategyHeatmapProps {
  cells: StrategyHeatmapCell[]
}

function tone(score: number): string {
  if (score >= 75) return 'bg-emerald-500/40 text-emerald-200'
  if (score >= 55) return 'bg-cyan-500/35 text-cyan-100'
  if (score >= 35) return 'bg-amber-500/30 text-amber-100'
  return 'bg-red-500/30 text-red-100'
}

export function StrategyHeatmap({ cells }: StrategyHeatmapProps) {
  const strategies = Array.from(new Set(cells.map((cell) => cell.strategy)))
  const regimes = Array.from(new Set(cells.map((cell) => cell.regime)))

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `180px repeat(${regimes.length}, minmax(92px, 1fr))` }}
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Strategy</div>
        {regimes.map((regime) => (
          <div key={regime} className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
            {regime}
          </div>
        ))}

        {strategies.map((strategy) => (
          <div key={strategy} className="contents">
            <div key={`${strategy}-name`} className="flex items-center text-sm font-medium text-slate-200">
              {strategy}
            </div>
            {regimes.map((regime) => {
              const value = cells.find((cell) => cell.strategy === strategy && cell.regime === regime)
              const score = value?.score ?? 0
              return (
                <div
                  key={`${strategy}-${regime}`}
                  className={cn('rounded-md border border-slate-700 p-2 text-center text-xs font-semibold', tone(score))}
                >
                  {score.toFixed(1)}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
