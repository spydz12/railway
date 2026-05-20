import { ProductionDashboard } from '../../components/dashboard/production-dashboard'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Production Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time monitoring for signals, reinforcement, telegram activity, performance, and bot health.
        </p>
      </div>
      <ProductionDashboard />
    </div>
  )
}