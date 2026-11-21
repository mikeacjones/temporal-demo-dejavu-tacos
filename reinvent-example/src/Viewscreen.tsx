import { useCallback, useEffect, useRef, useState } from 'react'

// The Temporal UI in a frame, kept loaded so each new order's Workflow opens in
// about a second instead of a cold load of the whole UI (6 to 16 seconds on
// test). It works only from the same origin: the UI sends X-Frame-Options:
// SAMEORIGIN, and on the demo host the platform serves the namespace's public,
// read-only UI at /_temporal/primary/. Anywhere else the viewscreen links out.

interface Props {
  /** The UI's base and namespace, from the backend; null until known. */
  uiBase: string | null
  namespace: string | null
  /** The newest order's Workflow timeline; null before the first order. */
  timelineUrl: string | null
  workflowId: string | null
  /** False in the traditional architecture, which runs no Workflow. */
  temporalMode: boolean
}

const ZOOM_LEVELS = [1, 1.2, 1.4, 1.6]
const ZOOM_KEY = 'viewscreen-zoom'
const READY_TIMEOUT_MS = 30_000

// The UI's own setting (its localStorage key "navOpen", shared because the
// frame is same-origin) starts its sidebar collapsed; this stylesheet then hides
// the side, top and narrow-layout bottom bars outright, in case they render
// anyway. Selectors from temporalio/ui 2.58.1, the version the platform pins.
const HIDE_NAV = `nav[data-testid="navigation-header"], nav[data-testid="top-nav"] { display: none !important; }`

function sameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function follow(doc: Document | null, url: string) {
  if (!doc?.body) return
  const a = doc.createElement('a')
  a.href = url
  doc.body.appendChild(a)
  a.click()
  a.remove()
}

function waitFor(test: () => boolean, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const id = window.setInterval(() => {
      if (test() || Date.now() - started > ms) {
        window.clearInterval(id)
        resolve(test())
      }
    }, 100)
  })
}

function readZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY)
    const i = raw === null ? NaN : Number(raw)
    return Number.isInteger(i) && i >= 0 && i < ZOOM_LEVELS.length ? i : 1
  } catch {
    return 1
  }
}

