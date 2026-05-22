'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../../lib/utils'
import {
  TrendingUp,
  Activity,
  PieChart,
  Shield,
  Home,
  GitBranch,
  Rocket,
  Bitcoin,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Crypto Signals', href: '/dashboard/crypto', icon: Bitcoin },
  { name: 'Signals', href: '/dashboard/signals', icon: Activity },
  { name: 'Performance', href: '/dashboard/performance', icon: PieChart },
  { name: 'Reinforcement', href: '/dashboard/reinforcement', icon: GitBranch },
  { name: 'Deployment', href: '/dashboard/deployment', icon: Rocket },
  { name: 'System Health', href: '/dashboard/system', icon: Shield },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r">
      <div className="flex h-16 items-center px-6 border-b">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold">AI Trading OS</span>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}