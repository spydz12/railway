'use client'

import { useEffect } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface RealtimeOptions {
  refresh: () => Promise<void> | void
  pollIntervalMs?: number
  table?: string
  schema?: string
  enabled?: boolean
}

let browserClient: SupabaseClient | null = null

function getBrowserSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  if (!browserClient) {
    browserClient = createClient(url, key)
  }

  return browserClient
}

export function useRealtimeOrPolling({
  refresh,
  pollIntervalMs = 6000,
  table,
  schema = 'public',
  enabled = true,
}: RealtimeOptions) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    void refresh()

    const supabase = getBrowserSupabaseClient()

    let reconnectTimer: number | null = null

    if (supabase && table) {
      const channel = supabase
        .channel(`realtime-${table}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema, table },
          () => {
            void refresh()
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (reconnectTimer !== null) {
              window.clearTimeout(reconnectTimer)
            }

            reconnectTimer = window.setTimeout(() => {
              void supabase.removeChannel(channel)
              void refresh()
            }, Math.max(1000, pollIntervalMs / 2))
          }
        })

      return () => {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer)
        }
        void supabase.removeChannel(channel)
      }
    }

    const interval = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [enabled, pollIntervalMs, refresh, schema, table])
}
