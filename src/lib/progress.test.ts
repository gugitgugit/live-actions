import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'
import { computeProgress, progressSummary, stepCeiling, stepRatio, summarizeJobs, timeLabel } from './progress'
import type { ApiJob, ApiRun, JobSummary, Progress, WorkflowHistory } from './types'

/** history with a run total only, no per-job figures: the whole-run fallback */
const whole = (totalMs: number): WorkflowHistory => ({ totalMs, jobs: {} })

const job = (over: Partial<JobSummary>): JobSummary => ({
  id: 1,
  name: 'build',
  status: 'in_progress',
  conclusion: null,
  htmlUrl: null,
  stepsDone: 0,
  stepsTotal: 0,
  currentStep: null,
  startedAt: null,
  completedAt: null,
  steps: [],
  ...over,
})

const run = (startedAt: string, over: Partial<ApiRun> = {}) =>
  ({ status: 'in_progress', run_started_at: startedAt, created_at: startedAt, updated_at: startedAt, ...over }) as ApiRun

describe('summarizeJobs', () => {
  it('counts completed steps and finds the running one', () => {
    const jobs: ApiJob[] = [
      {
        id: 1,
        name: 'test',
        status: 'in_progress',
        conclusion: null,
        html_url: null,
        started_at: null,
        completed_at: null,
        steps: [
          { name: 'checkout', number: 1, status: 'completed', conclusion: 'success' },
          { name: 'install', number: 2, status: 'completed', conclusion: 'skipped' },
          { name: 'test', number: 3, status: 'in_progress', conclusion: null },
          { name: 'upload', number: 4, status: 'queued', conclusion: null },
        ],
      },
    ]
    expect(summarizeJobs(jobs)[0]).toMatchObject({ stepsDone: 2, stepsTotal: 4, currentStep: 'test' })
  })
})

describe('stepRatio', () => {
  it('averages per job so queued jobs without steps pull progress down', () => {
    const jobs = [job({ status: 'completed', stepsDone: 3, stepsTotal: 3 }), job({ status: 'queued' })]
    expect(stepRatio(jobs)).toBe(0.5)
  })

  it('is 0 with no jobs', () => {
    expect(stepRatio([])).toBe(0)
  })
})

describe('stepCeiling', () => {
  it('allows up to the end of the running step', () => {
    expect(stepCeiling([job({ stepsDone: 3, stepsTotal: 10 })])).toBeCloseTo(0.4)
  })

  it('does not constrain a running job whose steps are not reported yet', () => {
    expect(stepCeiling([job({})])).toBe(1)
  })

  it('caps jobs that have not started at 0', () => {
    expect(stepCeiling([job({ status: 'completed' }), job({ status: 'queued' })])).toBe(0.5)
  })
})

describe('computeProgress', () => {
  const start = '2026-01-01T00:00:00Z'
  const t = (sec: number) => Date.parse(start) + sec * 1000

  it('uses elapsed time against the estimate', () => {
    const p = computeProgress(run(start), [job({ stepsDone: 4, stepsTotal: 10 })], whole(200_000), t(100))
    expect(p.ratio).toBeCloseTo(0.5)
    expect(p.remainingMs).toBe(100_000)
    expect(p.overtime).toBe(false)
  })

  it('never falls behind the step ratio', () => {
    const p = computeProgress(run(start), [job({ stepsDone: 8, stepsTotal: 10 })], whole(200_000), t(20))
    expect(p.ratio).toBeCloseTo(0.8)
  })

  it('does not run ahead of the step that is still running', () => {
    // 3 of 10 steps done, the 4th is running: at most 40% even though time says 90%
    const p = computeProgress(run(start), [job({ stepsDone: 3, stepsTotal: 10 })], whole(100_000), t(90))
    expect(p.ratio).toBeCloseTo(0.4)
    // remaining follows the work left, not the clock
    expect(p.remainingMs).toBe(60_000)
    expect(p.overtime).toBe(false)
  })

  it('holds back for jobs that have not started', () => {
    const jobs = [job({ stepsDone: 1, stepsTotal: 2 }), job({ status: 'queued' })]
    const p = computeProgress(run(start), jobs, whole(100_000), t(90))
    expect(p.ratio).toBe(0.5)
  })

  it('stays at 0 before any job exists', () => {
    expect(computeProgress(run(start), [], whole(100_000), t(50)).ratio).toBe(0)
  })

  it('caps unfinished runs below 100% and flags overtime', () => {
    const p = computeProgress(run(start), [job({})], whole(60_000), t(120))
    expect(p.ratio).toBe(0.97)
    expect(p.overtime).toBe(true)
    expect(p.remainingMs).toBe(0)
  })

  it('falls back to steps without history', () => {
    const p = computeProgress(run(start), [job({ stepsDone: 1, stepsTotal: 4 })], null, t(30))
    expect(p.ratio).toBe(0.25)
    expect(p.remainingMs).toBeNull()
  })

  it('is complete once the run completes, measured to updated_at', () => {
    const p = computeProgress(
      run(start, { status: 'completed', updated_at: '2026-01-01T00:01:30Z' }),
      [job({ status: 'completed' })],
      null,
      t(9999),
    )
    expect(p.ratio).toBe(1)
    expect(p.elapsedMs).toBe(90_000)
  })
})

