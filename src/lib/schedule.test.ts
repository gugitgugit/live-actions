import { describe, expect, it } from 'vitest'
import { FINISHING_POLL_MS, WATCHING_POLL_MS, isFinishing, nextPollDelay } from './schedule'
import type { JobSummary, TrackedRun } from './types'

const start = '2026-01-01T00:00:00Z'
const at = (sec: number) => Date.parse(start) + sec * 1000

const job = (over: Partial<JobSummary>): JobSummary => ({
  id: 1,
  name: 'build',
  status: 'in_progress',
  conclusion: null,
  htmlUrl: null,
  stepsDone: 5,
  stepsTotal: 10,
  currentStep: 'Run tests',
  ...over,
})

const run = (over: Partial<TrackedRun> & { estimateMs?: number | null }): TrackedRun => {
  const { estimateMs = null, ...rest } = over
  return {
    id: 1,
    repo: 'o/r',
    workflowId: 1,
    workflowName: 'CI',
    title: 't',
    branch: 'main',
    headSha: 'x',
    prNumbers: [],
    event: 'push',
    actor: null,
    htmlUrl: '',
    attempt: 1,
    status: 'in_progress',
    conclusion: null,
    startedAt: start,
    updatedAt: start,
    jobs: [job({ stepsDone: 9, stepsTotal: 10 })],
    progress: { ratio: 0, jobsDone: 0, jobsTotal: 1, elapsedMs: 0, estimateMs, remainingMs: null, overtime: false },
    ...rest,
  }
}

describe('isFinishing', () => {
  it('is true in the last 30 seconds of the usual duration', () => {
    expect(isFinishing(run({ estimateMs: 300_000 }), at(275))).toBe(true)
    expect(isFinishing(run({ estimateMs: 300_000 }), at(200))).toBe(false)
  })

  it('waits when the steps are behind the clock', () => {
    // time says nearly done, but only 3 of 10 steps finished
    const behind = run({ estimateMs: 300_000, jobs: [job({ stepsDone: 3, stepsTotal: 10 })] })
    expect(isFinishing(behind, at(290))).toBe(false)
  })

  it('is true while every unfinished job is cleaning up, even without history', () => {
    const wrapUp = run({ jobs: [job({ currentStep: 'Post Run actions/checkout@v7' }), job({ status: 'completed', currentStep: null })] })
    expect(isFinishing(wrapUp, at(10))).toBe(true)
    expect(isFinishing(run({ jobs: [job({ currentStep: 'Complete job' })] }), at(10))).toBe(true)
  })

  it('is false while another job has not started', () => {
    const waiting = run({ jobs: [job({ currentStep: 'Complete job' }), job({ status: 'queued', currentStep: null, stepsTotal: 0 })] })
    expect(isFinishing(waiting, at(10))).toBe(false)
  })

  it('stops counting a run that is far past its usual duration', () => {
    expect(isFinishing(run({ estimateMs: 60_000 }), at(120))).toBe(true)
    expect(isFinishing(run({ estimateMs: 60_000 }), at(600))).toBe(false)
  })

  it('ignores queued and completed runs', () => {
    expect(isFinishing(run({ status: 'queued', estimateMs: 30_000 }), at(25))).toBe(false)
    expect(isFinishing(run({ status: 'completed', estimateMs: 30_000 }), at(25))).toBe(false)
  })
})

describe('nextPollDelay', () => {
  const far = run({ estimateMs: 600_000 })
  const near = run({ estimateMs: 300_000 })

  it('polls fast when a run is about to finish, watched or not', () => {
    expect(nextPollDelay([far, near], false, at(280))).toBe(FINISHING_POLL_MS)
  })

  it('polls every 10 seconds while someone is watching', () => {
    expect(nextPollDelay([far], true, at(60))).toBe(WATCHING_POLL_MS)
  })

  it('leaves it to the alarm otherwise', () => {
    expect(nextPollDelay([far], false, at(60))).toBeNull()
    expect(nextPollDelay([], false)).toBeNull()
  })
})
