import { APP_SLUG } from '../lib/auth'
import { isNotFound } from '../lib/errors'
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
/** code pages: the branch picker in the toolbar and the latest-commit box at the top of the file list */
const BRANCH_PICKER = '#ref-picker-repos-header-ref-selector'
const LATEST_COMMIT = '[data-testid="latest-commit"]'
/** pull request conversation: the merge box with the checks summary */
const MERGE_BOX = '[data-testid="mergebox-partial"]'
/** the bordered box inside it; the banner matches its width, like the comment boxes above and below */
const MERGE_BOX_BORDER = '[data-testid="mergebox-border-container"]'
/** commit links in a pull request's timeline */
const COMMIT_PATH = /\/(?:pull\/\d+\/commits|commit)\/([0-9a-f]{40})/

/** a spot inside GitHub's React tree: `before` is GitHub's element the banner goes in front of */
interface Slot {
  parent: Element
  before: Element
  kind: 'toolbar' | 'mergebox'
  /** element whose left and right edges the banner lines up with */
  align?: Element
}

type State = Pick<StorageSchema, 'settings' | 'runs' | 'repoInfo' | 'meta' | 'commits'>
let state: State | null = null
let ctx: PageContext | null = null
let href = ''
/** commit in the latest-commit box (code pages); it renders after navigation, so it is re-read on every update */
let sha: string | null = null
/** what GitHub currently shows on a pull request page, see prFingerprint */
let fingerprint: string | null = null
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
  alignObserver?.disconnect()
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
      // read the reason (service worker restart, back/forward cache) so Chrome does not log it as unchecked
      void chrome.runtime.lastError
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

/**
 * A cheap summary of the parts of a pull request page that GitHub updates live when CI moves:
 * the newest commit in the timeline (a push) and the merge box headings (checks appearing or
 * changing state). Only read, never written; our own banner lives in a shadow root and is
 * not part of it.
 */
function prFingerprint(): string {
  let lastCommit = ''
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href*="/commit"]')) {
    const m = COMMIT_PATH.exec(a.pathname)
    if (m) lastCommit = m[1]
  }
  const box = document.querySelector(MERGE_BOX_BORDER)
  const headings = box ? [...box.querySelectorAll('h3, h4')].map((h) => h.textContent?.trim()).join('|') : ''
  return `${lastCommit}#${headings}`
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
    fingerprint = null
    syncPort()
  }
  if (ctx?.kind === 'pr') {
    const next = prFingerprint()
    // GitHub updated the page by itself: a run probably just started or changed state
    if (fingerprint !== null && next !== fingerprint) port?.postMessage({ type: 'poke' } satisfies PageMessage)
    fingerprint = next
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
  const blocked = isNotFound(meta.repoErrors[ctx.repo])
  const installUrl = blocked && APP_SLUG ? `https://github.com/apps/${APP_SLUG}/installations/new` : null

  if (page.primary.length === 0 && page.othersActive === 0 && !installUrl) {
    document.getElementById(BANNER_ID)?.remove()
    return false
  }

  let host = document.getElementById(BANNER_ID)
  if (!host) host = createShadowHost(BANNER_ID)
  // Code pages: the banner only exists on the repository home and a branch's home (see
  // runsForPage), which share the toolbar layout; the vertical check in toolbarSlot guards
  // against the side-panel layout of folder pages. Pull requests: only the Conversation tab
  // has a merge box; other tabs keep the top spot.
  const slot = ctx.kind === 'pr' ? mergeBoxSlot() : toolbarSlot()
  const anchor = document.querySelector(ANCHOR)
  // prefixed: GitHub's own utility classes include `.inline { display: inline }`
  host.classList.toggle('ap-inline', !!slot)
  host.classList.toggle('ap-mergebox', slot?.kind === 'mergebox')
  host.classList.toggle('ap-floating', !slot && !anchor)
  watchAlign(slot?.align ?? null)
  // Match the measured edges rather than copying GitHub's margin classes: the merge box is
  // indented in layers (margin, padding, an absolutely placed icon) that vary by width.
  if (slot?.align) {
    const outer = slot.parent.getBoundingClientRect()
    const inner = slot.align.getBoundingClientRect()
    host.style.marginLeft = `${Math.round(inner.left - outer.left)}px`
    host.style.marginRight = `${Math.round(outer.right - inner.right)}px`
  } else {
    host.style.marginLeft = ''
    host.style.marginRight = ''
  }
  if (slot) {
    if (host.parentElement !== slot.parent || host.nextElementSibling !== slot.before) slot.parent.insertBefore(host, slot.before)
  } else if (anchor) {
    // a sibling before GitHub's React root, which React never reconciles
    if (anchor.firstElementChild !== host) anchor.prepend(host)
  } else if (host.parentElement !== document.body) {
    document.body.append(host)
  }

  renderBanner(
    host.shadowRoot!,
    { runs: page.primary, othersActive: page.othersActive, actionsUrl: `https://github.com/${ctx.repo}/actions`, installUrl },
    now,
  )
  return page.primary.some((r) => isActive(r.status))
}

