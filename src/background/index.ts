import { AuthError, isTransientRefreshError, needsRefresh, refreshAuth } from '../lib/auth'
import { latestPerWorkflowEvent, rollup } from '../lib/commit'
import { describeError, errorText, isBackedOff, type ErrorInfo } from '../lib/errors'
import { buildHistory } from '../lib/estimate'
import { isCounted } from '../lib/filters'
import { formatDuration } from '../lib/format'
import { GitHubClient, GitHubError, HttpCache } from '../lib/github'
import { t, type MessageKey } from '../lib/i18n'
import { PAGE_PORT, POPUP_PORT, type Message, type PageMessage, type TokenResponse } from '../lib/messages'
import { runNotificationId, urlFromNotificationId } from '../lib/notifications'
import { computeProgress, summarizeJobs } from '../lib/progress'
import { nextPollDelay } from '../lib/schedule'
import { getItem, setItem, updateItem } from '../lib/storage'
import { FAILED_CONCLUSIONS, isActive } from '../lib/status'
import type { ApiRun, AuthState, CommitInfo, HistoryEntry, Meta, NotifyMode, RepoInfo, Settings, TrackedRun, WorkflowHistory } from '../lib/types'
import { githubUrl } from '../lib/url'

const ALARM = 'poll'
const IDLE_PERIOD_MIN = 1
/** chrome.alarms minimum */
const ACTIVE_PERIOD_MIN = 0.5
const KEEP_COMPLETED_MS = 30 * 60_000
/** per repository */
const MAX_COMPLETED = 10
const HISTORY_TTL_MS = 6 * 60 * 60_000
const REPO_INFO_TTL_MS = 24 * 60 * 60_000
/** Notify for runs that started and finished between two polls, if the polls were close together. */
const CATCH_UP_WINDOW_MS = 5 * 60_000

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
  } catch (e) {
    // keep the session: the next poll tries again, and the error shows as a network/HTTP problem
    if (isTransientRefreshError(e)) throw e
    // the reason is kept with the sign-out, so an unexpected one can be told apart later
    throw new GitHubError(401, `refresh: ${e instanceof AuthError ? e.code : String(e)}`)
  }
}

const getToken = async () => (await getValidAuth()).accessToken

/** The next poll, triggered by the change to `auth`, clears what belonged to the session. */
async function signOut(reason: ErrorInfo) {
  await Promise.all([setItem('auth', null), updateItem('meta', (m) => ({ ...m, lastError: reason }))])
}

// ---------- polling ----------

let inflight: Promise<void> | null = null
let rerun = false
/** set when settings or sign-in change, so repositories left alone after a 404 are asked again */
let retryInaccessible = false

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
    .catch((e) => console.error('[live-actions] poll failed', e))
    .finally(() => {
      inflight = null
      scheduleNextPoll()
    })
  return inflight
}

/** runs from the latest poll; drives how soon the next poll happens */
let lastRuns: TrackedRun[] = []
let nextPollTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Adaptive polling on top of the alarm: every 10 s while someone is watching, every
 * 2.5 s while a run is about to finish (lib/schedule.ts), otherwise only the alarm.
 */
function scheduleNextPoll() {
  if (nextPollTimer) clearTimeout(nextPollTimer)
  nextPollTimer = null
  if (inflight) return // rescheduled when it settles
  const delay = nextPollDelay(lastRuns, isWatching())
  if (delay === null) return
  nextPollTimer = setTimeout(() => {
    nextPollTimer = null
    poll()
  }, delay)
}

