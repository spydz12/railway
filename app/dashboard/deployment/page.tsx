import { DeploymentReadinessPanel } from '../../../components/dashboard/deployment-readiness'

export default function DashboardDeploymentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Deployment Readiness</h1>
        <p className="text-sm text-slate-400">Cloud deployment architecture, blockers, and worker requirements.</p>
      </div>
      <DeploymentReadinessPanel />
    </div>
  )
}
