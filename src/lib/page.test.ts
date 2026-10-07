import { describe, expect, it } from 'vitest'
import { latestPerWorkflow, matchBranch, parsePage, runsForPage } from './page'
import type { TrackedRun } from './types'

describe('parsePage', () => {
  it('ignores addresses with malformed escapes instead of throwing', () => {
    expect(parsePage('https://github.com/o/r/tree/%zz')).toBeNull()
  })

  it.each([
    ['https://github.com/o/r', { kind: 'code', repo: 'o/r', ref: null, view: 'home' }],
    ['https://github.com/o/r/', { kind: 'code', repo: 'o/r', ref: null, view: 'home' }],
    ['https://github.com/o/r/tree/feat/x', { kind: 'code', repo: 'o/r', ref: 'feat/x', view: 'tree' }],
    ['https://github.com/o/r/blob/main/src/a.ts', { kind: 'code', repo: 'o/r', ref: 'main/src/a.ts', view: 'blob' }],
    ['https://github.com/o/r/pull/42', { kind: 'pr', repo: 'o/r', number: 42 }],
    ['https://github.com/o/r/pull/42/files?w=1', { kind: 'pr', repo: 'o/r', number: 42 }],
    ['https://github.com/o/r/actions', { kind: 'actions', repo: 'o/r' }],
    ['https://github.com/o/r/actions/workflows/ci.yml', { kind: 'actions', repo: 'o/r' }],
  ])('%s', (href, ctx) => expect(parsePage(href)).toEqual(ctx))

  it.each([
    'https://github.com/',
    'https://github.com/o',
    'https://github.com/settings/profile',
    'https://github.com/orgs/acme/repositories',
    'https://github.com/o/r/issues/1',
    'https://github.com/o/r/actions/runs/123',
    'https://github.com/o/r/pull/new',
    'https://gist.github.com/o/r',
    'not a url',
  ])('ignores %s', (href) => expect(parsePage(href)).toBeNull())
})

describe('matchBranch', () => {
  it('prefers the longest branch that prefixes the path', () => {
    expect(matchBranch('feat/x/src/a.ts', ['feat', 'feat/x', 'main'])).toBe('feat/x')
  })

  it('does not match a partial segment', () => {
    expect(matchBranch('feature/a', ['feat'])).toBeNull()
  })
})

let nextId = 1
const run = (over: Partial<TrackedRun>): TrackedRun =>
  ({
    id: nextId++,
    repo: 'o/r',
    workflowId: 1,
    workflowName: 'CI',
    title: 't',
    branch: 'main',
    headSha: 'abc',
    prNumbers: [],
    event: 'push',
    actor: null,
    htmlUrl: 'https://github.com/o/r/actions/runs/1',
    attempt: 1,
    status: 'in_progress',
    conclusion: null,
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    jobs: [],
    progress: { ratio: 0, jobsDone: 0, jobsTotal: 0, elapsedMs: 0, estimateMs: null, remainingMs: null, overtime: false, overdueMs: 0 },
    ...over,
  }) as TrackedRun

describe('runsForPage', () => {
  it('matches PR runs by PR number', () => {
    const mine = run({ prNumbers: [7], branch: 'feat' })
    const other = run({ prNumbers: [8], branch: 'feat2' })
    const res = runsForPage({ kind: 'pr', repo: 'o/r', number: 7 }, [mine, other], 'main')
    expect(res.primary).toEqual([mine])
  })

  it('shows the default branch on the repository home and counts other branches', () => {
    const onMain = run({ branch: 'main' })
    const onFeat = run({ branch: 'feat', workflowId: 2 })
    const res = runsForPage({ kind: 'code', repo: 'o/r', ref: null, view: 'home' }, [onMain, onFeat], 'main')
    expect(res.primary).toEqual([onMain])
    expect(res.othersActive).toBe(1)
  })

  it("shows a branch's home, including branch names with slashes", () => {
    const r = run({ branch: 'feat/x' })
    const res = runsForPage({ kind: 'code', repo: 'o/r', ref: 'feat/x', view: 'tree' }, [r], 'main')
    expect(res.primary).toEqual([r])
  })

  it('shows nothing in a folder, not even other branches', () => {
    const r = run({ branch: 'feat/x' })
    const other = run({ branch: 'main', workflowId: 2 })
    const res = runsForPage({ kind: 'code', repo: 'o/r', ref: 'feat/x/src', view: 'tree' }, [r, other], 'main')
    expect(res).toEqual({ primary: [], othersActive: 0 })
  })

  it('treats the default branch as known even without runs on it', () => {
    const elsewhere = run({ branch: 'feat/x' })
    const folder = runsForPage({ kind: 'code', repo: 'o/r', ref: 'main/docs', view: 'tree' }, [elsewhere], 'main')
    expect(folder.othersActive).toBe(0)
    const home = runsForPage({ kind: 'code', repo: 'o/r', ref: 'main', view: 'tree' }, [elsewhere], 'main')
    expect(home.othersActive).toBe(1)
  })

  it('shows nothing on a file page', () => {
    const r = run({ branch: 'main' })
    expect(runsForPage({ kind: 'code', repo: 'o/r', ref: 'main/README.md', view: 'blob' }, [r], 'main').primary).toEqual([])
  })

  it('stays out of the way when the path matches no known branch', () => {
    const res = runsForPage({ kind: 'code', repo: 'o/r', ref: 'unknown/path', view: 'tree' }, [run({ branch: 'main' })], 'main')
    expect(res).toEqual({ primary: [], othersActive: 0 })
  })

  it('ignores other repositories', () => {
    const res = runsForPage({ kind: 'actions', repo: 'o/r' }, [run({ repo: 'o/other' })], null)
    expect(res.primary).toEqual([])
  })

  it('tolerates runs stored before prNumbers existed', () => {
    const legacy = run({}) as Partial<TrackedRun>
    delete legacy.prNumbers
    expect(runsForPage({ kind: 'pr', repo: 'o/r', number: 1 }, [legacy as TrackedRun], null).primary).toEqual([])
  })
})

describe('latestPerWorkflow', () => {
  it('keeps the newest run of each workflow, active first', () => {
    const old = run({ status: 'completed', conclusion: 'failure', startedAt: '2026-01-01T00:00:00Z' })
    const fresh = run({ status: 'in_progress', startedAt: '2026-01-01T01:00:00Z' })
    const lint = run({ workflowId: 2, status: 'completed', conclusion: 'success', startedAt: '2026-01-01T02:00:00Z' })
    expect(latestPerWorkflow([old, lint, fresh])).toEqual([fresh, lint])
  })
})
