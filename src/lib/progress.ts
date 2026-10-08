import { executionStart, remainingByJobs } from './estimate'
import { formatDuration } from './format'
import { t } from './i18n'
import type { ApiJob, ApiRun, JobSummary, Progress, TrackedRun, WorkflowHistory } from './types'
import { githubUrl } from './url'

export function summarizeJobs(jobs: ApiJob[]): JobSummary[] {
  return jobs.map((job) => {
    const steps = job.steps ?? []
    const current = steps.find((s) => s.status === 'in_progress')
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      htmlUrl: githubUrl(job.html_url),
      stepsDone: steps.filter((s) => s.status === 'completed').length,
      stepsTotal: steps.length,
      currentStep: current?.name ?? null,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      steps: steps.map((s) => ({ name: s.name, status: s.status, startedAt: s.started_at ?? null })),
    }
  })
}

/**
 * Mean of per-job completion. Queued jobs have no steps yet, so summing steps
 * across jobs would overstate progress; averaging per job does not.
 */
export function stepRatio(jobs: JobSummary[]): number {
  if (jobs.length === 0) return 0
  const total = jobs.reduce((acc, job) => {
    if (job.status === 'completed') return acc + 1
    if (job.stepsTotal === 0) return acc
    return acc + job.stepsDone / job.stepsTotal
  }, 0)
  return total / jobs.length
}

/**
 * Highest completion the steps allow: a job can be at most at the end of the step
 * it is running now. Jobs that have not started cap at 0; a running job whose steps
 * are not reported yet is left unconstrained because there is nothing to go on.
 */
export function stepCeiling(jobs: JobSummary[]): number {
  if (jobs.length === 0) return 0
  const total = jobs.reduce((acc, job) => {
    if (job.status === 'completed') return acc + 1
    if (job.stepsTotal === 0) return acc + (job.status === 'in_progress' ? 1 : 0)
    return acc + Math.min(1, (job.stepsDone + 1) / job.stepsTotal)
  }, 0)
  return total / jobs.length
}

/** Cap for unfinished runs so the bar never looks done before it is. */
const MAX_ACTIVE_RATIO = 0.97

export function computeProgress(
  run: Pick<ApiRun, 'status' | 'run_started_at' | 'created_at' | 'updated_at'>,
  jobs: JobSummary[],
  history: WorkflowHistory | null,
  now = Date.now(),
  /** when `jobs` was fetched; estimates carry on from there between polls */
  fetchedAt = now,
): Progress {
  const startedAt = Date.parse(run.run_started_at ?? run.created_at)
  const done = run.status === 'completed'
  const endAt = done ? Date.parse(run.updated_at) : now
  const elapsedMs = Math.max(0, endAt - startedAt)
  const jobsDone = jobs.filter((j) => j.status === 'completed').length
  const estimateMs = history?.totalMs ?? null

  if (done) {
    return { ratio: 1, jobsDone, jobsTotal: jobs.length, elapsedMs, estimateMs, remainingMs: 0, overtime: false, overdueMs: 0 }
  }

  // Waiting for a runner is not part of the work, and varies from seconds to minutes:
  // compare execution time only, on both sides of the estimate.
  const execStart = executionStart(jobs, startedAt)
  const execMs = execStart === null ? 0 : Math.max(0, now - execStart)
  const overdueMs = estimateMs === null ? 0 : Math.max(0, execMs - estimateMs)
  const base = { jobsDone, jobsTotal: jobs.length, elapsedMs, estimateMs, overtime: overdueMs > 0, overdueMs }

  // Per job and step: the current step keeps counting down between polls, and a poll only
  // corrects by how much faster or slower that step was than usual.
  const byJobs = history ? remainingByJobs(jobs, history, execStart, now, fetchedAt) : null
  if (byJobs !== null) {
    const ratio = execStart === null ? 0 : byJobs === 0 ? MAX_ACTIVE_RATIO : execMs / (execMs + byJobs)
    return { ...base, ratio: Math.min(MAX_ACTIVE_RATIO, ratio), remainingMs: byJobs }
  }

  // Without per-job history, interpolate the whole run by time, within what the steps say:
  // never behind the finished steps, never past the end of the running step.
  const floor = stepRatio(jobs)
  const ceiling = stepCeiling(jobs)
  const byTime = estimateMs ? execMs / estimateMs : 0
  const ratio = Math.min(MAX_ACTIVE_RATIO, Math.min(ceiling, Math.max(byTime, floor)))

  return {
    ...base,
    ratio,
    // When the steps hold the bar back, the clock alone would promise too little time left;
    // assume the remaining share of the work takes its share of the typical duration.
    remainingMs:
      estimateMs === null ? null : base.overtime ? 0 : Math.max(estimateMs - execMs, estimateMs * (1 - ratio)),
  }
}

/** Progress of a stored run at `now`, so bars and timers move between polls. */
export function runProgress(run: TrackedRun, now: number): Progress {
  return computeProgress(
    { status: run.status, run_started_at: run.startedAt, created_at: run.startedAt, updated_at: run.updatedAt },
    run.jobs,
    run.history,
    now,
    run.fetchedAt,
  )
}

/**
 * How far past the usual duration a run can be and still count as finishing. The end is
 * noticed late: GitHub marks a run completed 1 to 6 seconds after its last job, and the next
 * poll can be 2.5 s away, while the clock keeps running. The same window schedule.ts uses for
 * "about to finish".
 */
const WRAP_UP_GRACE_MS = 30_000

/**
 * The time shown next to a running bar:
 * - time left while there is some
 * - "finishing up" once the estimate is used up but the end has not been seen yet (no number:
 *   it would keep counting past the real end, which is noticed a few seconds late)
 * - elapsed time and "slower than usual" only when well past the usual duration
 */
export function timeLabel(p: Progress, queued: boolean): string {
  if (queued) return t('queuedFor', formatDuration(p.elapsedMs))
  if (p.overdueMs > WRAP_UP_GRACE_MS) return t('slowerThanUsual', formatDuration(p.elapsedMs))
  if (p.remainingMs === null) return formatDuration(p.elapsedMs)
  // under half a second would read "0 s left"
  if (p.remainingMs < 500) return t('finishingUp')
  return t('timeLeft', formatDuration(p.remainingMs))
}

/**
 * The text under a progress bar. Counts what is informative for the run's shape:
 * - one job: its steps ("Steps 4/11"), since "Jobs 0/1" only changes at the very end
 * - several jobs, one running: jobs and that job's steps ("Jobs 2/5 · Steps 3/8")
 * - several running at once (a matrix): jobs only; whose steps would be ambiguous
 * followed by the step running now. Step counts include GitHub's own setup and cleanup
 * steps, the same ones the progress bar is based on.
 */
export function progressSummary(jobs: JobSummary[]): string {
  const running = jobs.filter((j) => j.status === 'in_progress')
  const only = running.length === 1 && running[0].stepsTotal > 0 ? running[0] : null
  const jobCount = t('jobsProgress', jobs.filter((j) => j.status === 'completed').length, jobs.length)
  const parts = [
    // a lone job's count says nothing new, unless there is no step count to show instead
    jobs.length > 1 || !only ? jobCount : null,
    only ? t('stepsProgress', only.stepsDone, only.stepsTotal) : null,
    running[0]?.currentStep ?? null,
  ]
  return parts.filter(Boolean).join(' · ')
}
