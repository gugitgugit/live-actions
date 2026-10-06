import type { ApiJob, ApiRun, JobHistory, JobSummary, WorkflowHistory } from './types'

/**
 * Time left, estimated from how long each job and step took in recent successful runs.
 *
 * GitHub's API does not say which jobs wait for which (`needs` lives in the workflow file,
 * which would take repository contents permission to read), so the order is inferred from
 * history: a job that had always finished before another one started is taken as its
 * predecessor. Each unfinished job's end is then predicted, and the run ends with the last.
 */

export function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** Step names repeat (two checkouts, say), so later occurrences get a counter: "Run x", "Run x #2". */
export function stepKeys(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name} #${n}`
  })
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

interface Sample {
  run: ApiRun
  jobs: ApiJob[]
}

interface JobTiming {
  start: number
  end: number
  steps: Record<string, number>
  tail: number | null
}

/**
 * Re-run attempts are left out: jobs carried over from the earlier attempt keep their old
 * timestamps and would distort both the order and the total.
 */
export function buildHistory(samples: Sample[]): WorkflowHistory | null {
  const runs: Map<string, JobTiming>[] = []
  for (const { run, jobs } of samples) {
    if ((run.run_attempt ?? 1) !== 1) continue
    const timings = new Map<string, JobTiming>()
    for (const job of jobs) {
      const start = time(job.started_at)
      const end = time(job.completed_at)
      if (job.conclusion === 'skipped' || !(end >= start)) continue
      const steps = job.steps ?? []
      const keys = stepKeys(steps.map((s) => s.name))
      const stepTimes: Record<string, number> = {}
      steps.forEach((s, i) => {
        const d = time(s.completed_at) - time(s.started_at)
        if (d >= 0) stepTimes[keys[i]] = d
      })
      const lastStepEnd = Math.max(...steps.map((s) => time(s.completed_at)).filter(Number.isFinite))
      timings.set(job.name, { start, end, steps: stepTimes, tail: Number.isFinite(lastStepEnd) ? Math.max(0, end - lastStepEnd) : null })
    }
    if (timings.size > 0) runs.push(timings)
  }
  if (runs.length === 0) return null

  const names = new Set(runs.flatMap((r) => [...r.keys()]))
  const jobs: Record<string, JobHistory> = {}
  for (const name of names) {
    const own = runs.filter((r) => r.has(name))
    const after = [...names].filter((other) => {
      if (other === name) return false
      const both = own.filter((r) => r.has(other))
      return both.length > 0 && both.every((r) => r.get(other)!.end <= r.get(name)!.start)
    })
    const stepNames = new Set(own.flatMap((r) => Object.keys(r.get(name)!.steps)))
    const steps: Record<string, number> = {}
    for (const key of stepNames) {
      const m = median(own.map((r) => r.get(name)!.steps[key]).filter((v) => v !== undefined))
      if (m !== null) steps[key] = m
    }
    jobs[name] = {
      durationMs: median(own.map((r) => r.get(name)!.end - r.get(name)!.start)) ?? 0,
      steps,
      tailMs: median(own.map((r) => r.get(name)!.tail).filter((v): v is number => v !== null)) ?? 0,
      after,
      startDelayMs:
        median(
          own.map((r) => {
            const preds = after.filter((p) => r.has(p)).map((p) => r.get(p)!.end)
            const base = preds.length > 0 ? Math.max(...preds) : Math.min(...[...r.values()].map((t) => t.start))
            return r.get(name)!.start - base
          }),
        ) ?? 0,
    }
  }

  const totalMs = median(runs.map((r) => {
    const all = [...r.values()]
    return Math.max(...all.map((t) => t.end)) - Math.min(...all.map((t) => t.start))
  }))
  return { totalMs, jobs }
}

/**
 * When execution began: the first job's start, but not before this attempt started (a re-run
 * lists the jobs it carried over with their old times). Null while no job has started.
 */
export function executionStart(jobs: JobSummary[], attemptStart: number): number | null {
  const started = jobs.filter((j) => j.status === 'in_progress' || j.status === 'completed')
  if (started.length === 0) return null
  const times = started.map((j) => time(j.startedAt)).filter(Number.isFinite)
  // runs stored by older versions have no job times
  return times.length > 0 ? Math.max(attemptStart, Math.min(...times)) : attemptStart
}

/**
 * Milliseconds until the last job is expected to finish, or null when some unfinished job
 * has no history to go on (a new job, or names that change per run): mixing measured and
 * guessed jobs would be less clear than the coarser whole-run estimate the caller falls back to.
 */
export function remainingByJobs(
  jobs: JobSummary[],
  history: WorkflowHistory,
  execStart: number | null,
  now: number,
  /** when `jobs` was fetched */
  fetchedAt = now,
): number | null {
  const byName = new Map(jobs.map((j) => [j.name, j]))
  const ends = new Map<string, number>()
  const visiting = new Set<string>()

  const endOf = (job: JobSummary): number => {
    const known = ends.get(job.name)
    if (known !== undefined) return known
    if (visiting.has(job.name)) return NaN
    visiting.add(job.name)
    const end = predictEnd(job)
    visiting.delete(job.name)
    ends.set(job.name, end)
    return end
  }

  const predictEnd = (job: JobSummary): number => {
    if (job.status === 'completed') return Math.min(now, time(job.completedAt) || now)
    const h = history.jobs[job.name]
    if (!h) return NaN
    if (job.status === 'in_progress') return runningEnd(job, h, now, fetchedAt)
    // not started: after its observed predecessors, as late as they usually start
    const predEnds = h.after.flatMap((p) => (byName.has(p) ? [endOf(byName.get(p)!)] : []))
    const base = predEnds.length > 0 ? Math.max(...predEnds) : (execStart ?? now)
    return Math.max(now, base + h.startDelayMs) + h.durationMs
  }

  let last = now
  for (const job of jobs) {
    const end = endOf(job)
    if (!Number.isFinite(end)) return null
    last = Math.max(last, end)
  }
  return last - now
}

/**
 * A running job: the steps still to come, after what is usually left of the current one.
 * A step that was within its usual time when last fetched is assumed to have finished on
 * time, so the countdown carries on between polls instead of stalling on steps that take a
 * second or two; one that was already past it is still running, and the estimate holds.
 */
function runningEnd(job: JobSummary, h: JobHistory, now: number, fetchedAt: number): number {
  const steps = job.steps ?? []
  const started = time(job.startedAt)
  const byJob = Math.max(now, (Number.isFinite(started) ? started : now) + h.durationMs)
  if (steps.length === 0) return byJob

  const keys = stepKeys(steps.map((s) => s.name))
  // between two steps the next one starts right away
  let current = fetchedAt
  let rest = h.tailMs
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step.status === 'completed') continue
    const usual = h.steps[keys[i]]
    // a step this job did not have before: the job-level figure is the better guess
    if (usual === undefined) return byJob
    if (step.status === 'in_progress') {
      const usualEnd = time(step.startedAt) + usual
      current = Number.isFinite(usualEnd) && fetchedAt <= usualEnd ? usualEnd : now
    } else {
      rest += usual
    }
  }
  return Math.max(now, current + rest)
}