async function doPoll() {
  const [auth, settings, prevRuns, meta, histories, cacheEntries, repoInfo] = await Promise.all([
    getItem('auth'),
    getItem('settings'),
    getItem('runs'),
    getItem('meta'),
    getItem('histories'),
    getItem('httpCache'),
    getItem('repoInfo'),
  ])
  const commits: Record<string, CommitInfo> = {}

  const watched = new Set(settings.repos.map((r) => r.fullName))
  const viewed = settings.inPage ? viewedRepos() : new Set<string>()
  const repos = new Set([...watched, ...viewed])

  if (!auth || repos.size === 0) {
    lastRuns = []
    // nothing is polled for them any more; keep no state that pages would keep drawing
    await Promise.all([
      Object.keys(prevRuns).length ? setItem('runs', {}) : null,
      setItem('commits', {}),
      // signed out: drop everything learned with that account, private repository names included
      ...(auth
        ? []
        : [
            setItem('httpCache', {}),
            setItem('histories', {}),
            setItem('repoInfo', {}),
            Object.keys(meta.repoErrors).length ? updateItem('meta', (m) => ({ ...m, repoErrors: {} })) : null,
          ]),
    ])
    await refreshBadge({}, meta, settings, auth?.login)
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
  const repoErrors: Record<string, ErrorInfo> = {}
  const finished: TrackedRun[] = []
  const lastPolledAt = meta.lastPolledAt
  const catchUp = lastPolledAt !== null && now - lastPolledAt < CATCH_UP_WINDOW_MS
  let unauthorized: string | null = null

  const retryAll = retryInaccessible
  retryInaccessible = false

  await Promise.all(
    [...repos].map(async (fullName) => {
      const prevError = meta.repoErrors[fullName]
      if (!retryAll && isBackedOff(prevError, now)) {
        // keep showing why (the page's install hint) without asking GitHub again yet
        repoErrors[fullName] = prevError as ErrorInfo
        return
      }
      try {
        if (viewed.has(fullName)) {
          await refreshRepoInfo(client, fullName, repoInfo, now)
          for (const sha of viewedCommits(fullName)) {
            const all = await client.listRunsForCommit(fullName, sha)
            commits[`${fullName}@${sha}`] = { actions: rollup(latestPerWorkflowEvent(all)), fetchedAt: now }
          }
        }

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
          const key = runKey(fullName, run.id)
          const prev = prevRuns[key]
          const active = isActive(run.status)
          const justFinished =
            !active &&
            ((prev !== undefined && (isActive(prev.status) || prev.attempt !== (run.run_attempt ?? 1))) ||
              (prev === undefined && catchUp && Date.parse(run.updated_at) > lastPolledAt!))

          if (active || justFinished) {
            const tracked = await track(client, fullName, run, histories, now)
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
          unauthorized = e.message
          return
        }
        const info = describeError(e)
        repoErrors[fullName] = info.code === 'not_found' ? { ...info, at: now } : info
        // keep what we had so the UI does not flash empty on a transient error
        for (const [key, run] of Object.entries(prevRuns)) {
          if (run.repo === fullName) nextRuns[key] = run
        }
      }
    }),
  )

  if (unauthorized !== null) {
    await signOut({ code: 'session_expired', detail: unauthorized })
    await refreshBadge({}, meta, settings, auth.login)
    return
  }

  // a summary error only when every watched repository failed
  const watchedErrors = Object.keys(repoErrors).filter((r) => watched.has(r))
  const lastError = watched.size > 0 && watchedErrors.length === watched.size ? repoErrors[watchedErrors[0]] : null

  trimCompleted(nextRuns)

  let newFailures = 0
  for (const run of finished) {
    // repositories that are only open in a tab show their result on the page, without alerts
    if (!isCounted(run, settings, auth.login)) continue
    if (FAILED_CONCLUSIONS.has(run.conclusion)) newFailures++
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
    setItem('histories', histories),
    setItem('repoInfo', pruneRepoInfo(repoInfo, now)),
    // only commits open right now; closed tabs drop out
    setItem('commits', commits),
    cache.isDirty ? setItem('httpCache', cache.snapshot()) : Promise.resolve(),
  ])

  lastRuns = Object.values(nextRuns)
  const hasActive = lastRuns.some((r) => isActive(r.status))
  await refreshBadge(nextRuns, nextMeta, settings, auth.login)
  await schedule(hasActive)
}

/** Default branch of a repository open on github.com, cached for a day. Mutates `repoInfo`. */
async function refreshRepoInfo(client: GitHubClient, repo: string, repoInfo: Record<string, RepoInfo>, now: number) {
  const cached = repoInfo[repo]
  if (cached && now - cached.fetchedAt < REPO_INFO_TTL_MS) return
  const data = await client.getRepo(repo)
  repoInfo[repo] = { defaultBranch: data.default_branch ?? null, fetchedAt: now }
}

function pruneRepoInfo(repoInfo: Record<string, RepoInfo>, now: number): Record<string, RepoInfo> {
  return Object.fromEntries(Object.entries(repoInfo).filter(([, info]) => now - info.fetchedAt < REPO_INFO_TTL_MS))
}

