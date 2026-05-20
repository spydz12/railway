import { ProductionDashboard } from '../../../components/dashboard/production-dashboard'

export default function DashboardSystemPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">System Health</h1>
        <p className="text-sm text-slate-400">Scanner, telegram, database, cron, tracking and heartbeat status.</p>
      </div>
      <ProductionDashboard />
    </div>
  )
}
