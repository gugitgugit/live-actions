import { APP_SLUG } from '../lib/auth'
import { REPO_NOT_FOUND } from '../lib/github'
import { PAGE_PORT, type PageMessage } from '../lib/messages'
import { parsePage, runsForPage, type PageContext } from '../lib/page'
import { isActive } from '../lib/progress'
import { getItem, onItemChanged, type StorageSchema } from '../lib/storage'
import { readLatestCommitSha, removeNativeBadge, syncNativeBadge } from './native'
import { createShadowHost, renderBanner, renderRowBar } from './render'

// Runs on every github.com page. GitHub navigates without full reloads (Turbo and React
// routing) and re-renders parts of the page on its own, so instead of hooking specific
// events this re-checks the URL and our mount points whenever the DOM changes, and makes
// every render idempotent.

const BANNER_ID = 'actions-pulse-banner'
const ROW_CLASS = 'actions-pulse-row'
/** GitHub's repository content container, present on code, pull request and Actions pages */
const ANCHOR = '#repo-content-pjax-container'

type State = Pick<StorageSchema, 'settings' | 'runs' | 'repoInfo' | 'meta' | 'commits'>
let state: State | null = null
let ctx: PageContext | null = null
let href = ''
/** commit in the latest-commit box (code pages); it renders after navigation, so it is re-read on every update */
let sha: string | null = null
let port: chrome.runtime.Port | null = null
let sent: string | undefined
let ticker: ReturnType<typeof setInterval> | null = null
let scheduled = false
let observer: MutationObserver | null = null

/** After the extension is reloaded or updated, this orphaned script must stop touching chrome.* */
function alive(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

function teardown() {
  observer?.disconnect()
  if (ticker) clearInterval(ticker)
  document.getElementById(BANNER_ID)?.remove()
  document.querySelectorAll(`.${ROW_CLASS}`).forEach((n) => n.remove())
  removeNativeBadge()
}

// ---------- background connection ----------

/** Tell the background which repository this tab shows, only while the tab is visible. */
function syncPort() {
  if (!alive()) return teardown()
  const repo = state?.settings.inPage && document.visibilityState === 'visible' && ctx ? ctx.repo : null
  if (repo && !port) {
    try {
      port = chrome.runtime.connect({ name: PAGE_PORT })
    } catch {
      return teardown()
    }
    sent = undefined
    port.onDisconnect.addListener(() => {
      port = null
      // the service worker restarted; reconnect if still wanted
      setTimeout(syncPort, 1000)
    })
  }
  if (!repo && port) {
    port.disconnect()
    port = null
    return
  }
  const msg: PageMessage = { type: 'view', repo, sha: repo ? sha : null }
  if (port && JSON.stringify(msg) !== sent) {
    port.postMessage(msg)
    sent = JSON.stringify(msg)
  }
}

// ---------- rendering ----------

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    update()
  })
}

function update() {
  if (!alive()) return teardown()
  if (location.href !== href) {
    href = location.href
    ctx = parsePage(href)
    syncPort()
  }
  const nextSha = ctx?.kind === 'code' ? readLatestCommitSha() : null
  if (nextSha !== sha) {
    sha = nextSha
    syncPort()
  }
  render()
}

function render() {
  const now = Date.now()
  let animating = false

  if (state?.settings.inPage && ctx?.kind === 'code' && sha) {
    const key = `${ctx.repo}@${sha}`
    syncNativeBadge(key, sha, state.commits[key]?.actions)
  } else {
    removeNativeBadge()
  }

  if (!state || !state.settings.inPage || !ctx) {
    document.getElementById(BANNER_ID)?.remove()
    removeRowBars(new Set())
  } else if (ctx.kind === 'actions') {
    document.getElementById(BANNER_ID)?.remove()
    animating = renderActionsRows(ctx, now)
  } else {
    removeRowBars(new Set())
    animating = renderBannerFor(ctx, now)
  }

  // move the bars every second only while something is running and the tab is visible
  const wantTicker = animating && document.visibilityState === 'visible'
  if (wantTicker && !ticker) ticker = setInterval(render, 1000)
  if (!wantTicker && ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

function renderBannerFor(ctx: Extract<PageContext, { kind: 'pr' | 'code' }>, now: number): boolean {
  const { runs, repoInfo, meta } = state!
  const page = runsForPage(ctx, Object.values(runs), repoInfo[ctx.repo]?.defaultBranch ?? null)
  const blocked = meta.repoErrors[ctx.repo] === REPO_NOT_FOUND
  const installUrl = blocked && APP_SLUG ? `https://github.com/apps/${APP_SLUG}/installations/new` : null

  if (page.primary.length === 0 && page.othersActive === 0 && !installUrl) {
    document.getElementById(BANNER_ID)?.remove()
    return false
  }

  let host = document.getElementById(BANNER_ID)
  if (!host) host = createShadowHost(BANNER_ID)
  const anchor = document.querySelector(ANCHOR)
  if (anchor) {
    // a sibling before GitHub's React root, which React never reconciles
    host.classList.remove('floating')
    if (anchor.firstElementChild !== host) anchor.prepend(host)
  } else {
    host.classList.add('floating')
    if (host.parentElement !== document.body) document.body.append(host)
  }

  renderBanner(
    host.shadowRoot!,
    { runs: page.primary, othersActive: page.othersActive, actionsUrl: `https://github.com/${ctx.repo}/actions`, installUrl },
    now,
  )
  return page.primary.some((r) => isActive(r.status))
}

/** A compact bar under each running row of the Actions run list. */
function renderActionsRows(ctx: Extract<PageContext, { kind: 'actions' }>, now: number): boolean {
  const active = runsForPage(ctx, Object.values(state!.runs), null).primary.filter((r) => isActive(r.status))
  const byPath = new Map(active.map((r) => [`/${ctx.repo}/actions/runs/${r.id}`, r]))
  const keep = new Set<Element>()

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/actions/runs/"]')) {
    const run = byPath.get(new URL(link.href).pathname)
    if (!run) continue
    const cell = link.parentElement
    if (!cell) continue
    let host = cell.querySelector<HTMLElement>(`:scope > .${ROW_CLASS}`)
    if (!host) {
      host = createShadowHost(`actions-pulse-run-${run.id}`, ROW_CLASS)
      cell.append(host)
    }
    keep.add(host)
    renderRowBar(host.shadowRoot!, run, now)
  }
  removeRowBars(keep)
  return keep.size > 0
}

function removeRowBars(keep: Set<Element>) {
  document.querySelectorAll(`.${ROW_CLASS}`).forEach((n) => {
    if (!keep.has(n)) n.remove()
  })
}

// ---------- start ----------

async function start() {
  const [settings, runs, repoInfo, meta, commits] = await Promise.all([
    getItem('settings'),
    getItem('runs'),
    getItem('repoInfo'),
    getItem('meta'),
    getItem('commits'),
  ])
  state = { settings, runs, repoInfo, meta, commits }

  for (const key of ['settings', 'runs', 'repoInfo', 'meta', 'commits'] as const) {
    onItemChanged(key, (value) => {
      if (!state) return
      state = { ...state, [key]: value }
      if (key === 'settings') syncPort()
      schedule()
    })
  }

  document.addEventListener('visibilitychange', () => {
    syncPort()
    schedule()
  })
  observer = new MutationObserver(schedule)
  // the whole document, not <body>: a full Turbo visit replaces <body>, which would silence an observer on it
  observer.observe(document.documentElement, { childList: true, subtree: true })
  update()
}

start()