async function track(
  client: GitHubClient,
  repo: string,
  run: ApiRun,
  histories: Record<string, HistoryEntry>,
  now: number,
): Promise<TrackedRun> {
  const [jobs, history] = await Promise.all([
    client.listJobs(repo, run.id).then(summarizeJobs),
    getHistory(client, repo, run.workflow_id, histories, now),
  ])
  return {
    id: run.id,
    repo,
    workflowId: run.workflow_id,
    workflowName: run.name ?? t('unnamedWorkflow'),
    title: run.display_title,
    branch: run.head_branch,
    headSha: run.head_sha,
    prNumbers: (run.pull_requests ?? []).map((pr) => pr.number),
    event: run.event,
    actor: run.triggering_actor?.login ?? run.actor?.login ?? null,
    htmlUrl: githubUrl(run.html_url) ?? `https://github.com/${repo}/actions/runs/${run.id}`,
    attempt: run.run_attempt ?? 1,
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.run_started_at ?? run.created_at,
    updatedAt: run.updated_at,
    jobs,
    history,
    fetchedAt: now,
    progress: computeProgress(run, jobs, history, now),
  }
}

/**
 * How recent successful runs of a workflow went, job by job and step by step, cached for a
 * few hours. Costs one jobs request per sampled run on a cache miss. Mutates `histories`.
 */
async function getHistory(
  client: GitHubClient,
  repo: string,
  workflowId: number,
  histories: Record<string, HistoryEntry>,
  now: number,
): Promise<WorkflowHistory | null> {
  const key = `${repo}#${workflowId}`
  const cached = histories[key]
  if (cached && now - cached.fetchedAt < HISTORY_TTL_MS) return cached.history
  try {
    const runs = await client.listRecentSuccessfulRuns(repo, workflowId)
    const samples = await Promise.all(runs.map(async (run) => ({ run, jobs: await client.listJobs(repo, run.id) })))
    const history = buildHistory(samples)
    histories[key] = { history, fetchedAt: now }
    return history
  } catch {
    return cached?.history ?? null
  }
}

function trimCompleted(runs: Record<string, TrackedRun>) {
  const byRepo = new Map<string, [string, TrackedRun][]>()
  for (const entry of Object.entries(runs)) {
    if (isActive(entry[1].status)) continue
    byRepo.set(entry[1].repo, [...(byRepo.get(entry[1].repo) ?? []), entry])
  }
  for (const completed of byRepo.values()) {
    completed.sort((a, b) => (b[1].completedAt ?? 0) - (a[1].completedAt ?? 0))
    for (const [key] of completed.slice(MAX_COMPLETED)) delete runs[key]
  }
}

async function schedule(active: boolean) {
  const period = active ? ACTIVE_PERIOD_MIN : IDLE_PERIOD_MIN
  const existing = await chrome.alarms.get(ALARM)
  // re-creating an alarm resets its timer, so only touch it when the period changes
  if (existing?.periodInMinutes === period) return
  await chrome.alarms.create(ALARM, { periodInMinutes: period, delayInMinutes: period })
}

// ---------- badge & notifications ----------

async function refreshBadge(
  runs: Record<string, TrackedRun>,
  meta: Meta,
  settings: Settings,
  login: string | undefined,
) {
  const active = Object.values(runs).filter((r) => isActive(r.status) && isCounted(r, settings, login)).length
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
    chrome.action.setTitle({ title: active ? t('badgeTitleRunning', active) : t('extName') }),
  ])
}

const CONCLUSION_TITLE: Record<string, MessageKey> = {
  success: 'notifPassed',
  failure: 'notifFailed',
  timed_out: 'notifTimedOut',
  startup_failure: 'notifStartupFailure',
  cancelled: 'notifCancelled',
  action_required: 'notifActionRequired',
}

function notify(run: TrackedRun, mode: NotifyMode) {
  if (mode === 'none') return
  if (mode === 'failure' && !FAILED_CONCLUSIONS.has(run.conclusion)) return
  const parts = [run.repo, run.branch, formatDuration(run.progress.elapsedMs)].filter(Boolean)
  chrome.notifications.create(runNotificationId(run.htmlUrl), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: t(CONCLUSION_TITLE[run.conclusion ?? ''] ?? 'notifFinished', run.workflowName),
    message: run.title,
    contextMessage: parts.join(' · '),
    priority: FAILED_CONCLUSIONS.has(run.conclusion) ? 2 : 0,
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
  if (reason === chrome.runtime.OnInstalledReason.INSTALL || reason === chrome.runtime.OnInstalledReason.UPDATE) {
    injectIntoOpenTabs()
  }
  poll()
})

/**
 * Chrome runs content scripts only in pages loaded after the extension is installed, and an
 * update cuts off the copies in open tabs (they stop themselves, see alive() in
 * content/index.ts). Without this, GitHub tabs open at install or after an automatic update
 * would show nothing new until refreshed. The files come from the built manifest because
 * the bundler names them with content hashes.
 */
