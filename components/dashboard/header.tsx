'use client'

import { Bell, User } from 'lucide-react'
import { Button } from '../ui/button'

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between px-6 border-b bg-card">
      <div className="flex items-center space-x-4">
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="sm">
          <Bell className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm">
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}