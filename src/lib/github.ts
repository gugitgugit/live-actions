import type { CacheEntry } from './storage'
import type { ApiJob, ApiRepo, ApiRun, RateLimit } from './types'

const API = 'https://api.github.com'

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * ETag cache. Conditional requests answered with 304 do not count against the
 * rate limit, which is what makes frequent polling affordable.
 */
export class HttpCache {
  private dirty = false
  constructor(private entries: Record<string, CacheEntry> = {}) {}

  get(url: string): CacheEntry | undefined {
    return this.entries[url]
  }

  set(url: string, etag: string, body: unknown) {
    this.entries[url] = { etag, body, storedAt: Date.now() }
    this.dirty = true
  }

  get isDirty() {
    return this.dirty
  }

  /** keep the most recently stored entries only */
  snapshot(max = 150): Record<string, CacheEntry> {
    const sorted = Object.entries(this.entries).sort((a, b) => b[1].storedAt - a[1].storedAt)
    this.entries = Object.fromEntries(sorted.slice(0, max))
    this.dirty = false
    return this.entries
  }
}

export interface ClientOptions {
  getToken: () => Promise<string>
  cache?: HttpCache
}

export class GitHubClient {
  rateLimit: RateLimit | null = null

  constructor(private opts: ClientOptions) {}

  async request<T>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${API}${path}`
    const token = await this.opts.getToken()
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const cached = this.opts.cache?.get(url)
    if (cached) headers['If-None-Match'] = cached.etag

    const res = await fetch(url, { headers, cache: 'no-store' })
    this.readRateLimit(res)

    if (res.status === 304 && cached) return cached.body as T
    if (!res.ok) {
      let message = res.statusText
      try {
        message = ((await res.json()) as { message?: string }).message ?? message
      } catch {
        // body was not JSON
      }
      throw new GitHubError(res.status, message)
    }
    const body = (await res.json()) as T
    const etag = res.headers.get('ETag')
    if (etag && this.opts.cache) this.opts.cache.set(url, etag, body)
    return body
  }

  private readRateLimit(res: Response) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const limit = res.headers.get('x-ratelimit-limit')
    const reset = res.headers.get('x-ratelimit-reset')
    if (remaining && limit && reset) {
      this.rateLimit = { remaining: +remaining, limit: +limit, resetAt: +reset * 1000 }
    }
  }

  // ---- endpoints ----

  getViewer() {
    return this.request<{ login: string }>('/user')
  }

  getRepo(fullName: string) {
    return this.request<ApiRepo>(`/repos/${fullName}`)
  }

  async listRuns(fullName: string): Promise<ApiRun[]> {
    const data = await this.request<{ workflow_runs: ApiRun[] }>(
      `/repos/${fullName}/actions/runs?per_page=20`,
    )
    return data.workflow_runs
  }

  getRun(fullName: string, runId: number) {
    return this.request<ApiRun>(`/repos/${fullName}/actions/runs/${runId}`)
  }

  async listJobs(fullName: string, runId: number): Promise<ApiJob[]> {
    const data = await this.request<{ jobs: ApiJob[] }>(
      `/repos/${fullName}/actions/runs/${runId}/jobs?per_page=100`,
    )
    return data.jobs
  }

  async listRecentSuccessfulRuns(fullName: string, workflowId: number): Promise<ApiRun[]> {
    const data = await this.request<{ workflow_runs: ApiRun[] }>(
      `/repos/${fullName}/actions/workflows/${workflowId}/runs?status=success&per_page=5`,
    )
    return data.workflow_runs
  }

  /** Repositories the GitHub App can see for this user (intersection of installs and user access). */
  async listAppRepos(): Promise<ApiRepo[]> {
    const { installations } = await this.request<{ installations: { id: number }[] }>(
      '/user/installations?per_page=100',
    )
    const repos: ApiRepo[] = []
    for (const inst of installations) {
      for (let page = 1; page <= 5; page++) {
        const data = await this.request<{ repositories: ApiRepo[]; total_count: number }>(
          `/user/installations/${inst.id}/repositories?per_page=100&page=${page}`,
        )
        repos.push(...data.repositories)
        if (repos.length >= data.total_count || data.repositories.length < 100) break
      }
    }
    return repos
  }

  /** Repositories a personal access token can see, most recently pushed first. */
  listUserRepos() {
    return this.request<ApiRepo[]>('/user/repos?per_page=100&sort=pushed')
  }
}
