import { useEffect, useMemo, useState } from 'react'
import { isCounted } from '../lib/filters'
import { POPUP_PORT, send } from '../lib/messages'
import { computeProgress, formatDuration, isActive } from '../lib/progress'
import type { TrackedRun } from '../lib/types'
import { StatusIcon, toneOf } from '../shared/StatusIcon'
import { timeAgo, useNow, useStorage } from '../shared/useStorage'

export function App() {
  const auth = useStorage('auth')
  const settings = useStorage('settings')
  const runs = useStorage('runs')
  const meta = useStorage('meta')
  const now = useNow()
  const [refreshing, setRefreshing] = useState(false)

  // An open port tells the background to poll faster and to clear the failure badge.
  useEffect(() => {
    const port = chrome.runtime.connect({ name: POPUP_PORT })
    return () => port.disconnect()
  }, [])

  const { active, recent } = useMemo(() => {
    // repositories that are only open in a tab are tracked for the page, not listed here
    const all = settings ? Object.values(runs ?? {}).filter((r) => isCounted(r, settings, auth?.login)) : []
    return {
      active: all
        .filter((r) => isActive(r.status))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
      recent: all
        .filter((r) => !isActive(r.status))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    }
  }, [runs, settings, auth])

  if (auth === undefined || settings === undefined || meta === undefined) return <div className="popup" />

  const repoErrors = Object.fromEntries(
    Object.entries(meta.repoErrors).filter(([repo]) => settings.repos.some((r) => r.fullName === repo)),
  )

  const refresh = async () => {
    setRefreshing(true)
    try {
      await send({ type: 'poll' })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="popup">
      <header className="header">
        <Logo />
        <h1>Actions Pulse</h1>
        <span className="spacer" />
        {auth && settings.repos.length > 0 && (
          <button className="btn-icon" onClick={refresh} disabled={refreshing} title="Refresh now" aria-label="Refresh now">
            <svg width="16" height="16" viewBox="0 0 16 16" className={refreshing ? 'spinning' : undefined}>
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button className="btn-icon" onClick={() => chrome.runtime.openOptionsPage()} title="Settings" aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {!auth ? (
        <EmptyState
          title="Connect your GitHub account"
          body="Sign in to see live progress of your GitHub Actions workflows."
          action="Sign in with GitHub"
          error={meta.lastError}
        />
      ) : settings.repos.length === 0 ? (
        <EmptyState
          title="Pick repositories to watch"
          body="Choose which repositories' workflow runs should show up here."
          action="Choose repositories"
        />
      ) : (
        <main>
          <section>
            <h2>
              Running <span className="count">{active.length}</span>
            </h2>
            {active.length === 0 ? (
              <p className="quiet">
                Nothing running across {settings.repos.length}{' '}
                {settings.repos.length === 1 ? 'repository' : 'repositories'}.
              </p>
            ) : (
              <ul className="runs">
                {active.map((run) => (
                  <ActiveRun key={`${run.repo}#${run.id}`} run={run} now={now} />
                ))}
              </ul>
            )}
          </section>

          {recent.length > 0 && (
            <section>
              <h2>Recently finished</h2>
              <ul className="recent">
                {recent.map((run) => (
                  <RecentRun key={`${run.repo}#${run.id}`} run={run} now={now} />
                ))}
              </ul>
            </section>
          )}
        </main>
      )}

      {auth && settings.repos.length > 0 && (
        <footer className="footer">
          {meta.lastError ? (
            <span className="error">{meta.lastError}</span>
          ) : Object.keys(repoErrors).length > 0 ? (
            <span className="error" title={Object.entries(repoErrors).map(([r, e]) => `${r}: ${e}`).join('\n')}>
              {Object.keys(repoErrors).length === 1
                ? `${Object.keys(repoErrors)[0]} could not be loaded`
                : `${Object.keys(repoErrors).length} repositories could not be loaded`}
            </span>
          ) : (
            <span>{meta.lastPolledAt ? `Updated ${timeAgo(meta.lastPolledAt, now)}` : 'Loading…'}</span>
          )}
          {meta.rateLimit && meta.rateLimit.remaining < meta.rateLimit.limit * 0.2 && (
            <span title="GitHub API requests left this hour">
              API {meta.rateLimit.remaining}/{meta.rateLimit.limit}
            </span>
          )}
        </footer>
      )}
    </div>
  )
}

function ActiveRun({ run, now }: { run: TrackedRun; now: number }) {
  const [open, setOpen] = useState(false)
  // Recompute locally so the bar and timers move smoothly between polls.
  const p = computeProgress(
    { status: run.status, run_started_at: run.startedAt, created_at: run.startedAt, updated_at: run.updatedAt },
    run.jobs,
    run.progress.estimateMs,
    now,
  )
  const tone = toneOf(run.status, run.conclusion)
  const running = run.jobs.find((j) => j.status === 'in_progress')
  const failing = run.jobs.some((j) => j.conclusion === 'failure')
  const pct = Math.round(p.ratio * 100)

  return (
    <li className="run">
      <a className="run-main" href={run.htmlUrl} target="_blank" rel="noreferrer">
        <div className="run-top">
          <StatusIcon tone={tone} />
          <span className="run-workflow">{run.workflowName}</span>
          <span className="run-repo">{run.repo}</span>
        </div>
        <div className="run-title" title={run.title}>
          {run.title}
        </div>
        <div
          className={`bar${failing ? ' bar-failing' : ''}${tone === 'queued' ? ' bar-queued' : ''}`}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${run.workflowName} progress`}
        >
          <div className="bar-fill" style={{ width: `${Math.max(pct, tone === 'queued' ? 0 : 3)}%` }} />
        </div>
        <div className="run-stats">
          <span className="run-step">
            {tone === 'queued'
              ? 'Waiting for a runner…'
              : `Jobs ${p.jobsDone}/${p.jobsTotal}${running?.currentStep ? ` · ${running.currentStep}` : ''}`}
          </span>
          <span className="run-time">
            {tone === 'queued'
              ? `queued ${formatDuration(p.elapsedMs)}`
              : p.remainingMs !== null && !p.overtime
              ? `~${formatDuration(p.remainingMs)} left`
              : p.overtime
                ? `${formatDuration(p.elapsedMs)} · slower than usual`
                : formatDuration(p.elapsedMs)}
          </span>
        </div>
      </a>
      {run.jobs.length > 0 && (
        <>
          <button className="jobs-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide jobs' : `Show ${run.jobs.length} ${run.jobs.length === 1 ? 'job' : 'jobs'}`}
          </button>
          {open && (
            <ul className="jobs">
              {run.jobs.map((job) => (
                <li key={job.id}>
                  <StatusIcon tone={toneOf(job.status, job.conclusion)} size={14} />
                  {job.htmlUrl ? (
                    <a href={job.htmlUrl} target="_blank" rel="noreferrer" className="job-name">
                      {job.name}
                    </a>
                  ) : (
                    <span className="job-name">{job.name}</span>
                  )}
                  {job.stepsTotal > 0 && (
                    <span className="muted job-steps">
                      {job.stepsDone}/{job.stepsTotal}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

function RecentRun({ run, now }: { run: TrackedRun; now: number }) {
  return (
    <li>
      <a className="recent-row" href={run.htmlUrl} target="_blank" rel="noreferrer">
        <StatusIcon tone={toneOf(run.status, run.conclusion)} />
        <span className="recent-text">
          <span className="recent-workflow">{run.workflowName}</span>
          <span className="muted"> · {run.repo}</span>
        </span>
        <span className="muted recent-time">
          {formatDuration(run.progress.elapsedMs)} · {run.completedAt ? timeAgo(run.completedAt, now) : ''}
        </span>
      </a>
    </li>
  )
}

function EmptyState({ title, body, action, error }: { title: string; body: string; action: string; error?: string | null }) {
  return (
    <div className="empty">
      <Logo size={36} />
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" onClick={() => chrome.runtime.openOptionsPage()}>
        {action}
      </button>
    </div>
  )
}

function Logo({ size = 20 }: { size?: number }) {
  return <img src="/icons/icon-128.png" width={size} height={size} alt="" className="logo" />
}
