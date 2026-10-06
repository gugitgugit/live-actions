import { isActive } from './progress'
import type { ApiConclusion, ApiRunStatus } from './types'

export type Tone = 'running' | 'queued' | 'success' | 'failure' | 'neutral'

export const FAILED_CONCLUSIONS: ReadonlySet<ApiConclusion> = new Set(['failure', 'timed_out', 'startup_failure'])

export function toneOf(status: ApiRunStatus, conclusion: ApiConclusion): Tone {
  if (status === 'in_progress') return 'running'
  if (isActive(status)) return 'queued'
  if (conclusion === 'success') return 'success'
  if (FAILED_CONCLUSIONS.has(conclusion)) return 'failure'
  return 'neutral'
}

export const TONE_LABEL: Record<Tone, string> = {
  running: 'In progress',
  queued: 'Queued',
  success: 'Succeeded',
  failure: 'Failed',
  neutral: 'Cancelled or skipped',
}
