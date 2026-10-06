import { describe, expect, it } from 'vitest'
import { buildHistory, executionStart, median, remainingByJobs, stepKeys } from './estimate'
import { computeProgress } from './progress'
import type { ApiJob, ApiRun, JobSummary, StepSummary, WorkflowHistory } from './types'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString()
const at = (sec: number) => T0 + sec * 1000

/** a finished job; steps as [name, seconds] run back to back from `start` */
const apiJob = (name: string, start: number, steps: [string, number][], tail = 1, over: Partial<ApiJob> = {}): ApiJob => {
  let t = start
  const apiSteps = steps.map(([stepName, sec], i) => {
    const s = { name: stepName, number: i + 1, status: 'completed' as const, conclusion: 'success' as const, started_at: iso(t), completed_at: iso(t + sec) }
    t += sec
    return s
  })
  return { id: 1, name, status: 'completed', conclusion: 'success', html_url: null, started_at: iso(start), completed_at: iso(t + tail), steps: apiSteps, ...over }
}

const apiRun = (over: Partial<ApiRun> = {}) => ({ run_attempt: 1, run_started_at: iso(0), created_at: iso(0), ...over }) as ApiRun

const job = (name: string, over: Partial<JobSummary> = {}): JobSummary => ({
  id: 1,
  name,
  status: 'in_progress',
  conclusion: null,
  htmlUrl: null,
  stepsDone: 0,
  stepsTotal: 0,
  currentStep: null,
  startedAt: iso(0),
  completedAt: null,
  steps: [],
  ...over,
})

const steps = (names: string[], done: number, currentStartedAt: number | null): StepSummary[] =>
  names.map((name, i) => ({
    name,
    status: i < done ? 'completed' : i === done && currentStartedAt !== null ? 'in_progress' : 'queued',
    startedAt: i === done && currentStartedAt !== null ? iso(currentStartedAt) : null,
  }))

describe('median', () => {
  it('takes the middle value, averaging an even count', () => {
    expect(median([60, 300, 90])).toBe(90)
    expect(median([10, 20])).toBe(15)
    expect(median([])).toBeNull()
  })
})

describe('stepKeys', () => {
  it('numbers repeated step names', () => {
    expect(stepKeys(['Run x', 'Build', 'Run x'])).toEqual(['Run x', 'Build', 'Run x #2'])
  })
})

describe('buildHistory', () => {
  const single = (queue: number, install: number) =>
    ({ run: apiRun(), jobs: [apiJob('ci', queue, [['Set up job', 1], ['Install', install], ['Test', 3]])] })

  it('takes medians per job and step, leaving out the runner queue', () => {
    const h = buildHistory([single(2, 4), single(38, 5), single(3, 6)])!
    expect(h.totalMs).toBe(10_000) // 1 + 5 + 3 + 1 tail, whatever the queue was
    expect(h.jobs.ci.steps).toEqual({ 'Set up job': 1000, Install: 5000, Test: 3000 })
    expect(h.jobs.ci.tailMs).toBe(1000)
    expect(h.jobs.ci.after).toEqual([])
  })

  it('skips re-run attempts and skipped jobs', () => {
    const rerun = { run: apiRun({ run_attempt: 2 }), jobs: [apiJob('ci', 0, [['Test', 100]])] }
    const skipped = { run: apiRun(), jobs: [apiJob('ci', 0, [['Test', 3]]), apiJob('deploy', 0, [], 0, { conclusion: 'skipped' })] }
    const h = buildHistory([rerun, skipped])!
    expect(h.jobs.ci.durationMs).toBe(4000)
    expect(h.jobs.deploy).toBeUndefined()
    expect(buildHistory([rerun])).toBeNull()
  })

  it('infers which jobs wait for which', () => {
    // build, then test after it (with a 3 s pickup delay); lint runs alongside from the start
    const sample = () => ({
      run: apiRun(),
      jobs: [apiJob('build', 0, [['b', 10]], 0), apiJob('test', 13, [['t', 20]], 0), apiJob('lint', 0, [['l', 5]], 0)],
    })
    const h = buildHistory([sample(), sample()])!
    expect(h.jobs.test.after).toEqual(['build', 'lint'])
    expect(h.jobs.test.startDelayMs).toBe(3000)
    expect(h.jobs.build.after).toEqual([])
    expect(h.jobs.lint.after).toEqual([])
    expect(h.totalMs).toBe(33_000)
  })
})

describe('executionStart', () => {
  it('is the first job start, null before any job starts', () => {
    expect(executionStart([job('a', { startedAt: iso(38) }), job('b', { status: 'queued', startedAt: null })], at(0))).toBe(at(38))
    expect(executionStart([job('a', { status: 'queued', startedAt: null })], at(0))).toBeNull()
  })

  it('ignores jobs carried over from an earlier attempt', () => {
    expect(executionStart([job('a', { status: 'completed', startedAt: iso(-500) })], at(0))).toBe(at(0))
  })
})

