import type { ApiJob, ApiRepo, ApiRun, ApiStep } from './types'

// Responses are cut down to the fields in lib/types.ts before they go into the ETag cache in
// chrome.storage: every run embeds its repository and head commit, about 20x what is read.
// A field the code starts reading must be added here too, or it will be missing.

const pick = <T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> => {
  const out = {} as Pick<T, K>
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

const RUN_KEYS = [
  'id', 'name', 'display_title', 'workflow_id', 'head_branch', 'head_sha', 'event', 'status', 'conclusion',
  'html_url', 'run_attempt', 'run_started_at', 'created_at', 'updated_at',
] as const satisfies readonly (keyof ApiRun)[]

const login = (user: { login: string } | null | undefined) => (user ? { login: user.login } : user)

export function slimRun(run: ApiRun): ApiRun {
  return {
    ...pick(run, RUN_KEYS),
    actor: login(run.actor),
    triggering_actor: login(run.triggering_actor),
    pull_requests: run.pull_requests?.map((pr) => ({ number: pr.number })),
  } as ApiRun
}

const STEP_KEYS = ['name', 'number', 'status', 'conclusion', 'started_at', 'completed_at'] as const satisfies readonly (keyof ApiStep)[]
const JOB_KEYS = ['id', 'name', 'status', 'conclusion', 'html_url', 'started_at', 'completed_at'] as const satisfies readonly (keyof ApiJob)[]

export function slimJob(job: ApiJob): ApiJob {
  return { ...pick(job, JOB_KEYS), steps: job.steps?.map((s) => pick(s, STEP_KEYS)) } as ApiJob
}

const REPO_KEYS = ['id', 'name', 'full_name', 'private', 'pushed_at', 'default_branch'] as const satisfies readonly (keyof ApiRepo)[]

export function slimRepo(repo: ApiRepo): ApiRepo {
  return { ...pick(repo, REPO_KEYS), owner: { login: repo.owner.login } } as ApiRepo
}

export const slimRunList = (data: { workflow_runs: ApiRun[] }) => ({ workflow_runs: data.workflow_runs.map(slimRun) })
export const slimJobList = (data: { jobs: ApiJob[] }) => ({ jobs: data.jobs.map(slimJob) })
