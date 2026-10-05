import type { ApiConclusion, ApiRunStatus } from '../lib/types'
import { isActive } from '../lib/progress'

export type Tone = 'running' | 'queued' | 'success' | 'failure' | 'neutral'

export function toneOf(status: ApiRunStatus, conclusion: ApiConclusion): Tone {
  if (status === 'in_progress') return 'running'
  if (isActive(status)) return 'queued'
  if (conclusion === 'success') return 'success'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'failure'
  return 'neutral'
}

const LABEL: Record<Tone, string> = {
  running: 'In progress',
  queued: 'Queued',
  success: 'Succeeded',
  failure: 'Failed',
  neutral: 'Cancelled or skipped',
}

export function StatusIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', className: `icon icon-${tone}`, role: 'img' as const }
  return (
    <svg {...common} aria-label={LABEL[tone]}>
      <title>{LABEL[tone]}</title>
      {tone === 'running' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <path className="spin" d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {tone === 'queued' && (
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.6 2.2" />
      )}
      {tone === 'success' && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="var(--on-accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {tone === 'failure' && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--on-accent)" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
      {tone === 'neutral' && (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 12L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
