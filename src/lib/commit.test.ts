import { describe, expect, it } from 'vitest'
import { badgeFromOcticon, COMMIT_STATE_MAX_AGE_MS, freshActions, latestPerWorkflowEvent, predictBadge, rollup } from './commit'
import type { ApiRun } from './types'

const run = (over: Partial<ApiRun>): ApiRun =>
  ({
    id: 1,
    workflow_id: 1,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as ApiRun

describe('rollup', () => {
  it('is pending while anything runs', () => {
    expect(rollup([run({}), run({ status: 'in_progress', conclusion: null })])).toBe('pending')
  })

  it('fails as soon as one run failed, even with others still running', () => {
    expect(rollup([run({ conclusion: 'failure' }), run({ status: 'queued', conclusion: null })])).toBe('failure')
  })

  it('passes when every run passed or was skipped', () => {
    expect(rollup([run({}), run({ conclusion: 'skipped' })])).toBe('success')
  })

  it('has no opinion on cancelled runs or no runs', () => {
    expect(rollup([run({ conclusion: 'cancelled' })])).toBeNull()
    expect(rollup([])).toBeNull()
  })
})

describe('latestPerWorkflowEvent', () => {
  it('keeps the newest run per workflow and event', () => {
    const old = run({ id: 1, conclusion: 'failure', created_at: '2026-01-01T00:00:00Z' })
    const fresh = run({ id: 2, created_at: '2026-01-01T01:00:00Z' })
    const pr = run({ id: 3, event: 'pull_request' })
    expect(latestPerWorkflowEvent([old, fresh, pr]).map((r) => r.id)).toEqual([2, 3])
  })
})

describe('badgeFromOcticon', () => {
  it.each([
    ['octicon octicon-check', 'success'],
    ['octicon octicon-x', 'failure'],
    ['octicon octicon-dot-fill', 'pending'],
    ['octicon octicon-x-circle', null],
  ])('%s → %s', (cls, state) => expect(badgeFromOcticon(cls)).toBe(state))
})

describe('predictBadge', () => {
  it('leaves the badge alone until Actions changes', () => {
    expect(predictBadge('success', 'success', 'success')).toBeNull()
  })

  it('shows a re-run as pending, then its result', () => {
    expect(predictBadge('failure', 'failure', 'pending')).toBe('pending')
    expect(predictBadge('failure', 'failure', 'success')).toBe('success')
  })

  it('shows a run that finished after the page loaded', () => {
    expect(predictBadge('pending', 'pending', 'success')).toBe('success')
    expect(predictBadge('pending', 'pending', 'failure')).toBe('failure')
  })

  it('keeps red when another check had already failed', () => {
    // loaded red although Actions was passing: something else failed
    expect(predictBadge('failure', 'success', 'pending')).toBeNull()
    expect(predictBadge('failure', 'pending', 'success')).toBeNull()
  })

  it('keeps yellow when another check was still pending', () => {
    // loaded yellow although Actions had passed: something else is pending
    expect(predictBadge('pending', 'success', 'failure')).toBe('failure')
    expect(predictBadge('pending', 'success', 'pending')).toBeNull()
  })

  it('does nothing without Actions data', () => {
    expect(predictBadge('success', 'success', null)).toBeNull()
  })
})

describe('freshActions', () => {
  const now = Date.parse('2026-01-01T00:10:00Z')
  it('passes recent state through', () => {
    expect(freshActions({ actions: 'success', fetchedAt: now - 10_000 }, now)).toBe('success')
    expect(freshActions({ actions: null, fetchedAt: now - 10_000 }, now)).toBeNull()
  })

  it('drops state that polling has stopped refreshing', () => {
    expect(freshActions({ actions: 'pending', fetchedAt: now - COMMIT_STATE_MAX_AGE_MS - 1 }, now)).toBeUndefined()
    expect(freshActions(undefined, now)).toBeUndefined()
  })
})