async function injectIntoOpenTabs() {
  for (const script of chrome.runtime.getManifest().content_scripts ?? []) {
    if (!script.js?.length || !script.matches?.length) continue
    const tabs = await chrome.tabs.query({ url: script.matches })
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id === undefined) return
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: script.js! })
        } catch {
          // a discarded tab or an error page: it gets the script when it loads again
        }
      }),
    )
  }
}

chrome.runtime.onStartup.addListener(() => {
  poll()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) poll()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('settings' in changes || 'auth' in changes)) {
    retryInaccessible = true
    poll(true)
  }
})

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  switch (message.type) {
    case 'poll':
      poll(true).then(() => sendResponse({ ok: true }))
      return true
    case 'getToken':
      // only extension pages. Checked by the sender's URL, not sender.tab: the settings page
      // opens in a tab too, while content scripts report the github.com page they run in.
      if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return
      getToken().then(
        (token) => sendResponse({ token } satisfies TokenResponse),
        (e: unknown) => sendResponse({ error: errorText(describeError(e)) } satisfies TokenResponse),
      )
      return true
  }
})

// Someone is looking at progress (popup open, or a visible GitHub tab showing it): poll faster.
let popupPorts = 0
const pagePorts = new Map<chrome.runtime.Port, { repo: string | null; sha: string | null }>()

function isWatching(): boolean {
  return popupPorts > 0 || viewedRepos().size > 0
}

function viewedRepos(): Set<string> {
  return new Set([...pagePorts.values()].map((v) => v.repo).filter((r): r is string => r !== null))
}

function viewedCommits(repo: string): Set<string> {
  return new Set(
    [...pagePorts.values()].filter((v) => v.repo === repo && v.sha).map((v) => v.sha as string),
  )
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id) return

  if (port.name === POPUP_PORT) {
    popupPorts++
    Promise.all([updateItem('meta', (m) => ({ ...m, unseenFailures: 0 })), getItem('settings'), getItem('auth')]).then(
      async ([meta, settings, auth]) => refreshBadge(await getItem('runs'), meta, settings, auth?.login),
    )
    scheduleNextPoll()
    poll()
    port.onDisconnect.addListener(() => {
      readDisconnectError()
      popupPorts--
      scheduleNextPoll()
    })
    return
  }

  if (port.name === PAGE_PORT) {
    pagePorts.set(port, { repo: null, sha: null })
    port.onMessage.addListener((msg: PageMessage) => {
      if (msg.type === 'poke') return pokePoll()
      if (msg.type !== 'view') return
      const before = pagePorts.get(port)
      const sha = msg.sha && /^[0-9a-f]{40}$/.test(msg.sha) ? msg.sha : null
      pagePorts.set(port, { repo: msg.repo, sha })
      scheduleNextPoll()
      // a newly opened repository or commit should not wait for the next tick
      if (msg.repo && (msg.repo !== before?.repo || sha !== before?.sha)) poll(true)
    })
    port.onDisconnect.addListener(() => {
      readDisconnectError()
      pagePorts.delete(port)
      scheduleNextPoll()
    })
  }
})

// GitHub pushes updates to an open pull request over its own WebSocket; the content script
// turns those into pokes. Poll right away, then once more shortly after in case the API lags
// behind GitHub's page by a moment, never more often than POKE_MIN_INTERVAL_MS.
const POKE_MIN_INTERVAL_MS = 3_000
let lastPokeAt = 0
let pokeTimer: ReturnType<typeof setTimeout> | null = null
let pokeFollowUp: ReturnType<typeof setTimeout> | null = null

function pokePoll() {
  const wait = lastPokeAt + POKE_MIN_INTERVAL_MS - Date.now()
  if (wait > 0) {
    pokeTimer ??= setTimeout(() => {
      pokeTimer = null
      pokePoll()
    }, wait)
    return
  }
  lastPokeAt = Date.now()
  poll(true)
  if (pokeFollowUp) clearTimeout(pokeFollowUp)
  pokeFollowUp = setTimeout(() => {
    pokeFollowUp = null
    poll(true)
  }, POKE_MIN_INTERVAL_MS)
}

// ---------- helpers ----------

/**
 * Chrome closes a port with a reason in `runtime.lastError` when the other side goes away
 * abnormally, e.g. a GitHub tab moving into the back/forward cache. A disconnect is expected
 * and handled either way, but a reason nobody reads is logged as "Unchecked
 * runtime.lastError" on the extensions page, so read it.
 */
function readDisconnectError() {
  void chrome.runtime.lastError
}

function runKey(repo: string, id: number) {
  return `${repo}#${id}`
}