export function Viewscreen({ uiBase, namespace, timelineUrl, workflowId, temporalMode }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const loaded = useRef(false)
  const pending = useRef<string | null>(null)
  const readyTimer = useRef<number | undefined>(undefined)
  const [zoom, setZoom] = useState(readZoom)

  const embeddable = uiBase !== null && namespace !== null && sameOrigin(uiBase)
  const [warmUrl, setWarmUrl] = useState<string | null>(null)

  // The first page the frame loads, behind the empty state: the namespace's
  // newest run. The UI switches from one run page to another in place, but
  // reloads in full when leaving its workflow list (temporalio/ui 2.58.1, seen
  // on test), so the list is only the fallback for a namespace with no runs.
  useEffect(() => {
    if (!embeddable) return
    const ns = `${uiBase.replace(/\/$/, '')}/namespaces/${encodeURIComponent(namespace)}`
    const list = `${ns}/workflows`
    const api = `${uiBase.replace(/\/$/, '')}/api/v1/namespaces/${encodeURIComponent(namespace)}/workflows?pageSize=1`
    let cancelled = false
    fetch(api)
      .then((r) => (r.ok ? (r.json() as Promise<{ executions?: { execution: { workflowId: string; runId: string } }[] }>) : null))
      .then((d) => {
        const e = d?.executions?.[0]?.execution
        if (!cancelled) setWarmUrl(e ? `${list}/${encodeURIComponent(e.workflowId)}/${encodeURIComponent(e.runId)}/timeline` : list)
      })
      .catch(() => {
        if (!cancelled) setWarmUrl(list)
      })
    return () => {
      cancelled = true
    }
  }, [embeddable, uiBase, namespace])

  // Set before the UI's own scripts read it: they load long after this runs.
  useEffect(() => {
    if (!warmUrl) return
    try {
      localStorage.setItem('navOpen', 'false')
    } catch {
      // Storage blocked: the stylesheet still hides the bars.
    }
  }, [warmUrl])

  const nsBase = embeddable ? `${uiBase.replace(/\/$/, '')}/namespaces/${encodeURIComponent(namespace)}` : null
  const [switching, setSwitching] = useState(false)
  const switchSeq = useRef(0)

  // Switch the loaded UI to another run without reloading it: follow a link
  // inside it, so its router changes page and fetches only the new run. It goes
  // by way of the namespace's schedules page: the UI's run page starts its 10s
  // refresh of pending activities (where retry attempts come from) only when it
  // mounts, and stops it on a run change (temporalio/ui 2.58.1,
  // workflow-run-layout.svelte), so a direct run-to-run switch would never show
  // a retry. Seen on test: direct, one describe call in 25s; via schedules, one
  // every 10s; neither reloads the page.
  const openInside = useCallback((url: string) => {
    const frame = frameRef.current
    if (!frame?.contentDocument?.body || !nsBase) return false
    const seq = ++switchSeq.current
    const path = () => frame.contentWindow?.location.pathname ?? ''
    const target = new URL(url, window.location.href).pathname
    setSwitching(true)
    void (async () => {
      if (/\/workflows\/[^/]+\/[^/]+/.test(path())) {
        follow(frame.contentDocument, `${nsBase}/schedules`)
        await waitFor(() => path().endsWith('/schedules'), 5000)
      }
      if (seq !== switchSeq.current) return
      follow(frame.contentDocument, url)
      await waitFor(() => path() === target, 10000)
      if (seq === switchSeq.current) setSwitching(false)
    })()
    return true
  }, [nsBase])

  // A full load of the UI, when the frame has to fall back to one.
  const loadFully = useCallback((url: string) => {
    loaded.current = false
    if (frameRef.current) frameRef.current.src = url
  }, [])

  const flush = useCallback(() => {
    const url = pending.current
    if (!url) return
    pending.current = null
    if (!openInside(url)) loadFully(url)
  }, [openInside, loadFully])

  // The frame's load event comes before the UI has rendered and started its
  // router; a link followed then is a full page load (seen on test). So the UI
  // counts as ready once it has rendered links, and an order that arrives
  // earlier waits for that. Past READY_TIMEOUT_MS it loads the frame in full.
  const onLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    if (!doc.getElementById('viewscreen-hide-nav')) {
      const style = doc.createElement('style')
      style.id = 'viewscreen-hide-nav'
      style.textContent = HIDE_NAV
      doc.head.appendChild(style)
    }
    window.clearInterval(readyTimer.current)
    const started = Date.now()
    readyTimer.current = window.setInterval(() => {
      const rendered = frameRef.current?.contentDocument?.querySelector('a[href]')
      if (rendered || Date.now() - started > READY_TIMEOUT_MS) {
        window.clearInterval(readyTimer.current)
        loaded.current = Boolean(rendered)
        if (rendered) flush()
        else if (pending.current) loadFully(pending.current)
      }
    }, 200)
  }, [flush, loadFully])

  useEffect(() => () => window.clearInterval(readyTimer.current), [])

  useEffect(() => {
    if (!timelineUrl || !embeddable || !sameOrigin(timelineUrl)) return
    pending.current = timelineUrl
    if (loaded.current) flush()
  }, [timelineUrl, embeddable, flush])

  const changeZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, z + delta))
      try {
        localStorage.setItem(ZOOM_KEY, String(next))
      } catch {
        // Not remembered in this browser; the level still applies.
      }
      return next
    })
  }

  const scale = ZOOM_LEVELS[zoom]
  const crossOrigin = timelineUrl !== null && !embeddable

  return (
    <section className="viewer" aria-label="Workflow timeline">
      <div className="viewer-head">
        <span>
          Workflow <span className="viewer-id">{workflowId ?? 'none yet'}</span>
        </span>
        <span className="zoom" role="group" aria-label="Timeline zoom">
          <button type="button" onClick={() => changeZoom(-1)} disabled={zoom === 0} aria-label="Zoom out">
            −
          </button>
          <output aria-live="polite">{Math.round(scale * 100)}%</output>
          <button type="button" onClick={() => changeZoom(1)} disabled={zoom === ZOOM_LEVELS.length - 1} aria-label="Zoom in">
            +
          </button>
        </span>
      </div>
      <div className="viewscreen">
        {warmUrl && (
          <iframe
            ref={frameRef}
            src={warmUrl}
            onLoad={onLoad}
            title={`Temporal UI: ${workflowId ?? namespace}`}
            style={{ transform: `scale(${scale})`, width: `${100 / scale}%`, height: `${100 / scale}%` }}
          />
        )}
        {!temporalMode ? (
          <p className="screen-empty">The backend is set to the traditional architecture, so orders run without a Workflow.</p>
        ) : crossOrigin ? (
          <p className="screen-empty">
            This Temporal UI is on another origin and refuses to be framed.{' '}
            <a href={timelineUrl} target="_blank" rel="noreferrer">
              Open the timeline in a new tab
            </a>
          </p>
        ) : timelineUrl === null ? (
          <p className="screen-empty">Start an order to see the Workflow</p>
        ) : switching ? (
          <p className="screen-empty" role="status">
            Locking on to {workflowId}
          </p>
        ) : null}
      </div>
    </section>
  )
}
