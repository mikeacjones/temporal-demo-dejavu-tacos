export type ArchitectureMode = 'traditional' | 'temporal'
export type FailureScenario = 'none' | 'store_connectivity' | 'payment_error' | 'random_chaos'
export type PresentationMode = 'simple' | 'detailed'
export type WorkerLanguage = 'python' | 'go' | 'java' | 'dotnet' | 'typescript'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying'

export interface Settings {
  mode: ArchitectureMode
  failure_scenario: FailureScenario
  presentation_mode: PresentationMode
  worker_language: WorkerLanguage
}

export interface TemporalUiInfo {
  base_url: string
  namespace: string
  namespace_url: string
}

export interface CreateOrderResponse {
  order_id: string
  status: string
  total: number
  workflow_id?: string
  run_id?: string
  temporal_ui_url?: string
}

export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  image: string
  category: string
}

export interface OrderItem {
  menu_item_id: string
  name: string
  quantity: number
  price: number
}

export interface OrderEvent {
  order_id: string
  step: string
  status: StepStatus
  attempt: number
  max_attempts: number
  error: string | null
  detail: string
  timestamp: string
  mode: ArchitectureMode
}

export interface CartItem extends OrderItem {}

export type PhoneScreen = 'menu' | 'cart' | 'checkout' | 'tracking'
export type DemoTab = 'customer' | 'kitchen'