/**
 * Repository or branch home: between the toolbar (branch picker, Go to file, Code) and the
 * file list, right above the latest-commit box (below the "commits ahead" note on branches).
 * This is inside GitHub's React tree, so we only ever add a sibling and never touch
 * React's own nodes. Found without GitHub's generated class names: the child of the
 * nearest common ancestor of the branch picker and the latest-commit box that holds the
 * latter is the file list, and the banner goes right before it.
 */
function toolbarSlot(): Slot | null {
  const picker = document.querySelector(BRANCH_PICKER)
  const latest = document.querySelector(LATEST_COMMIT)
  if (!picker || !latest) return null
  let common = latest.parentElement
  while (common && !common.contains(picker)) common = common.parentElement
  if (!common) return null
  if (!reactSettled(common)) return null
  const before = [...common.children].find((c) => c.contains(latest))
  const toolbar = [...common.children].find((c) => c.contains(picker))
  if (!before || !toolbar) return null
  // only a vertical stack (toolbar above the list); in a side-by-side layout the banner would become a column
  if (toolbar.getBoundingClientRect().bottom > before.getBoundingClientRect().top + 1) return null
  return { parent: common, before, kind: 'toolbar' }
}

/**
 * Pull request Conversation tab: right above the merge box, where the checks are listed.
 * Same rules as the toolbar slot: a sibling only, never touching GitHub's nodes.
 */
function mergeBoxSlot(): Slot | null {
  const box = document.querySelector(MERGE_BOX)
  if (!box?.parentElement || !reactSettled(box)) return null
  return { parent: box.parentElement, before: box, kind: 'mergebox', align: box.querySelector(MERGE_BOX_BORDER) ?? box }
}

/**
 * Re-measure when the element we line up with changes size: GitHub's stylesheets can finish
 * loading after the first measurement (its padding arrives late) without any DOM mutation.
 */
let alignObserver: ResizeObserver | null = null
let alignTarget: Element | null = null
function watchAlign(el: Element | null) {
  if (el === alignTarget) return
  alignObserver ??= new ResizeObserver(schedule)
  if (alignTarget) alignObserver.unobserve(alignTarget)
  if (el) alignObserver.observe(el)
  alignTarget = el
}

/**
 * Inserting while React is still hydrating server-rendered markup would make it bail out.
 * GitHub marks some apps with a `loaded` class but not all (it was missing on a directly
 * opened pull request), so a fully loaded document also counts.
 */
function reactSettled(el: Element): boolean {
  const app = el.closest('react-app')
  return !app || app.classList.contains('loaded') || document.readyState === 'complete'
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

  // alignment is measured, so re-measure when the layout width changes
  window.addEventListener('resize', schedule)
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
