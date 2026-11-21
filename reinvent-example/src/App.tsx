import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Cart } from './phone/Cart'
import { Checkout } from './phone/Checkout'
import { Menu } from './phone/Menu'
import { OrderTracker } from './phone/OrderTracker'
import { PhoneFrame } from './phone/PhoneFrame'
import type { CartItem, CreateOrderResponse, MenuItem, PhoneScreen, Settings, TemporalUiInfo } from './phone/types'
import { useSSE } from './phone/useSSE'
import { Viewscreen } from './Viewscreen'

const DEFAULT_SETTINGS: Settings = {
  mode: 'temporal',
  failure_scenario: 'store_connectivity',
  presentation_mode: 'detailed',
  worker_language: 'python',
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
  const [temporalUi, setTemporalUi] = useState<TemporalUiInfo | null>(null)

  const { events, finalStatus, reset: resetSSE } = useSSE(orderId)

  // The three reads start together. The store read also registers this page's
  // session, which starts offline in the store-connectivity scenario; the UI
  // address lets the viewscreen start loading the Temporal UI before any order.
  useEffect(() => {
    Promise.all([
      fetch(api('/settings')).then((r) => r.json() as Promise<Partial<Settings>>),
      fetch(api('/store/status')).then((r) => r.json() as Promise<{ online: boolean }>),
      fetch(api('/temporal-ui')).then((r) => r.json() as Promise<TemporalUiInfo>),
    ])
      .then(([backendSettings, store, ui]) => {
        setSettings((prev) => ({ ...prev, ...backendSettings }))
        setStoreOnline(store.online)
        setTemporalUi(ui)
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

  const storeLabel = storeOnline === null ? 'unknown' : storeOnline ? 'online' : 'offline'
  const orderOpen = orderId !== null && finalStatus === null

  return (
    <div className="frame">
      <div className="arm" aria-hidden="true">
        <div className="arm-top" />
        <div className="arm-seg" />
        <div className="arm-seg arm-seg-short" />
        <div className="arm-foot" />
      </div>
      <header className="head">
        <h1>Déjà Vu Tacos · Workflow Viewscreen</h1>
        <span className="head-meta" aria-hidden="true">
          Deck 04
        </span>
      </header>
      <div className="bar bar-top" aria-hidden="true">
        <span className="c-periwinkle" style={{ flex: 5 }} />
        <span className="c-orange" style={{ flex: 0.3 }} />
        <span className="c-lilac" style={{ flex: 2 }} />
        <span className="c-peach" style={{ flex: 0.6 }} />
      </div>

      <main className="body">
        <section className="station" aria-label="Customer app">
          <div className="phone-well">
            <PhoneFrame chrome="linear-gradient(to right, #f97316, #ef4444)" background="#fff7ed" foreground="#1f2937">
              {renderPhone()}
            </PhoneFrame>
          </div>
          <div className="controls" aria-label="Kitchen controls">
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <div className="status" data-status={storeOnline ? 'completed' : 'waiting'} aria-live="polite">
              <span className="lamp" aria-hidden="true" />
              <span>Store link {storeLabel}</span>
            </div>
            <button
              type="button"
              className="pill pill-a"
              onClick={reconnectStore}
              disabled={busy !== null || storeOnline === true}
            >
              {busy === 'store' ? 'Reconnecting…' : 'Reconnect store'}
            </button>
            <button
              type="button"
              className="pill pill-b"
              onClick={markReady}
              disabled={busy !== null || !orderOpen}
              title={orderOpen ? 'Send the order_ready Signal to the Workflow' : 'Available while an order is open'}
            >
              {busy === 'ready' ? 'Signalling…' : 'Mark ready'}
            </button>
          </div>
        </section>

        <Viewscreen
          uiBase={temporalUi?.base_url ?? null}
          namespace={temporalUi?.namespace ?? null}
          timelineUrl={timelineUrl}
          workflowId={workflowId}
          temporalMode={settings.mode === 'temporal'}
        />
      </main>

      <div className="bar bar-bottom" aria-hidden="true">
        <span className="c-tan" style={{ flex: 2 }} />
        <span className="c-peach" style={{ flex: 0.3 }} />
        <span className="c-lilac" style={{ flex: 5 }} />
      </div>
    </div>
  )
}
