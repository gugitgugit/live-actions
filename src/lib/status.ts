import { t } from './i18n'
import type { ApiConclusion, ApiRunStatus } from './types'

export const ACTIVE_STATUSES: ReadonlySet<ApiRunStatus> = new Set([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
])

export function isActive(status: ApiRunStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

export type Tone = 'running' | 'queued' | 'success' | 'failure' | 'neutral'

export const FAILED_CONCLUSIONS: ReadonlySet<ApiConclusion> = new Set(['failure', 'timed_out', 'startup_failure'])

export function toneOf(status: ApiRunStatus, conclusion: ApiConclusion): Tone {
  if (status === 'in_progress') return 'running'
  if (isActive(status)) return 'queued'
  if (conclusion === 'success') return 'success'
  if (FAILED_CONCLUSIONS.has(conclusion)) return 'failure'
  return 'neutral'
}

export function toneLabel(tone: Tone): string {
  return t(
    ({ running: 'toneRunning', queued: 'toneQueued', success: 'toneSuccess', failure: 'toneFailure', neutral: 'toneNeutral' } as const)[tone],
  )
}
