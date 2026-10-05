import { describe, expect, it } from 'vitest'
import { computeProgress, formatDuration, medianDuration, stepRatio, summarizeJobs } from './progress'
import type { ApiJob, ApiRun, JobSummary } from './types'

const job = (over: Partial<JobSummary>): JobSummary => ({
  id: 1,
  name: 'build',
  status: 'in_progress',
  conclusion: null,
  htmlUrl: null,
  stepsDone: 0,
  stepsTotal: 0,
  currentStep: null,
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

describe('computeProgress', () => {
  const start = '2026-01-01T00:00:00Z'
  const t = (sec: number) => Date.parse(start) + sec * 1000

  it('uses elapsed time against the estimate', () => {
    const p = computeProgress(run(start), [job({ stepsDone: 1, stepsTotal: 10 })], 200_000, t(100))
    expect(p.ratio).toBeCloseTo(0.5)
    expect(p.remainingMs).toBe(100_000)
    expect(p.overtime).toBe(false)
  })

  it('never falls behind the step ratio', () => {
    const p = computeProgress(run(start), [job({ stepsDone: 8, stepsTotal: 10 })], 200_000, t(20))
    expect(p.ratio).toBeCloseTo(0.8)
  })

  it('caps unfinished runs below 100% and flags overtime', () => {
    const p = computeProgress(run(start), [job({})], 60_000, t(120))
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

describe('medianDuration', () => {
  it('takes the median of run durations', () => {
    const runs = [60, 300, 90].map((sec) =>
      run('2026-01-01T00:00:00Z', { updated_at: new Date(Date.parse('2026-01-01T00:00:00Z') + sec * 1000).toISOString() }),
    )
    expect(medianDuration(runs)).toBe(90_000)
  })

  it('returns null without data', () => {
    expect(medianDuration([])).toBeNull()
  })
})

describe('formatDuration', () => {
  it.each([
    [5_000, '5s'],
    [125_000, '2m 05s'],
    [3_780_000, '1h 3m'],
  ])('%i → %s', (ms, out) => expect(formatDuration(ms)).toBe(out))
})
