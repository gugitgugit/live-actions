import { needsRefresh, refreshAuth } from '../lib/auth'
import { GitHubClient, GitHubError, HttpCache } from '../lib/github'
import { POPUP_PORT, type Message, type TokenResponse } from '../lib/messages'
import { runNotificationId, urlFromNotificationId } from '../lib/notifications'
import { computeProgress, formatDuration, isActive, medianDuration, summarizeJobs } from '../lib/progress'
import { getItem, setItem, updateItem } from '../lib/storage'
import type { ApiConclusion, ApiRun, AuthState, DurationStat, Meta, NotifyMode, TrackedRun } from '../lib/types'

const ALARM = 'poll'
const IDLE_PERIOD_MIN = 1
/** chrome.alarms minimum */
const ACTIVE_PERIOD_MIN = 0.5
/** faster refresh while the popup is open */
const POPUP_POLL_MS = 10_000
const KEEP_COMPLETED_MS = 30 * 60_000
const MAX_COMPLETED = 10
const DURATION_TTL_MS = 6 * 60 * 60_000
/** Notify for runs that started and finished between two polls, if the polls were close together. */
const CATCH_UP_WINDOW_MS = 5 * 60_000
const FAILED: ReadonlySet<ApiConclusion> = new Set(['failure', 'timed_out', 'startup_failure'])

// ---------- auth ----------

let refreshing: Promise<AuthState> | null = null

async function getValidAuth(): Promise<AuthState> {
  const auth = await getItem('auth')
  if (!auth) throw new GitHubError(401, 'Not signed in')
  if (!needsRefresh(auth)) return auth
  // Refresh tokens are single-use: share one in-flight refresh between callers.
  refreshing ??= refreshAuth(auth)
    .then(async (next) => {
      await setItem('auth', next)
      return next
    })
    .finally(() => {
      refreshing = null
    })
  try {
    return await refreshing
  } catch {
    throw new GitHubError(401, 'Session expired')
  }
}

const getToken = async () => (await getValidAuth()).accessToken

async function signOut(reason: string) {
  await Promise.all([
    setItem('auth', null),
    setItem('runs', {}),
    setItem('httpCache', {}),
    updateItem('meta', (m) => ({ ...m, lastError: reason })),
  ])
}

// ---------- polling ----------

let inflight: Promise<void> | null = null
let rerun = false

/** @param force run again after the current poll if one is in flight (settings changed) */
function poll(force = false): Promise<void> {
  if (inflight) {
    if (force) rerun = true
    return inflight
  }
  inflight = (async () => {
    do {
      rerun = false
      await doPoll()
    } while (rerun)
  })()
    .catch((e) => console.error('[actions-pulse] poll failed', e))
    .finally(() => {
      inflight = null
    })
  return inflight
}