describe('formatDuration', () => {
  it.each([
    [5_000, '5s'],
    [125_000, '2m 05s'],
    [3_780_000, '1h 3m'],
  ])('%i → %s', (ms, out) => expect(formatDuration(ms)).toBe(out))
})

describe('progressSummary', () => {
  it('counts steps instead of a lone job', () => {
    expect(progressSummary([job({ stepsDone: 4, stepsTotal: 11, currentStep: 'Run npm ci' })])).toBe('Steps 4/11 · Run npm ci')
  })

  it('counts jobs and the running job steps when one of several runs', () => {
    const jobs = [
      job({ id: 1, status: 'completed', stepsDone: 5, stepsTotal: 5 }),
      job({ id: 2, stepsDone: 3, stepsTotal: 8, currentStep: 'Run tests' }),
      job({ id: 3, status: 'queued' }),
    ]
    expect(progressSummary(jobs)).toBe('Jobs 1/3 · Steps 3/8 · Run tests')
  })

  it('counts only jobs while several run at once', () => {
    const jobs = [
      job({ id: 1, stepsDone: 2, stepsTotal: 8, currentStep: 'Test (node 20)' }),
      job({ id: 2, stepsDone: 5, stepsTotal: 8, currentStep: 'Test (node 22)' }),
    ]
    expect(progressSummary(jobs)).toBe('Jobs 0/2 · Test (node 20)')
  })

  it('falls back to the job count before steps are reported', () => {
    expect(progressSummary([job({})])).toBe('Jobs 0/1')
  })
})

describe('timeLabel', () => {
  const p = (over: Partial<Progress>): Progress => ({
    ratio: 0.5,
    jobsDone: 0,
    jobsTotal: 1,
    elapsedMs: 40_000,
    estimateMs: 20_000,
    remainingMs: 5000,
    overtime: false,
    overdueMs: 0,
    ...over,
  })

  it('shows time left while there is some', () => {
    expect(timeLabel(p({}), false)).toBe('~5s left')
    // a slow step still has steps after it: not finishing yet
    expect(timeLabel(p({ overtime: true, overdueMs: 10_000 }), false)).toBe('~5s left')
  })

  it('says finishing up, without a number, once the estimate is used up', () => {
    expect(timeLabel(p({ remainingMs: 0, overtime: true, overdueMs: 3000 }), false)).toBe('Finishing up…')
    expect(timeLabel(p({ remainingMs: 300 }), false)).toBe('Finishing up…')
  })

  it('says slower than usual only when well past the usual duration', () => {
    expect(timeLabel(p({ remainingMs: 0, overtime: true, overdueMs: 30_001 }), false)).toBe('40s · slower than usual')
    expect(timeLabel(p({ remainingMs: 8000, overtime: true, overdueMs: 45_000 }), false)).toBe('40s · slower than usual')
  })

  it('shows elapsed time without history and while queued', () => {
    expect(timeLabel(p({ remainingMs: null, estimateMs: null }), false)).toBe('40s')
    expect(timeLabel(p({}), true)).toBe('queued 40s')
  })
})
