import type { ErrorInfo } from './errors'

// ---- GitHub REST API (only the fields we use) ----

export type ApiRunStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'waiting'
  | 'requested'
  | 'pending'

export type ApiConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'stale'
  | 'startup_failure'
  | null

export interface ApiRun {
  id: number
  name: string | null
  display_title: string
  workflow_id: number
  head_branch: string | null
  head_sha: string
  event: string
  status: ApiRunStatus
  conclusion: ApiConclusion
  html_url: string
  run_attempt?: number
  run_started_at?: string
  created_at: string
  updated_at: string
  actor?: { login: string } | null
  triggering_actor?: { login: string } | null
  /** open PRs in this repo whose head matches the run (empty for PRs from forks) */
  pull_requests?: { number: number }[]
}

export interface ApiStep {
  name: string
  number: number
  status: 'queued' | 'in_progress' | 'completed' | 'pending' | 'waiting'
  conclusion: ApiConclusion
  started_at?: string | null
  completed_at?: string | null
}

export interface ApiJob {
  id: number
  name: string
  status: ApiRunStatus
  conclusion: ApiConclusion
  html_url: string | null
  started_at: string | null
  completed_at: string | null
  steps?: ApiStep[]
}

export interface ApiRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: { login: string }
  pushed_at?: string | null
  default_branch?: string
}

// ---- Extension state ----

export type AuthKind = 'app' | 'pat'

export interface AuthState {
  kind: AuthKind
  accessToken: string
  login?: string
  /** epoch ms; absent when the token does not expire */
  expiresAt?: number
  refreshToken?: string
  refreshTokenExpiresAt?: number
}

export interface WatchedRepo {
  /** "owner/name" */
  fullName: string
  private: boolean
}

export type NotifyMode = 'all' | 'failure' | 'none'

export interface Settings {
  repos: WatchedRepo[]
  notify: NotifyMode
  /** popup, badge and notifications only count runs triggered by the signed-in user */
  onlyMine: boolean
  /** show progress inside GitHub pages */
  inPage: boolean
}

export interface JobSummary {
  id: number
  name: string
  status: ApiRunStatus
  conclusion: ApiConclusion
  htmlUrl: string | null
  stepsDone: number
  stepsTotal: number
  currentStep: string | null
}

export interface Progress {
  /** 0..1 */
  ratio: number
  jobsDone: number
  jobsTotal: number
  elapsedMs: number
  /** typical duration of this workflow, from recent successful runs */
  estimateMs: number | null
  remainingMs: number | null
  overtime: boolean
}

export interface TrackedRun {
  id: number
  repo: string
  workflowId: number
  workflowName: string
  title: string
  branch: string | null
  headSha: string
  prNumbers: number[]
  event: string
  actor: string | null
  htmlUrl: string
  attempt: number
  status: ApiRunStatus
  conclusion: ApiConclusion
  startedAt: string
  updatedAt: string
  jobs: JobSummary[]
  progress: Progress
  /** epoch ms when we first saw it as completed */
  completedAt?: number
}

export interface CommitInfo {
  /** combined state of all Actions runs for the commit (see lib/commit.ts) */
  actions: 'pending' | 'success' | 'failure' | null
  fetchedAt: number
}

export interface RepoInfo {
  defaultBranch: string | null
  fetchedAt: number
}

export interface DurationStat {
  medianMs: number | null
  fetchedAt: number
}

export interface RateLimit {
  remaining: number
  limit: number
  /** epoch ms */
  resetAt: number
}

export interface Meta {
  lastPolledAt: number | null
  /** plain strings come from versions before errors were stored as codes */
  lastError: ErrorInfo | string | null
  repoErrors: Record<string, ErrorInfo | string>
  rateLimit: RateLimit | null
  unseenFailures: number
}
