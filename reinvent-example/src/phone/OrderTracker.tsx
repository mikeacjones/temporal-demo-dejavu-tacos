import type { OrderEvent, Settings, StepStatus } from './types'

interface OrderTrackerProps {
  events: OrderEvent[]
  finalStatus: string | null
  settings: Settings
  onNewOrder: () => void
}

// User-facing phases (simplified from the internal workflow steps)
const PHASES = [
  {
    key: 'order_placed',
    label: 'Order Placed',
    icon: '📋',
    matchSteps: ['validate_order', 'validate_store'],
  },
  {
    key: 'payment',
    label: 'Payment',
    icon: '💳',
    matchSteps: ['authorize_payment', 'clear_cart'],
  },
  {
    key: 'sent_to_store',
    label: 'Sent to Store',
    icon: '🏪',
    matchSteps: ['submit_to_store'],
  },
  {
    key: 'preparing',
    label: 'Preparing',
    icon: '👨‍🍳',
    matchSteps: ['order_ready'],
  },
  {
    key: 'ready',
    label: 'Ready for Pickup',
    icon: '🎉',
    matchSteps: ['capture_payment', 'notify_customer_success'],
  },
]

function getPhaseStatus(matchSteps: string[], events: OrderEvent[]): StepStatus {
  const relevant = events.filter((e) => matchSteps.includes(e.step))
  if (relevant.length === 0) return 'pending'

  const lastByStep = new Map<string, OrderEvent>()
  for (const e of relevant) {
    lastByStep.set(e.step, e)
  }
  const statuses = [...lastByStep.values()].map((e) => e.status)

  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('retrying')) return 'retrying'
  if (statuses.includes('running')) return 'running'

  // Any matched step completed = phase completed
  if (statuses.includes('completed')) return 'completed'

  return 'running'
}

function getPhaseStatusWithFinal(
  phase: typeof PHASES[number],
  events: OrderEvent[],
  finalStatus: string | null,
  isLastPhase: boolean
): StepStatus {
  // For the last phase, derive status from finalStatus if available
  if (isLastPhase && finalStatus === 'completed') return 'completed'
  if (isLastPhase && (finalStatus === 'failed' || finalStatus === 'refunded')) return 'failed'
  return getPhaseStatus(phase.matchSteps, events)
}

function getActivePhaseIndex(events: OrderEvent[]): number {
  let lastActive = -1
  for (let i = 0; i < PHASES.length; i++) {
    const status = getPhaseStatus(PHASES[i].matchSteps, events)
    if (status !== 'pending') lastActive = i
  }
  return lastActive
}

