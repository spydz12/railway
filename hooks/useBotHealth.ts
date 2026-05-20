'use client'

import { useCallback, useState } from 'react'
import { useRealtimeOrPolling } from './useRealtimeOrPolling'

interface BotHealthPayload {
  generatedAt: string
  systemHealth: {
    scannerStatus: string
    telegramStatus: string
    databaseStatus: string
    cronStatus: string
    trackingStatus: string
    heartbeat: string | null
  }
  telegramActivity: {
    deliveryHealth: number
    errors: number
  }
}

export function useBotHealth() {
  const [health, setHealth] = useState<BotHealthPayload | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/dashboard/health')
    if (!res.ok) return
    const payload = (await res.json()) as BotHealthPayload
    setHealth(payload)
  }, [])

  useRealtimeOrPolling({ refresh, pollIntervalMs: 5000 })

  return { health, refresh }
}
