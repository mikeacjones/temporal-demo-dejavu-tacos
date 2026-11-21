import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Cart } from './phone/Cart'
import { Checkout } from './phone/Checkout'
import { Menu } from './phone/Menu'
import { OrderTracker } from './phone/OrderTracker'
import { PhoneFrame } from './phone/PhoneFrame'
import type { CartItem, CreateOrderResponse, MenuItem, PhoneScreen, Settings } from './phone/types'
import { useSSE } from './phone/useSSE'

const DEFAULT_SETTINGS: Settings = {
  mode: 'temporal',
  failure_scenario: 'store_connectivity',
  presentation_mode: 'detailed',
  worker_language: 'python',
}

// The timeline can only be framed from the same origin: the Temporal UI sends
// X-Frame-Options: SAMEORIGIN. On the demo host the operator serves the namespace's
// public, read-only UI at /_temporal/primary/, so the backend's links are same-origin.
// Anywhere else (a laptop's dev server on :8233, Temporal Cloud) gets a link instead.
function sameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

export default function App() {
  const [screen, setScreen] = useState<PhoneScreen>('menu')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [isOrdering, setIsOrdering] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [timelineUrl, setTimelineUrl] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [storeOnline, setStoreOnline] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<'store' | 'ready' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { events, finalStatus, reset: resetSSE } = useSSE(orderId)

  // Both reads start together. The store read also registers this page's session,
  // which starts offline in the store-connectivity scenario.
  useEffect(() => {
    Promise.all([
      fetch(api('/settings')).then((r) => r.json() as Promise<Partial<Settings>>),
      fetch(api('/store/status')).then((r) => r.json() as Promise<{ online: boolean }>),
    ])
      .then(([backendSettings, store]) => {
        setSettings((prev) => ({ ...prev, ...backendSettings }))
        setStoreOnline(store.online)
      })
      .catch(() => setNotice('Could not reach the tacos backend. Reload to try again.'))
  }, [])

  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) => (c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
      }
      return [...prev, { menu_item_id: item.id, name: item.name, quantity: 1, price: item.price }]
    })
  }, [])

  const handleUpdateQuantity = useCallback((menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    )
  }, [])

  // The create response carries the Workflow's timeline URL, so the viewscreen
  // switches to the new order with no second request.
  const handlePlaceOrder = useCallback(async () => {
    setIsOrdering(true)
    setNotice(null)
    try {
      const res = await fetch(api('/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as CreateOrderResponse
      setOrderId(data.order_id)
      setWorkflowId(data.workflow_id || null)
      setTimelineUrl(data.temporal_ui_url || null)
      setScreen('tracking')
    } catch (error) {
      setNotice(`The order was not placed (${String(error)}). Try again.`)
    } finally {
      setIsOrdering(false)
    }
  }, [cart])

  const handleNewOrder = useCallback(() => {
    setOrderId(null)
    setCart([])
    setScreen('menu')
    resetSSE()
  }, [resetSSE])

  const reconnectStore = useCallback(async () => {
    setBusy('store')
    setNotice(null)
    try {
      const res = await fetch(api('/store/go-online'), { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStoreOnline(((await res.json()) as { online: boolean }).online)
    } catch (error) {
      setNotice(`The store did not reconnect (${String(error)}). Try again.`)
    } finally {
      setBusy(null)
    }
  }, [])

  const markReady = useCallback(async () => {
    if (!orderId) return
    setBusy('ready')
    setNotice(null)
    try {
      const res = await fetch(api(`/store/order-ready/${orderId}`), { method: 'POST' })
      if (res.status === 404) {
        setNotice('The kitchen has not received this order yet. Reconnect the store, then mark it ready.')
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (error) {
      setNotice(`The kitchen did not take that (${String(error)}). Try again.`)
    } finally {
      setBusy(null)
    }
  }, [orderId])

  const renderPhone = () => {
    switch (screen) {
      case 'menu':
        return <Menu cart={cart} onAddToCart={handleAddToCart} onViewCart={() => setScreen('cart')} />
      case 'cart':
        return (
          <Cart
            items={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onCheckout={() => setScreen('checkout')}
            onBack={() => setScreen('menu')}
          />
        )
      case 'checkout':
        return (
          <Checkout
            items={cart}
            onPlaceOrder={handlePlaceOrder}
            onBack={() => setScreen('cart')}
            isLoading={isOrdering}
          />
        )
      case 'tracking':
        return <OrderTracker events={events} finalStatus={finalStatus} settings={settings} onNewOrder={handleNewOrder} />
    }
  }

  const storeLabel = storeOnline === null ? 'UNKNOWN' : storeOnline ? 'ONLINE' : 'OFFLINE'
  const orderOpen = orderId !== null && finalStatus === null

  return (
    <div className="console">
      <header className="console-header">
        <div className="lights" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`light light-${i % 3}`} />
          ))}
        </div>
        <h1>Déjà Vu Tacos · Workflow viewscreen</h1>
        <div className="lights" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`light light-${(i + 1) % 3}`} />
          ))}
        </div>
      </header>

      <section className="station station-phone" aria-label="Customer app">
        <div className="phone-well">
          <PhoneFrame chrome="linear-gradient(to right, #f97316, #ef4444)" background="#fff7ed" foreground="#1f2937">
            {renderPhone()}
          </PhoneFrame>
        </div>

        <div className="controls" aria-label="Kitchen controls">
          <div className="readout" data-status={storeOnline ? 'completed' : 'waiting'} aria-live="polite">
            <span className="lamp" aria-hidden="true" />
            <span>Store link: {storeLabel}</span>
          </div>
          <button
            type="button"
            className="big-button big-button-cyan"
            onClick={reconnectStore}
            disabled={busy !== null || storeOnline === true}
          >
            {busy === 'store' ? 'Reconnecting…' : 'Reconnect store'}
          </button>
          <button
            type="button"
            className="big-button big-button-amber"
            onClick={markReady}
            disabled={busy !== null || !orderOpen}
            title={orderOpen ? 'Send the order_ready Signal to the Workflow' : 'Available while an order is open'}
          >
            {busy === 'ready' ? 'Signalling…' : 'Mark ready'}
          </button>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </section>

      <section className="station station-screen" aria-label="Workflow timeline">
        <div className="screen-head">
          <span className="screen-label">Viewscreen</span>
          <span className="screen-id">{workflowId ?? 'No Workflow yet'}</span>
        </div>
        <div className="viewscreen">
          {settings.mode !== 'temporal' ? (
            <p className="screen-empty">The backend is set to the traditional architecture, so orders run without a Workflow.</p>
          ) : timelineUrl === null ? (
            <p className="screen-empty">Start an order to see the Workflow</p>
          ) : sameOrigin(timelineUrl) ? (
            // A new key per order loads a fresh frame for each Workflow.
            <iframe key={timelineUrl} src={timelineUrl} title={`Timeline of ${workflowId ?? 'the order Workflow'}`} />
          ) : (
            <p className="screen-empty">
              This Temporal UI is on another origin and refuses to be framed.{' '}
              <a href={timelineUrl} target="_blank" rel="noreferrer">
                Open the timeline in a new tab
              </a>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