async function doPoll() {
  const [auth, settings, prevRuns, meta, durations, cacheEntries] = await Promise.all([
    getItem('auth'),
    getItem('settings'),
    getItem('runs'),
    getItem('meta'),
    getItem('durations'),
    getItem('httpCache'),
  ])

  if (!auth || settings.repos.length === 0) {
    if (Object.keys(prevRuns).length) await setItem('runs', {})
    await refreshBadge({}, meta)
    await schedule(false)
    return
  }

  const now = Date.now()
  if (meta.rateLimit && meta.rateLimit.remaining < 20 && meta.rateLimit.resetAt > now) {
    await schedule(false)
    return
  }

  const cache = new HttpCache(cacheEntries)
  const client = new GitHubClient({ getToken, cache })
  const nextRuns: Record<string, TrackedRun> = {}
  const repoErrors: Record<string, string> = {}
  const finished: TrackedRun[] = []
  const lastPolledAt = meta.lastPolledAt
  const catchUp = lastPolledAt !== null && now - lastPolledAt < CATCH_UP_WINDOW_MS
  let unauthorized = false
  let lastError: string | null = null

  await Promise.all(
    settings.repos.map(async ({ fullName }) => {
      try {
        const byId = new Map((await client.listRuns(fullName)).map((r) => [r.id, r]))

        // Runs we were watching that dropped off the first page still need their final state.
        for (const prev of Object.values(prevRuns)) {
          if (prev.repo !== fullName || !isActive(prev.status) || byId.has(prev.id)) continue
          try {
            byId.set(prev.id, await client.getRun(fullName, prev.id))
          } catch {
            // run was deleted
          }
        }

        for (const run of byId.values()) {
          if (settings.onlyMine && auth.login && !isMine(run, auth.login)) continue
          const key = runKey(fullName, run.id)
          const prev = prevRuns[key]
          const active = isActive(run.status)
          const justFinished =
            !active &&
            ((prev !== undefined && (isActive(prev.status) || prev.attempt !== (run.run_attempt ?? 1))) ||
              (prev === undefined && catchUp && Date.parse(run.updated_at) > lastPolledAt!))

          if (active || justFinished) {
            const tracked = await track(client, fullName, run, durations, now)
            if (justFinished) {
              tracked.completedAt = now
              finished.push(tracked)
            }
            nextRuns[key] = tracked
          } else if (prev?.completedAt && now - prev.completedAt < KEEP_COMPLETED_MS) {
            nextRuns[key] = prev
          }
        }
      } catch (e) {
        if (e instanceof GitHubError && e.status === 401) {
          unauthorized = true
          return
        }
        repoErrors[fullName] = describeError(e)
        // keep what we had so the popup does not flash empty on a transient error
        for (const [key, run] of Object.entries(prevRuns)) {
          if (run.repo === fullName) nextRuns[key] = run
        }
      }
    }),
  )

  if (unauthorized) {
    await signOut('Your GitHub session expired or was revoked. Please sign in again.')
    await refreshBadge({}, meta)
    return
  }

  if (Object.keys(repoErrors).length === settings.repos.length) {
    lastError = Object.values(repoErrors)[0]
  }

  trimCompleted(nextRuns)

  let newFailures = 0
  for (const run of finished) {
    if (FAILED.has(run.conclusion)) newFailures++
    notify(run, settings.notify)
  }

  const [nextMeta] = await Promise.all([
    // re-read so a concurrent "mark seen" from the popup is not lost
    updateItem('meta', (m) => ({
      ...m,
      lastPolledAt: now,
      lastError,
      repoErrors,
      rateLimit: client.rateLimit ?? m.rateLimit,
      unseenFailures: m.unseenFailures + newFailures,
    })),
    setItem('runs', nextRuns),
    setItem('durations', durations),
    cache.isDirty ? setItem('httpCache', cache.snapshot()) : Promise.resolve(),
  ])

  const hasActive = Object.values(nextRuns).some((r) => isActive(r.status))
  await refreshBadge(nextRuns, nextMeta)
  await schedule(hasActive)
}

async function track(
  client: GitHubClient,
  repo: string,
  run: ApiRun,
  durations: Record<string, DurationStat>,
  now: number,
): Promise<TrackedRun> {
  const [jobs, estimateMs] = await Promise.all([
    client.listJobs(repo, run.id).then(summarizeJobs),
    getEstimate(client, repo, run.workflow_id, durations, now),
  ])
  return {
    id: run.id,
    repo,
    workflowId: run.workflow_id,
    workflowName: run.name ?? 'Workflow',
    title: run.display_title,
    branch: run.head_branch,
    event: run.event,
    actor: run.triggering_actor?.login ?? run.actor?.login ?? null,
    htmlUrl: run.html_url,
    attempt: run.run_attempt ?? 1,
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.run_started_at ?? run.created_at,
    updatedAt: run.updated_at,
    jobs,
    progress: computeProgress(run, jobs, estimateMs, now),
  }
}

/** Typical duration of a workflow, cached for a few hours. Mutates `durations`. */
async function getEstimate(
  client: GitHubClient,
  repo: string,
  workflowId: number,
  durations: Record<string, DurationStat>,
  now: number,
): Promise<number | null> {
  const key = `${repo}#${workflowId}`
  const cached = durations[key]
  if (cached && now - cached.fetchedAt < DURATION_TTL_MS) return cached.medianMs
  try {
    const medianMs = medianDuration(await client.listRecentSuccessfulRuns(repo, workflowId))
    durations[key] = { medianMs, fetchedAt: now }
    return medianMs
  } catch {
    return cached?.medianMs ?? null
  }
}

