import { timeAgo } from '../lib/format'
import { t, tAround, type MessageKey } from '../lib/i18n'
import { computeProgress, formatDuration, isActive } from '../lib/progress'
import { toneOf } from '../lib/status'
import type { TrackedRun } from '../lib/types'
import { iconSvg } from '../shared/icons'
import { STYLES } from './styles'

// Everything that comes from the API (titles, branch and workflow names) is set with
// textContent. Only constant markup (icons) goes through innerHTML: this code runs inside
// github.com, and run titles are written by whoever pushed the commit.

const RESULT_LABEL: Record<string, MessageKey> = {
  success: 'resultSuccess',
  failure: 'resultFailure',
  timed_out: 'resultTimedOut',
  startup_failure: 'resultStartupFailure',
  cancelled: 'resultCancelled',
  skipped: 'resultSkipped',
  action_required: 'resultActionRequired',
  neutral: 'resultNeutral',
}

export function createShadowHost(id: string, className = ''): HTMLElement {
  const host = document.createElement('div')
  host.id = id
  if (className) host.className = className
  // inline style so page rules cannot change how the host lays out (`:host` loses to them)
  host.style.display = 'block'
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLES
  root.append(style)
  return host
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function setText(node: Element, text: string) {
  if (node.textContent !== text) node.textContent = text
}

function setIcon(node: HTMLElement, run: TrackedRun) {
  const tone = toneOf(run.status, run.conclusion)
  if (node.dataset.tone !== tone) {
    node.dataset.tone = tone
    node.innerHTML = iconSvg(tone)
  }
}

export function liveProgress(run: TrackedRun, now: number) {
  return computeProgress(
    { status: run.status, run_started_at: run.startedAt, created_at: run.startedAt, updated_at: run.updatedAt },
    run.jobs,
    run.progress.estimateMs,
    now,
  )
}

function stepText(run: TrackedRun, now: number): { step: string; time: string; pct: number | null; failing: boolean } {
  const p = liveProgress(run, now)
  const running = run.jobs.find((j) => j.status === 'in_progress')
  const queued = toneOf(run.status, run.conclusion) === 'queued'
  // nothing has started yet, so a percentage or time left would be made up
  if (queued) return { pct: null, failing: false, step: t('waitingForRunner'), time: t('queuedFor', formatDuration(p.elapsedMs)) }
  return {
    pct: Math.round(p.ratio * 100),
    failing: run.jobs.some((j) => j.conclusion === 'failure'),
    step: `${t('jobsProgress', p.jobsDone, p.jobsTotal)}${running?.currentStep ? ` · ${running.currentStep}` : ''}`,
    time:
      p.remainingMs !== null && !p.overtime
        ? t('timeLeft', formatDuration(p.remainingMs))
        : p.overtime
          ? t('slowerThanUsual', formatDuration(p.elapsedMs))
          : formatDuration(p.elapsedMs),
  }
}

/** `pct` null = queued: striped track, no value */
function updateBar(bar: HTMLElement, pct: number | null, failing: boolean) {
  bar.classList.toggle('failing', failing)
  bar.classList.toggle('queued', pct === null)
  if (pct === null) bar.removeAttribute('aria-valuenow')
  else bar.setAttribute('aria-valuenow', String(pct))
  const fill = bar.firstElementChild as HTMLElement
  fill.style.width = `${pct === null ? 0 : Math.max(pct, 3)}%`
}

function createBar(label: string): HTMLElement {
  const bar = el('div', 'bar')
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', '100')
  bar.setAttribute('aria-label', label)
  bar.append(el('div', 'fill'))
  return bar
}

// ---------- banner (pull request and code pages) ----------

export interface BannerModel {
  runs: TrackedRun[]
  othersActive: number
  actionsUrl: string
  /** shown when there is nothing else to show and the repository is not accessible */
  installUrl: string | null
}

/** Updates the banner in place so progress bars animate instead of being rebuilt. */
export function renderBanner(root: ShadowRoot, model: BannerModel, now: number) {
  let banner = root.querySelector<HTMLElement>('.banner')
  if (!banner) {
    banner = el('section', 'banner')
    banner.setAttribute('aria-label', t('bannerLabel'))
    const head = el('div', 'head')
    head.append(el('span', 'brand', t('bannerTitle')), el('span', 'spacer'))
    const all = el('a', 'all', t('viewAllRuns'))
    head.append(all)
    banner.append(head, el('ul', 'list'), el('a', 'others'), el('p', 'hint'))
    root.append(banner)
  }
  ;(banner.querySelector('.all') as HTMLAnchorElement).href = model.actionsUrl

  const list = banner.querySelector('.list') as HTMLUListElement
  const keep = new Set<string>()
  for (const run of model.runs) {
    const key = `${run.id}`
    keep.add(key)
    let row = list.querySelector<HTMLLIElement>(`li[data-key="${key}"]`)
    if (!row) row = createBannerRow(key)
    updateBannerRow(row, run, now)
    list.append(row) // keeps order
  }
  for (const row of [...list.children] as HTMLElement[]) {
    if (!keep.has(row.dataset.key ?? '')) row.remove()
  }

  const others = banner.querySelector('.others') as HTMLAnchorElement
  others.hidden = model.othersActive === 0
  others.href = model.actionsUrl
  setText(others, t('othersRunning', model.othersActive))

  const hint = banner.querySelector('.hint') as HTMLParagraphElement
  hint.hidden = !model.installUrl
  if (model.installUrl && !hint.firstChild) {
    const link = el('a', '', t('installHintLink'))
    link.href = model.installUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    const [before, after] = tAround('installHint')
    hint.append(document.createTextNode(before), link, document.createTextNode(after))
  }
}

function createBannerRow(key: string): HTMLLIElement {
  const row = el('li', 'row')
  row.dataset.key = key
  const link = el('a', 'run')
  link.target = '_blank'
  link.rel = 'noreferrer'
  const top = el('div', 'top')
  top.append(el('span', 'icon'), el('span', 'workflow'), el('span', 'title'), el('span', 'meta'))
  link.append(top, createBar(t('workflowProgressLabel')))
  row.append(link)
  return row
}

function updateBannerRow(row: HTMLLIElement, run: TrackedRun, now: number) {
  const link = row.querySelector('a') as HTMLAnchorElement
  link.href = run.htmlUrl
  setIcon(row.querySelector('.icon') as HTMLElement, run)
  setText(row.querySelector('.workflow')!, run.workflowName)
  setText(row.querySelector('.title')!, run.title)
  row.querySelector('.title')!.setAttribute('title', run.title)
  const bar = row.querySelector('.bar') as HTMLElement
  const meta = row.querySelector('.meta')!

  if (isActive(run.status)) {
    const info = stepText(run, now)
    bar.hidden = false
    updateBar(bar, info.pct, info.failing)
    setText(meta, `${info.step} · ${info.time}`)
    row.classList.remove('done')
  } else {
    bar.hidden = true
    const result = t(RESULT_LABEL[run.conclusion ?? ''] ?? 'resultFinished')
    const when = run.completedAt ? ` · ${timeAgo(run.completedAt, now)}` : ''
    setText(meta, `${t('resultIn', result, formatDuration(run.progress.elapsedMs))}${when}`)
    row.classList.add('done')
  }
}

// ---------- compact bar inside an Actions list row ----------

export function renderRowBar(root: ShadowRoot, run: TrackedRun, now: number) {
  let wrap = root.querySelector<HTMLElement>('.rowbar')
  if (!wrap) {
    wrap = el('div', 'rowbar')
    wrap.append(createBar(t('runProgressLabel')), el('span', 'meta'))
    root.append(wrap)
  }
  const info = stepText(run, now)
  updateBar(wrap.querySelector('.bar') as HTMLElement, info.pct, info.failing)
  setText(wrap.querySelector('.meta')!, [info.pct === null ? null : `${info.pct}%`, info.step, info.time].filter(Boolean).join(' · '))
}