export function OrderTracker({
  events,
  finalStatus,
  settings,
  onNewOrder,
}: OrderTrackerProps) {
  const hasFailed = finalStatus === 'failed'
  const isComplete = finalStatus === 'completed'
  const isRefunded = finalStatus === 'refunded'
  const isDone = hasFailed || isComplete || isRefunded

  // Check if currently retrying (and hasn't recovered yet)
  const submitEvents = events.filter((e) => e.step === 'submit_to_store')
  const lastSubmitEvent = submitEvents[submitEvents.length - 1]
  const isActivelyRetrying =
    lastSubmitEvent &&
    (lastSubmitEvent.status === 'retrying' || lastSubmitEvent.status === 'running') &&
    !isDone

  // Check if store has received the order (submit succeeded)
  const storeReceived = submitEvents.some((e) => e.status === 'completed')

  const activeIndex = getActivePhaseIndex(events)

  // Status message for the hero area
  let heroEmoji = '⏳'
  let heroTitle = 'Placing your order...'
  let heroSubtitle = 'Hang tight!'
  let heroBg = 'bg-orange-50'
  let heroTextColor = 'text-orange-800'
  let heroSubColor = 'text-orange-600'

  if (isComplete) {
    heroEmoji = '🎉'
    heroTitle = 'Order Ready!'
    heroSubtitle = 'Head to the counter to pick it up.'
    heroBg = 'bg-green-50'
    heroTextColor = 'text-green-800'
    heroSubColor = 'text-green-600'
  } else if (isRefunded) {
    heroEmoji = '💸'
    heroTitle = "Order Couldn't Be Processed"
    heroSubtitle = 'Your payment hold has been released. No charges were made.'
    heroBg = 'bg-amber-50'
    heroTextColor = 'text-amber-800'
    heroSubColor = 'text-amber-600'
  } else if (hasFailed && settings.mode === 'traditional') {
    heroEmoji = '😰'
    heroTitle = 'Something Went Wrong'
    heroSubtitle = 'Please contact support. Your payment may have been charged.'
    heroBg = 'bg-red-50'
    heroTextColor = 'text-red-800'
    heroSubColor = 'text-red-600'
  } else if (hasFailed && settings.mode === 'temporal') {
    heroEmoji = '😔'
    heroTitle = "We Couldn't Complete Your Order"
    heroSubtitle = "Don't worry — no charges were made. Please try again."
    heroBg = 'bg-amber-50'
    heroTextColor = 'text-amber-800'
    heroSubColor = 'text-amber-600'
  } else if (storeReceived && !isComplete) {
    heroEmoji = '👨‍🍳'
    heroTitle = "The store has your order!"
    heroSubtitle = "They're working on it now. We'll let you know when it's ready."
    heroBg = 'bg-blue-50'
    heroTextColor = 'text-blue-800'
    heroSubColor = 'text-blue-600'
  } else if (isActivelyRetrying) {
    heroEmoji = '⏳'
    heroTitle = 'Placing your order...'
    heroSubtitle = 'This may take a moment longer than usual.'
    heroBg = 'bg-orange-50'
    heroTextColor = 'text-orange-800'
    heroSubColor = 'text-orange-600'
  } else if (activeIndex >= 1) {
    heroEmoji = '🔄'
    heroTitle = 'Processing your order...'
    heroSubtitle = "We're getting everything ready."
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
        <h1 className="text-lg font-bold">Order Status</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Hero status card */}
        <div className={`mx-4 mt-4 mb-5 p-5 ${heroBg} rounded-2xl text-center`}>
          <span className="text-5xl block mb-2">{heroEmoji}</span>
          <h2 className={`text-lg font-bold ${heroTextColor}`}>{heroTitle}</h2>
          <p className={`text-sm mt-1 ${heroSubColor}`}>{heroSubtitle}</p>
        </div>

        {/* Progress tracker — icons only, clean */}
        <div className="px-6 mb-2">
          <div className="relative h-9 mx-3">
            {/* Gray track */}
            <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[3px] bg-gray-200 rounded-full" />
            {/* Green progress */}
            {activeIndex >= 0 && (
              <div
                className="absolute top-1/2 left-0 -translate-y-1/2 h-[3px] rounded-full bg-green-500 transition-all duration-700"
                style={{
                  width: `${
                    ((isDone && isComplete
                      ? PHASES.length - 1
                      : Math.min(activeIndex + (isDone ? 1 : 0.5), PHASES.length - 1)
                    ) / (PHASES.length - 1)) * 100
                  }%`,
                }}
              />
            )}
            {/* Circles */}
            {PHASES.map((phase, i) => {
              const status = getPhaseStatusWithFinal(phase, events, finalStatus, i === PHASES.length - 1)
              const isActive = i === activeIndex && !isDone
              const isCompleted = status === 'completed'
              const isPast = i < activeIndex || (isDone && isCompleted)

              return (
                <div
                  key={phase.key}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${(i / (PHASES.length - 1)) * 100}%` }}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all duration-500 ${
                      isPast || isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                          ? status === 'retrying'
                            ? 'bg-yellow-400 text-white animate-pulse ring-3 ring-yellow-200'
                            : status === 'failed'
                              ? 'bg-red-500 text-white ring-3 ring-red-200'
                              : 'bg-orange-500 text-white animate-pulse ring-3 ring-orange-200'
                          : 'bg-gray-100 border-2 border-gray-300 text-gray-400'
                    }`}
                  >
                    {isPast || isCompleted ? '✓' : isActive && status === 'failed' ? '!' : phase.icon}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pickup info */}
        <div className="mx-4 mb-4 px-4 py-3 bg-gray-50 rounded-xl flex items-center gap-3">
          <span className="text-lg">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">Déjà Vu Tacos #42</p>
            <p className="text-xs text-gray-500">123 Temporal Ave, San Francisco</p>
          </div>
          {storeReceived && !isDone && (
            <span className="text-xs text-orange-600 font-medium whitespace-nowrap">~12 min</span>
          )}
        </div>
      </div>

      {/* Bottom button */}
      {isDone && (
        <div className="p-4 bg-white border-t border-gray-100">
          <button
            onClick={onNewOrder}
            className="w-full bg-orange-500 text-white py-3.5 rounded-xl font-bold text-base hover:bg-orange-600 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/20"
          >
            Order Again
          </button>
        </div>
      )}
    </div>
  )
}
