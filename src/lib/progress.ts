import type { ApiJob, ApiRun, ApiRunStatus, JobSummary, Progress } from './types'

export const ACTIVE_STATUSES: ReadonlySet<ApiRunStatus> = new Set([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
])

export function isActive(status: ApiRunStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

export function summarizeJobs(jobs: ApiJob[]): JobSummary[] {
  return jobs.map((job) => {
    const steps = job.steps ?? []
    const current = steps.find((s) => s.status === 'in_progress')
    return {
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      htmlUrl: job.html_url,
      stepsDone: steps.filter((s) => s.status === 'completed').length,
      stepsTotal: steps.length,
      currentStep: current?.name ?? null,
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

/** Cap for unfinished runs so the bar never looks done before it is. */
const MAX_ACTIVE_RATIO = 0.97

export function computeProgress(
  run: Pick<ApiRun, 'status' | 'run_started_at' | 'created_at' | 'updated_at'>,
  jobs: JobSummary[],
  estimateMs: number | null,
  now = Date.now(),
): Progress {
  const startedAt = Date.parse(run.run_started_at ?? run.created_at)
  const done = run.status === 'completed'
  const endAt = done ? Date.parse(run.updated_at) : now
  const elapsedMs = Math.max(0, endAt - startedAt)
  const jobsDone = jobs.filter((j) => j.status === 'completed').length

  if (done) {
    return {
      ratio: 1,
      jobsDone,
      jobsTotal: jobs.length,
      elapsedMs,
      estimateMs,
      remainingMs: 0,
      overtime: false,
    }
  }

  // Time is a better signal than step count (one slow step can dominate a run),
  // so use it when history exists, but never fall behind what the steps say.
  const byTime = estimateMs ? elapsedMs / estimateMs : 0
  const ratio = Math.min(MAX_ACTIVE_RATIO, Math.max(byTime, stepRatio(jobs)))

  return {
    ratio,
    jobsDone,
    jobsTotal: jobs.length,
    elapsedMs,
    estimateMs,
    remainingMs: estimateMs ? Math.max(0, estimateMs - elapsedMs) : null,
    overtime: estimateMs !== null && elapsedMs > estimateMs,
  }
}

/** Median duration of completed runs; robust against the occasional cache-miss outlier. */
export function medianDuration(runs: ApiRun[]): number | null {
  const durations = runs
    .map((r) => Date.parse(r.updated_at) - Date.parse(r.run_started_at ?? r.created_at))
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b)
  if (durations.length === 0) return null
  const mid = Math.floor(durations.length / 2)
  return durations.length % 2 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2)
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}