function trimCompleted(runs: Record<string, TrackedRun>) {
  const completed = Object.entries(runs)
    .filter(([, r]) => !isActive(r.status))
    .sort((a, b) => (b[1].completedAt ?? 0) - (a[1].completedAt ?? 0))
  for (const [key] of completed.slice(MAX_COMPLETED)) delete runs[key]
}

async function schedule(active: boolean) {
  const period = active ? ACTIVE_PERIOD_MIN : IDLE_PERIOD_MIN
  const existing = await chrome.alarms.get(ALARM)
  // re-creating an alarm resets its timer, so only touch it when the period changes
  if (existing?.periodInMinutes === period) return
  await chrome.alarms.create(ALARM, { periodInMinutes: period, delayInMinutes: period })
}

// ---------- badge & notifications ----------

async function refreshBadge(runs: Record<string, TrackedRun>, meta: Meta) {
  const active = Object.values(runs).filter((r) => isActive(r.status)).length
  let text = ''
  let color = '#0969da'
  if (active > 0) {
    text = String(active)
  } else if (meta.unseenFailures > 0) {
    text = '!'
    color = '#cf222e'
  }
  await Promise.all([
    chrome.action.setBadgeText({ text }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setBadgeTextColor({ color: '#ffffff' }),
    chrome.action.setTitle({ title: active ? `Actions Pulse — ${active} running` : 'Actions Pulse' }),
  ])
}

const CONCLUSION_TITLE: Record<string, string> = {
  success: '✅ Passed',
  failure: '❌ Failed',
  timed_out: '⏱ Timed out',
  startup_failure: '❌ Startup failure',
  cancelled: '⊘ Cancelled',
  action_required: '⚠️ Action required',
}

function notify(run: TrackedRun, mode: NotifyMode) {
  if (mode === 'none') return
  if (mode === 'failure' && !FAILED.has(run.conclusion)) return
  const parts = [run.repo, run.branch, formatDuration(run.progress.elapsedMs)].filter(Boolean)
  chrome.notifications.create(runNotificationId(run.htmlUrl), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: `${CONCLUSION_TITLE[run.conclusion ?? ''] ?? 'Finished'} · ${run.workflowName}`,
    message: run.title,
    contextMessage: parts.join(' · '),
    priority: FAILED.has(run.conclusion) ? 2 : 0,
  })
}

chrome.notifications.onClicked.addListener((id) => {
  const url = urlFromNotificationId(id)
  if (url) chrome.tabs.create({ url })
  chrome.notifications.clear(id)
})

// ---------- wiring ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await schedule(false)
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) chrome.runtime.openOptionsPage()
  poll()
})

chrome.runtime.onStartup.addListener(() => {
  poll()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) poll()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('settings' in changes || 'auth' in changes)) poll(true)
})

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  switch (message.type) {
    case 'poll':
      poll(true).then(() => sendResponse({ ok: true }))
      return true
    case 'getToken':
      getToken().then(
        (token) => sendResponse({ token } satisfies TokenResponse),
        (e: unknown) => sendResponse({ error: describeError(e) } satisfies TokenResponse),
      )
      return true
  }
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT) return
  updateItem('meta', (m) => ({ ...m, unseenFailures: 0 })).then(async (meta) => {
    await refreshBadge(await getItem('runs'), meta)
  })
  poll()
  const timer = setInterval(() => poll(), POPUP_POLL_MS)
  port.onDisconnect.addListener(() => clearInterval(timer))
})

// ---------- helpers ----------

function runKey(repo: string, id: number) {
  return `${repo}#${id}`
}

function isMine(run: ApiRun, login: string) {
  return run.actor?.login === login || run.triggering_actor?.login === login
}

function describeError(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 404) return 'Not found, or the app has no access to this repository'
    if (e.status === 403) return `Access denied: ${e.message}`
    return `GitHub error ${e.status}: ${e.message}`
  }
  if (e instanceof TypeError) return 'Network error'
  return e instanceof Error ? e.message : String(e)
}
