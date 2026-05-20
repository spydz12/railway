import { Clock3 } from 'lucide-react'

interface TimelineEvent {
  id: string
  label: string
  detail: string
  timestamp: string
}

interface SignalTimelineProps {
  events: TimelineEvent[]
}

export function SignalTimeline({ events }: SignalTimelineProps) {
  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={event.id} className="relative flex gap-3">
          <div className="flex w-7 flex-col items-center">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />
            {index !== events.length - 1 ? <div className="mt-1 h-full w-px bg-slate-700" /> : null}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <Clock3 className="h-3.5 w-3.5 text-cyan-400" />
              {event.label}
            </div>
            <p className="mt-1 text-xs text-slate-300">{event.detail}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">{new Date(event.timestamp).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
