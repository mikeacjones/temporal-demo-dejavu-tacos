import { useCallback, useEffect, useState } from 'react'
import { BackstagePanel } from './components/BackstagePanel'
import { Cart } from './components/Cart'
import { Checkout } from './components/Checkout'
import { KitchenDisplay } from './components/KitchenDisplay'
import { Menu } from './components/Menu'
import { OrderTracker } from './components/OrderTracker'
import { PhoneFrame } from './components/PhoneFrame'
import { SettingsModal } from './components/SettingsModal'
import { TemporalCodeView } from './components/TemporalCodeView'
import { TraditionalArchDiagram } from './components/TraditionalArchDiagram'
import { useSSE } from './hooks/useSSE'
import type {
  CartItem,
  CreateOrderResponse,
  DemoTab,
  MenuItem,
  PhoneScreen,
  Settings,
  TemporalUiInfo,
} from './types'

const DEFAULT_SETTINGS: Settings = {
  mode: 'temporal',
  failure_scenario: 'store_connectivity',
  presentation_mode: 'detailed',
  worker_language: 'python',
}

function App() {
  const [tab, setTab] = useState<DemoTab>('customer')
  const [screen, setScreen] = useState<PhoneScreen>('menu')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [isOrdering, setIsOrdering] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [temporalUi, setTemporalUi] = useState<TemporalUiInfo | null>(null)
  const [temporalWorkflowUrl, setTemporalWorkflowUrl] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { events, finalStatus, reset: resetSSE } = useSSE(orderId)

  // Load settings from backend on mount
  useEffect(() => {
    // Load backend settings + detected worker language
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/worker-language').then((r) => r.json()).catch(() => ({ language: 'python' })),
      fetch('/api/temporal-ui').then((r) => r.json()).catch(() => null),
    ]).then(([backendSettings, langData, temporalUiData]) => {
      setSettings((prev) => ({
        ...prev,
        ...backendSettings,
        worker_language: langData.language || 'python',
      }))
      if (temporalUiData?.namespace_url) {
        setTemporalUi(temporalUiData)
      }
    }).catch(() => {})
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      setSettings(newSettings)
      // Send only backend-relevant settings (worker_language is frontend-only)
      const { worker_language: _, ...backendSettings } = newSettings
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendSettings),
      })
      // Reset order state when settings change
      setOrderId(null)
      setTemporalWorkflowUrl(null)
      setScreen('menu')
      setCart([])
      resetSSE()
    },
    [resetSSE]
  )

  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, quantity: 1, price: item.price },
      ]
    })
  }, [])

  const handleUpdateQuantity = useCallback(
    (menuItemId: string, delta: number) => {
      setCart((prev) =>
        prev
          .map((c) =>
            c.menu_item_id === menuItemId
              ? { ...c, quantity: c.quantity + delta }
              : c
          )
          .filter((c) => c.quantity > 0)
      )
    },
    []
  )

  const handlePlaceOrder = useCallback(async () => {
    setIsOrdering(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      })
      const data = (await res.json()) as CreateOrderResponse
      setOrderId(data.order_id)
      setTemporalWorkflowUrl(data.temporal_ui_url || null)
      setScreen('tracking')
    } finally {
      setIsOrdering(false)
    }
  }, [cart])

  const handleNewOrder = useCallback(() => {
    setOrderId(null)
    setTemporalWorkflowUrl(null)
    setCart([])
    setScreen('menu')
    resetSSE()
  }, [resetSSE])

  const renderPhoneContent = () => {
    switch (screen) {
      case 'menu':
        return (
          <Menu
            cart={cart}
            onAddToCart={handleAddToCart}
            onViewCart={() => setScreen('cart')}
          />
        )
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
        return (
          <OrderTracker
            events={events}
            finalStatus={finalStatus}
            settings={settings}
            onNewOrder={handleNewOrder}
          />
        )
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-1">
          {/* Tab buttons */}
          <button
            onClick={() => setTab('customer')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'customer'
                ? 'bg-orange-500 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            📱 Customer App
          </button>
          <button
            onClick={() => setTab('kitchen')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'kitchen'
                ? 'bg-orange-500 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            🖥️ Kitchen Display
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode indicator */}
          {settings.mode === 'temporal' ? (
            <a
              href={temporalUi?.namespace_url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!temporalUi?.namespace_url}
              className={`text-xs px-2 py-1 rounded-full font-medium bg-purple-500/20 text-purple-300 transition-colors ${
                temporalUi?.namespace_url
                  ? 'hover:bg-purple-500/30 hover:text-purple-100 cursor-pointer'
                  : 'cursor-default'
              }`}
              onClick={(event) => {
                if (!temporalUi?.namespace_url) event.preventDefault()
              }}
              title={
                temporalUi?.namespace
                  ? `Open ${temporalUi.namespace} in Temporal UI`
                  : 'Open Temporal namespace'
              }
            >
              ⚡ Temporal
            </a>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-500/20 text-red-300">
              🔗 Traditional
            </span>
          )}

          {/* Settings gear */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-gray-400 hover:text-gray-200 text-xl transition-colors"
            title="Demo Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'customer' ? (
          <div className="flex-1 flex items-stretch overflow-hidden">
            <PhoneFrame>{renderPhoneContent()}</PhoneFrame>
            <BackstagePanel
              events={events}
              settings={settings}
              finalStatus={finalStatus}
              temporalWorkflowUrl={temporalWorkflowUrl}
            />
            {/* Third column: complexity diagram (traditional) or code view (temporal) */}
            <div className="min-w-[33vw] flex-1 flex-shrink-0 bg-gray-850 border-l border-gray-700 overflow-hidden">
              {settings.mode === 'traditional' ? (
                <TraditionalArchDiagram events={events} finalStatus={finalStatus} />
              ) : (
                <TemporalCodeView events={events} finalStatus={finalStatus} language={settings.worker_language} />
              )}
            </div>
          </div>
        ) : (
          <KitchenDisplay />
        )}
      </div>

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  )
}

export default App
