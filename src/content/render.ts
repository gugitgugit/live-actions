import { formatDuration, timeAgo } from '../lib/format'
import { t, tAround, type MessageKey } from '../lib/i18n'
import { jobTimeLabel, parallelJobs, progressSummary, runProgress, timeLabel } from '../lib/progress'
import { isActive, toneOf } from '../lib/status'
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

function stepText(run: TrackedRun, now: number): { step: string; time: string; pct: number | null; failing: boolean } {
  const p = runProgress(run, now)
  const queued = toneOf(run.status, run.conclusion) === 'queued'
  // nothing has started yet, so a percentage or time left would be made up
  if (queued) return { pct: null, failing: false, step: t('waitingForRunner'), time: timeLabel(p, true) }
  return {
    pct: Math.round(p.ratio * 100),
    failing: run.jobs.some((j) => j.conclusion === 'failure'),
    step: progressSummary(run.jobs),
    time: timeLabel(p, false),
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
  /** the branch the page shows (code pages): rows from another ref get its name as a label */
  branch?: string | null
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
    updateBannerRow(row, run, now, model.branch)
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
  top.append(el('span', 'icon'), el('span', 'workflow'), el('span', 'ref'), el('span', 'title'), el('span', 'meta'))
  link.append(top, createBar(t('workflowProgressLabel')))
  row.append(link, el('ul', 'jobs'))
  return row
}

/** At most this many jobs running side by side get their own bar; the rest are counted. */
const MAX_JOB_BARS = 3

function updateBannerRow(row: HTMLLIElement, run: TrackedRun, now: number, pageBranch: string | null | undefined) {
  const link = row.querySelector('a') as HTMLAnchorElement
  link.href = run.htmlUrl
  setIcon(row.querySelector('.icon') as HTMLElement, run)
  setText(row.querySelector('.workflow')!, run.workflowName)
  // a run on the same commit from another ref, such as a pushed tag: say which
  const ref = row.querySelector('.ref') as HTMLElement
  const otherRef = pageBranch !== undefined && run.branch && run.branch !== pageBranch ? run.branch : null
  ref.hidden = otherRef === null
  setText(ref, otherRef ?? '')
  if (otherRef) ref.setAttribute('title', otherRef)
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
    updateJobBars(row.querySelector('.jobs') as HTMLUListElement, run, now)
  } else {
    bar.hidden = true
    updateJobBars(row.querySelector('.jobs') as HTMLUListElement, null, now)
    const result = t(RESULT_LABEL[run.conclusion ?? ''] ?? 'resultFinished')
    // when GitHub finished it, not when a poll noticed (a few seconds later)
    const when = ` · ${timeAgo(Date.parse(run.updatedAt), now)}`
    setText(meta, `${t('resultIn', result, formatDuration(run.progress.elapsedMs))}${when}`)
    row.classList.add('done')
  }
}

/** One bar per job running side by side; empty (hidden) when one job or none is running. */
function updateJobBars(list: HTMLUListElement, run: TrackedRun | null, now: number) {
  const jobs = run ? parallelJobs(run, now) : []
  const shown = jobs.slice(0, MAX_JOB_BARS)
  const keep = new Set<string>()
  for (const job of shown) {
    const key = `${job.id}`
    keep.add(key)
    let item = list.querySelector<HTMLLIElement>(`li[data-key="${key}"]`)
    if (!item) {
      item = el('li', 'job')
      item.dataset.key = key
      const meta = el('span', 'meta')
      meta.append(el('span', 'job-step'), el('span', 'job-time'))
      item.append(el('span', 'job-name'), createBar(t('jobProgressLabel', job.name)), meta)
    }
    setText(item.querySelector('.job-name')!, job.name)
    item.querySelector('.job-name')!.setAttribute('title', job.name)
    updateBar(item.querySelector('.bar') as HTMLElement, Math.round(job.ratio * 100), false)
    setText(item.querySelector('.job-step')!, job.step ?? '')
    setText(item.querySelector('.job-time')!, jobTimeLabel(job))
    list.append(item) // keeps order
  }
  const hidden = jobs.length - shown.length
  let more = list.querySelector<HTMLLIElement>('li.more')
  if (hidden > 0) {
    more ??= el('li', 'more')
    setText(more, t('moreJobs', hidden))
    list.append(more)
  } else {
    more?.remove()
  }
  for (const item of [...list.children] as HTMLElement[]) {
    if (!item.classList.contains('more') && !keep.has(item.dataset.key ?? '')) item.remove()
  }
  list.hidden = jobs.length === 0
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
