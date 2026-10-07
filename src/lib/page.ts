import { isActive } from './progress'
import type { TrackedRun } from './types'

/** Pages that get in-page progress. */
export type PageContext =
  | { kind: 'pr'; repo: string; number: number }
  /**
   * Repository home (`ref` null = default branch), /tree/<branch>[/<path>] or /blob/<branch>/<path>.
   * `view` tells a file apart; a /tree/ path is a branch's home or a folder, see runsForPage.
   */
  | { kind: 'code'; repo: string; ref: string | null; view: 'home' | 'tree' | 'blob' }
  | { kind: 'actions'; repo: string }

// First path segments that are GitHub features, not owners.
const RESERVED_OWNERS = new Set([
  'about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'copilot', 'customer-stories',
  'dashboard', 'enterprise', 'events', 'explore', 'features', 'gist', 'github-copilot', 'issues',
  'login', 'logout', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing',
  'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup', 'site', 'sponsors',
  'stars', 'team', 'topics', 'trending', 'users',
])

const NAME = /^[A-Za-z0-9_.-]+$/

export function parsePage(href: string): PageContext | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.hostname !== 'github.com') return null
  let parts: string[]
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    // a malformed escape such as "%zz" typed into the address bar: not a page we know
    return null
  }
  const [owner, name, section, ...rest] = parts
  if (!owner || !name || RESERVED_OWNERS.has(owner.toLowerCase()) || !NAME.test(owner) || !NAME.test(name)) {
    return null
  }
  const repo = `${owner}/${name}`

  if (section === undefined) return { kind: 'code', repo, ref: null, view: 'home' }
  if ((section === 'tree' || section === 'blob') && rest.length > 0) {
    return { kind: 'code', repo, ref: rest.join('/'), view: section }
  }
  if (section === 'pull' && /^\d+$/.test(rest[0] ?? '')) return { kind: 'pr', repo, number: Number(rest[0]) }
  // the run list (optionally filtered by workflow), not a single run's page
  if (section === 'actions' && (rest.length === 0 || rest[0] === 'workflows')) return { kind: 'actions', repo }
  return null
}

/**
 * The branch a /tree/ or /blob/ path refers to. Branch names may contain slashes, so
 * "feat/x/src/index.ts" is ambiguous on its own; pick the longest known branch that
 * prefixes the path.
 */
export function matchBranch(refPath: string, branches: Iterable<string>): string | null {
  let best: string | null = null
  for (const b of branches) {
    if ((refPath === b || refPath.startsWith(`${b}/`)) && (best === null || b.length > best.length)) best = b
  }
  return best
}

export interface PageRuns {
  /** runs that belong to what the page shows */
  primary: TrackedRun[]
  /** active runs in the same repository that belong elsewhere (other branches) */
  othersActive: number
}

export function runsForPage(
  ctx: PageContext,
  runs: TrackedRun[],
  defaultBranch: string | null,
): PageRuns {
  const inRepo = runs.filter((r) => r.repo === ctx.repo)

  if (ctx.kind === 'actions') return { primary: sortRuns(inRepo), othersActive: 0 }

  if (ctx.kind === 'pr') {
    const primary = inRepo.filter((r) => (r.prNumbers ?? []).includes(ctx.number))
    return { primary: latestPerWorkflow(primary), othersActive: 0 }
  }

  // Only the repository home and a branch's home (/tree/<branch>) get the banner: on folder
  // and file pages nobody is waiting for CI, and the commit status icon there is kept live anyway.
  const none: PageRuns = { primary: [], othersActive: 0 }
  if (ctx.view === 'blob') return none
  const branches = new Set(inRepo.map((r) => r.branch).filter((b): b is string => !!b))
  if (defaultBranch) branches.add(defaultBranch)
  const branch = ctx.ref === null ? defaultBranch : matchBranch(ctx.ref, branches)
  // a longer path is a folder; an unknown branch could be either, so stay out of the way
  if (ctx.ref !== null && branch !== ctx.ref) return none
  const primary = branch === null ? [] : inRepo.filter((r) => r.branch === branch)
  const othersActive = inRepo.filter((r) => isActive(r.status) && !primary.includes(r)).length
  return { primary: latestPerWorkflow(primary), othersActive }
}

/**
 * Newest run per workflow: a PR or branch accumulates runs from earlier pushes, and an
 * old result next to a new one would only confuse.
 */
export function latestPerWorkflow(runs: TrackedRun[]): TrackedRun[] {
  const latest = new Map<number, TrackedRun>()
  for (const r of runs) {
    const cur = latest.get(r.workflowId)
    if (!cur || Date.parse(r.startedAt) > Date.parse(cur.startedAt)) latest.set(r.workflowId, r)
  }
  return sortRuns([...latest.values()])
}

/** Active first, then most recent. */
function sortRuns(runs: TrackedRun[]): TrackedRun[] {
  return [...runs].sort(
    (a, b) => Number(isActive(b.status)) - Number(isActive(a.status)) || Date.parse(b.startedAt) - Date.parse(a.startedAt),
  )
}
