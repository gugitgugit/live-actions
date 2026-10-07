import { describe, expect, it } from 'vitest'
import { HttpCache } from './github'
import { slimJob, slimRepo, slimRun, slimRunList } from './slim'
import type { ApiJob, ApiRepo, ApiRun } from './types'

const run = {
  id: 1,
  name: 'CI',
  display_title: 'fix: something',
  workflow_id: 7,
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.com/o/r/actions/runs/1',
  run_attempt: 1,
  run_started_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:20Z',
  actor: { login: 'me', id: 1, avatar_url: 'x' },
  triggering_actor: { login: 'me', id: 1 },
  pull_requests: [{ number: 3, url: 'x', head: {}, base: {} }],
  // what makes GitHub's responses large
  repository: { full_name: 'o/r', owner: { login: 'o' }, description: 'x'.repeat(1000) },
  head_repository: { full_name: 'o/r' },
  head_commit: { message: 'x'.repeat(1000) },
} as unknown as ApiRun

describe('slimRun', () => {
  it('keeps the fields the extension reads and drops the rest', () => {
    const slim = slimRun(run) as unknown as Record<string, unknown>
    expect(slim).toEqual({
      id: 1,
      name: 'CI',
      display_title: 'fix: something',
      workflow_id: 7,
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/o/r/actions/runs/1',
      run_attempt: 1,
      run_started_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:20Z',
      actor: { login: 'me' },
      triggering_actor: { login: 'me' },
      pull_requests: [{ number: 3 }],
    })
    expect(JSON.stringify(slimRunList({ workflow_runs: [run] })).length).toBeLessThan(JSON.stringify(run).length / 5)
  })

  it('keeps nulls GitHub sends', () => {
    const slim = slimRun({ ...run, conclusion: null, head_branch: null, actor: null })
    expect(slim.conclusion).toBeNull()
    expect(slim.head_branch).toBeNull()
    expect(slim.actor).toBeNull()
  })
})

describe('slimJob and slimRepo', () => {
  it('keep job and step timing, repository basics', () => {
    const job = {
      id: 2, name: 'build', status: 'completed', conclusion: 'success', html_url: null,
      started_at: 'a', completed_at: 'b', runner_name: 'x', labels: ['ubuntu-latest'],
      steps: [{ name: 's', number: 1, status: 'completed', conclusion: 'success', started_at: 'a', completed_at: 'b', extra: 1 }],
    } as unknown as ApiJob
    expect(slimJob(job)).toEqual({
      id: 2, name: 'build', status: 'completed', conclusion: 'success', html_url: null, started_at: 'a', completed_at: 'b',
      steps: [{ name: 's', number: 1, status: 'completed', conclusion: 'success', started_at: 'a', completed_at: 'b' }],
    })
    const repo = { id: 1, name: 'r', full_name: 'o/r', private: false, owner: { login: 'o', id: 9 }, default_branch: 'main', description: 'x' } as unknown as ApiRepo
    expect(slimRepo(repo)).toEqual({ id: 1, name: 'r', full_name: 'o/r', private: false, owner: { login: 'o' }, default_branch: 'main' })
  })
})

describe('HttpCache.snapshot', () => {
  it('keeps the newest entries within the size limit', () => {
    const cache = new HttpCache({
      old: { etag: '1', body: 'x'.repeat(600), storedAt: 1 },
      mid: { etag: '2', body: 'x'.repeat(600), storedAt: 2 },
      new: { etag: '3', body: 'x'.repeat(600), storedAt: 3 },
    })
    expect(Object.keys(cache.snapshot(150, 1500))).toEqual(['new', 'mid'])
  })

  it('keeps at most `max` entries', () => {
    const cache = new HttpCache({ a: { etag: '1', body: 1, storedAt: 1 }, b: { etag: '2', body: 2, storedAt: 2 } })
    expect(Object.keys(cache.snapshot(1))).toEqual(['b'])
  })
})
