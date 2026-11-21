import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './phone/phone.css'
import './console.css'
import { api, isApi } from './api'
import App from './App'

// One session per page load, as in the main app: the backend keys each browser's
// store connection and kitchen orders by it, so visitors don't share a kitchen.
const SESSION_ID = crypto.randomUUID()

const nativeFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
  if (isApi(url)) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('X-Session-Id', SESSION_ID)
    init = { ...init, headers }
  }
  return nativeFetch(input, init)
}

window.addEventListener('pagehide', () => {
  navigator.sendBeacon(api(`/session/end?session_id=${encodeURIComponent(SESSION_ID)}`))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
