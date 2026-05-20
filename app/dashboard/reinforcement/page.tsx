import { ProductionDashboard } from '../../../components/dashboard/production-dashboard'

export default function DashboardReinforcementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Reinforcement</h1>
        <p className="text-sm text-slate-400">Source competition, modifiers, and learning intelligence.</p>
      </div>
      <ProductionDashboard />
    </div>
  )
}
