import { CryptoDashboard } from '../../../components/dashboard/crypto-dashboard'

export default function CryptoDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Crypto Signals</h1>
        <p className="text-muted-foreground">
          Live admin dashboard — trade ideas, portfolio exposure, and AI approvals
        </p>
      </div>
      <CryptoDashboard />
    </div>
  )
}
