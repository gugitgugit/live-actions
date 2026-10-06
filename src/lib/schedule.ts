import { computeProgress } from './progress'
import type { TrackedRun } from './types'

/** while someone is looking (popup open, or a visible GitHub tab showing progress) */
export const WATCHING_POLL_MS = 10_000
/** while a run is about to finish, so completion shows up within a couple of seconds */
export const FINISHING_POLL_MS = 2_500
const FINISHING_WINDOW_MS = 30_000
/** a run past its usual duration counts as finishing only this long, so a stuck run cannot keep polling fast forever */
const OVERTIME_GRACE_MS = 2 * 60_000
/** GitHub runs these after the user's steps in every job */
const WRAP_UP_STEP = /^(Post |Complete job$)/

export function isFinishing(run: TrackedRun, now = Date.now()): boolean {
  if (run.status !== 'in_progress') return false

  const p = computeProgress(
    { status: run.status, run_started_at: run.startedAt, created_at: run.startedAt, updated_at: run.updatedAt },
    run.jobs,
    run.progress.estimateMs,
    now,
  )
  if (p.estimateMs !== null) {
    if (p.overtime) return p.elapsedMs - p.estimateMs <= OVERTIME_GRACE_MS
    // remaining already accounts for steps holding the bar back (see computeProgress)
    if (p.remainingMs !== null && p.remainingMs <= FINISHING_WINDOW_MS) return true
  }

  // works without history too: every unfinished job is only cleaning up
  const open = run.jobs.filter((j) => j.status !== 'completed')
  return open.length > 0 && open.every((j) => j.currentStep !== null && WRAP_UP_STEP.test(j.currentStep))
}

/**
 * Delay until the next poll, or null to leave it to the alarm (30 s minimum).
 * Fast polling near the end does not need anyone watching: notifications benefit too, and
 * each poll's API calls keep the service worker alive for that short window.
 */
export function nextPollDelay(runs: TrackedRun[], watching: boolean, now = Date.now()): number | null {
  if (runs.some((r) => isFinishing(r, now))) return FINISHING_POLL_MS
  return watching ? WATCHING_POLL_MS : null
}
