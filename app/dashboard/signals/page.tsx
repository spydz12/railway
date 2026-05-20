import { LiveSignalsTable } from '../../../components/dashboard/live-signals'

export default function SignalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live Signals</h1>
        <p className="text-muted-foreground">
          Real-time signal feed with AI analysis and market context
        </p>
      </div>
      <LiveSignalsTable />
    </div>
  )
}