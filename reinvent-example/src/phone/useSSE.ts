import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { OrderEvent } from './types'

interface Stream {
  orderId: string
  events: OrderEvent[]
  finalStatus: string | null
}

// Follows one order's server-sent events. The state remembers which order it
// belongs to, so a new order (or none) reads as empty without clearing state
// inside the effect.
export function useSSE(orderId: string | null) {
  const [stream, setStream] = useState<Stream | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!orderId) return

    const source = new EventSource(api(`/orders/${orderId}/events`))
    sourceRef.current = source
    const update = (change: (s: Stream) => Stream) =>
      setStream((prev) => change(prev?.orderId === orderId ? prev : { orderId, events: [], finalStatus: null }))

    source.addEventListener('order_update', (e) => {
      const event: OrderEvent = JSON.parse(e.data)
      update((s) => ({ ...s, events: [...s.events, event] }))
    })

    source.addEventListener('order_complete', (e) => {
      const data = JSON.parse(e.data)
      update((s) => ({ ...s, finalStatus: data.final_status }))
      source.close()
    })

    source.addEventListener('timeout', () => {
      source.close()
    })

    source.onerror = () => {
      source.close()
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [orderId])

  const reset = () => {
    sourceRef.current?.close()
    setStream(null)
  }

  const current = stream?.orderId === orderId ? stream : null
  return { events: current?.events ?? [], finalStatus: current?.finalStatus ?? null, reset }
}