describe('remainingByJobs', () => {
  const names = ['Set up job', 'Install', 'Test', 'Complete job']
  const history: WorkflowHistory = {
    totalMs: 20_000,
    jobs: {
      ci: { durationMs: 20_000, steps: { 'Set up job': 1000, Install: 5000, Test: 12_000, 'Complete job': 1000 }, tailMs: 1000, after: [], startDelayMs: 0 },
      deploy: { durationMs: 10_000, steps: {}, tailMs: 0, after: ['ci'], startDelayMs: 3000 },
      docs: { durationMs: 30_000, steps: {}, tailMs: 0, after: [], startDelayMs: 0 },
    },
  }

  it('counts down the current step between polls', () => {
    // Install started at 1 s; the same snapshot read one second apart
    const running = [job('ci', { steps: steps(names, 1, 1) })]
    expect(remainingByJobs(running, history, at(0), at(3))).toBe(3000 + 12_000 + 1000 + 1000)
    expect(remainingByJobs(running, history, at(0), at(4))).toBe(2000 + 12_000 + 1000 + 1000)
  })

  it('holds at the steps still to come when the current one overruns', () => {
    const running = [job('ci', { steps: steps(names, 1, 1) })]
    expect(remainingByJobs(running, history, at(0), at(30))).toBe(12_000 + 1000 + 1000)
  })

  it('assumes a step on time when last fetched finished on time', () => {
    // fetched at 3 s, Install usually ends at 6 s: by 8 s the next steps are 2 s in
    const running = [job('ci', { steps: steps(names, 1, 1) })]
    expect(remainingByJobs(running, history, at(0), at(8), at(3))).toBe(12_000)
  })

  it('holds once a fetch has seen the step past its usual time', () => {
    const running = [job('ci', { steps: steps(names, 1, 1) })]
    expect(remainingByJobs(running, history, at(0), at(8), at(7))).toBe(14_000)
  })

  it('adds jobs that wait for the running one', () => {
    const jobs = [job('ci', { steps: steps(names, 3, 18) }), job('deploy', { status: 'queued', startedAt: null })]
    // ci: Complete job 1 s + tail 1 s → ends at 20 s; deploy starts 3 s later and takes 10 s
    expect(remainingByJobs(jobs, history, at(0), at(18))).toBe(2000 + 3000 + 10_000)
  })

  it('ends with the slowest of jobs running side by side', () => {
    const jobs = [job('ci', { steps: steps(names, 3, 18) }), job('docs', { startedAt: iso(0) })]
    expect(remainingByJobs(jobs, history, at(0), at(18))).toBe(12_000)
  })

  it('falls back to the job duration for a step it has not seen', () => {
    const running = [job('ci', { steps: steps(['Set up job', 'New step'], 1, 2) })]
    expect(remainingByJobs(running, history, at(0), at(5))).toBe(15_000)
  })

  it('gives up when an unfinished job has no history', () => {
    expect(remainingByJobs([job('unknown')], history, at(0), at(5))).toBeNull()
  })

  it('does not count finished jobs', () => {
    const jobs = [job('ci', { status: 'completed', completedAt: iso(20) }), job('deploy', { startedAt: iso(23) })]
    expect(remainingByJobs(jobs, history, at(0), at(25))).toBe(8000)
  })
})

describe('computeProgress with history', () => {
  const history: WorkflowHistory = {
    totalMs: 15_000,
    jobs: { ci: { durationMs: 15_000, steps: { a: 5000, b: 9000 }, tailMs: 1000, after: [], startDelayMs: 0 } },
  }
  const run = { status: 'in_progress' as const, run_started_at: iso(0), created_at: iso(0), updated_at: iso(0) }

  it('does not count the runner queue as execution', () => {
    // queued for 38 s, then running for 1 s of its usual 15
    const jobs = [job('ci', { startedAt: iso(38), steps: steps(['a', 'b'], 0, 38) })]
    const p = computeProgress(run, jobs, history, at(39))
    expect(p.overtime).toBe(false)
    expect(p.remainingMs).toBe(4000 + 9000 + 1000)
    expect(p.elapsedMs).toBe(39_000)
    expect(p.ratio).toBeCloseTo(1 / 15)
  })

  it('flags overtime by execution time', () => {
    const jobs = [job('ci', { startedAt: iso(10), steps: steps(['a', 'b'], 1, 15) })]
    const p = computeProgress(run, jobs, history, at(30))
    expect(p.overtime).toBe(true)
    expect(p.overdueMs).toBe(5000)
  })
})
