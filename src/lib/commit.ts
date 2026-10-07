import { isActive } from './progress'
import { FAILED_CONCLUSIONS } from './status'
import type { ApiRun, CommitInfo } from './types'

/** The three states GitHub's commit status badge shows. */
export type BadgeState = 'pending' | 'success' | 'failure'

const PASSING = new Set(['success', 'skipped', 'neutral'])

/**
 * A workflow can run several times for one commit (push and pull_request events, or a
 * manual re-trigger). Only the newest run of each workflow and event decides the result,
 * like GitHub keeps only the latest check run per name.
 */
export function latestPerWorkflowEvent(runs: ApiRun[]): ApiRun[] {
  const latest = new Map<string, ApiRun>()
  for (const r of runs) {
    const key = `${r.workflow_id}:${r.event}`
    const cur = latest.get(key)
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) latest.set(key, r)
  }
  return [...latest.values()]
}

/** Combined state of a commit's Actions runs, the way GitHub rolls checks up. */
export function rollup(runs: Pick<ApiRun, 'status' | 'conclusion'>[]): BadgeState | null {
  if (runs.length === 0) return null
  if (runs.some((r) => r.status === 'completed' && FAILED_CONCLUSIONS.has(r.conclusion))) return 'failure'
  if (runs.some((r) => isActive(r.status))) return 'pending'
  if (runs.every((r) => PASSING.has(r.conclusion ?? ''))) return 'success'
  // cancelled or action_required: no opinion, leave GitHub's badge alone
  return null
}

export function badgeFromOcticon(className: string): BadgeState | null {
  // compare whole class tokens: a regex word boundary would also match "octicon-x-circle"
  const classes = new Set(className.split(/\s+/))
  if (classes.has('octicon-check')) return 'success'
  if (classes.has('octicon-x')) return 'failure'
  if (classes.has('octicon-dot-fill')) return 'pending'
  return null
}

/**
 * What GitHub's badge would show after a refresh, or null to leave it as is.
 *
 * The badge also counts checks this extension cannot see (other CI, status APIs). Its
 * state at page load already reflects them correctly, so only the change in Actions since
 * then is applied:
 * - loaded red while Actions was not failing → another check failed; stays red
 * - loaded yellow while Actions had passed → another check was pending; stays at least yellow
 */
export function predictBadge(
  nativeAtLoad: BadgeState,
  actionsAtLoad: BadgeState | null,
  actionsNow: BadgeState | null,
): BadgeState | null {
  if (actionsNow === null || actionsNow === actionsAtLoad) return null
  const otherFailing = nativeAtLoad === 'failure' && actionsAtLoad !== 'failure'
  const otherPending = nativeAtLoad === 'pending' && actionsAtLoad === 'success'

  let next: BadgeState
  if (otherFailing || actionsNow === 'failure') next = 'failure'
  else if (actionsNow === 'pending' || otherPending) next = 'pending'
  else next = 'success'
  return next === nativeAtLoad ? null : next
}

/**
 * How old a commit's Actions state may be and still be drawn over GitHub's badge. A tab that
 * shows the commit is polled every 10 s (2.5 s near the end of a run), so anything older
 * means polling has stopped: signed out, rate limited, offline. GitHub's own badge, stale as
 * it may be, is then the more honest thing to show than our last word.
 */
export const COMMIT_STATE_MAX_AGE_MS = 60_000

/** The Actions state to draw, or undefined when there is none or it is too old to trust. */
export function freshActions(info: CommitInfo | undefined, now: number): BadgeState | null | undefined {
  if (!info || now - info.fetchedAt > COMMIT_STATE_MAX_AGE_MS) return undefined
  return info.actions
}
