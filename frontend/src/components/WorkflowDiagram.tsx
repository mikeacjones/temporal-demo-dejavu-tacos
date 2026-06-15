import type { OrderEvent, Settings, StepStatus } from '../types'

interface WorkflowDiagramProps {
  events: OrderEvent[]
  settings: Settings
  finalStatus: string | null
  temporalWorkflowUrl?: string | null
}

interface StepDef {
  key: string
  label: string
  service: string
  icon: string
}

const WORKFLOW_STEPS: StepDef[] = [
  { key: 'validate_order', label: 'Validate Order', service: 'Cart Service', icon: '📋' },
  { key: 'validate_store', label: 'Validate Store', service: 'Store Service', icon: '🏪' },
  { key: 'authorize_payment', label: 'Authorize Payment', service: 'Payment Service', icon: '💳' },
  { key: 'clear_cart', label: 'Clear Cart', service: 'Cart Service', icon: '🛒' },
  { key: 'submit_to_store', label: 'Submit to Store', service: 'Store Service', icon: '📡' },
  { key: 'order_ready', label: 'Await Order Ready', service: 'Signal (Human)', icon: '👨‍🍳' },
  { key: 'capture_payment', label: 'Capture Payment', service: 'Payment Service', icon: '✅' },
]

const COMPENSATION_STEPS: StepDef[] = [
  { key: 'release_payment_hold', label: 'Release Payment Hold', service: 'Payment Service', icon: '↩️' },
  { key: 'notify_customer', label: 'Notify Customer', service: 'Notification', icon: '📱' },
]

function getStepState(stepKey: string, events: OrderEvent[]) {
  const stepEvents = events.filter((e) => e.step === stepKey)
  if (stepEvents.length === 0) return { status: 'pending' as StepStatus, events: [] }
  const last = stepEvents[stepEvents.length - 1]
  return { status: last.status, events: stepEvents, last }
}

const STATUS_COLORS: Record<StepStatus | string, string> = {
  pending: 'border-gray-600 bg-gray-700/50',
  running: 'border-blue-500 bg-blue-500/10',
  completed: 'border-green-500 bg-green-500/10',
  failed: 'border-red-500 bg-red-500/10',
  retrying: 'border-yellow-500 bg-yellow-500/10',
}

const STATUS_DOT: Record<StepStatus | string, string> = {
  pending: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  retrying: 'bg-yellow-500 animate-pulse',
}

const STATUS_LINE: Record<StepStatus | string, string> = {
  pending: 'bg-gray-600',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  retrying: 'bg-yellow-500',
}

export function WorkflowDiagram({
  events,
  settings,
  finalStatus,
  temporalWorkflowUrl,
}: WorkflowDiagramProps) {
  const isDetailed = settings.presentation_mode === 'detailed'
  const isTemporal = settings.mode === 'temporal'
  const showCompensation = events.some((e) =>
    COMPENSATION_STEPS.some((cs) => cs.key === e.step)
  )

  return (
    <div className="space-y-1">
      {/* Mode badge */}
      <div className="mb-3">
        {isTemporal ? (
          <a
            href={temporalWorkflowUrl || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!temporalWorkflowUrl}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors ${
              temporalWorkflowUrl
                ? 'hover:bg-purple-500/30 hover:text-purple-100 cursor-pointer'
                : 'cursor-default'
            }`}
            onClick={(event) => {
              if (!temporalWorkflowUrl) event.preventDefault()
            }}
            title={
              temporalWorkflowUrl
                ? 'Open this workflow in Temporal UI'
                : 'Start a Temporal order to open the workflow'
            }
          >
            ⚡ Temporal Workflow
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30">
            🔗 Direct Service Calls
          </span>
        )}
      </div>

      {/* Main steps */}
      {WORKFLOW_STEPS.map((step, i) => {
        const state = getStepState(step.key, events)
        const isLast = i === WORKFLOW_STEPS.length - 1

        return (
          <div key={step.key}>
            <div
              className={`rounded-lg border-2 p-3 transition-all duration-300 ${STATUS_COLORS[state.status]}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[state.status]}`}
                />
                <span className="text-lg">{step.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-400">{step.service}</p>
                </div>
                {isTemporal && step.key === 'order_ready' && state.status === 'pending' && (
                  <span className="text-xs text-gray-500 italic">signal</span>
                )}
              </div>

              {/* Detailed info */}
              {isDetailed && state.last && (
                <div className="mt-2 ml-8 text-xs space-y-0.5">
                  {state.last.detail && (
                    <p className="text-gray-300">{state.last.detail}</p>
                  )}
                  {state.last.error && (
                    <p className="text-red-400 font-mono">{state.last.error}</p>
                  )}
                  {state.last.attempt > 1 && (
                    <p className="text-yellow-400">
                      Attempt {state.last.attempt}/{state.last.max_attempts}
                    </p>
                  )}
                </div>
              )}

              {/* Retry badge (always show for retrying, even in simple mode) */}
              {state.status === 'retrying' && state.last && !isDetailed && (
                <div className="mt-1.5 ml-8">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-300">
                    ↻ Retry {state.last.attempt}/{state.last.max_attempts}
                  </span>
                </div>
              )}

              {/* Traditional mode: failure callout */}
              {!isTemporal &&
                state.status === 'failed' &&
                step.key === 'submit_to_store' && (
                  <div className="mt-2 ml-8 p-2 bg-red-900/30 rounded text-xs text-red-300 border border-red-500/30">
                    <p className="font-bold">No automatic recovery!</p>
                    <p className="mt-1">
                      Payment hold was placed but the store never received the
                      order. The customer has been charged with no food on the
                      way. A support ticket is required to resolve this manually.
                    </p>
                  </div>
                )}
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="flex justify-center py-0.5">
                <div
                  className={`w-0.5 h-4 ${STATUS_LINE[state.status === 'pending' ? 'pending' : 'completed']}`}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Compensation branch */}
      {showCompensation && (
        <>
          <div className="flex justify-center py-1">
            <div className="w-0.5 h-4 bg-red-500" />
          </div>
          <div className="ml-4 border-l-2 border-dashed border-red-500/50 pl-3 space-y-1">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
              Compensation (Saga)
            </p>
            {COMPENSATION_STEPS.map((step) => {
              const state = getStepState(step.key, events)
              if (state.status === 'pending') return null
              return (
                <div
                  key={step.key}
                  className={`rounded-lg border-2 p-3 transition-all duration-300 ${STATUS_COLORS[state.status]}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[state.status]}`}
                    />
                    <span className="text-lg">{step.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-200">
                        {step.label}
                      </p>
                      <p className="text-xs text-gray-400">{step.service}</p>
                    </div>
                  </div>
                  {isDetailed && state.last?.detail && (
                    <p className="mt-1 ml-8 text-xs text-gray-300">
                      {state.last.detail}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Final status banner */}
      {finalStatus === 'completed' && (
        <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <p className="text-green-300 font-bold text-sm">
            ✓ Order completed successfully
          </p>
        </div>
      )}
      {finalStatus === 'failed' && !isTemporal && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
          <p className="text-red-300 font-bold text-sm">
            ✕ Order failed — manual intervention required
          </p>
        </div>
      )}
      {finalStatus === 'refunded' && (
        <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
          <p className="text-yellow-300 font-bold text-sm">
            ↩ Payment released — customer notified
          </p>
        </div>
      )}
    </div>
  )
}
