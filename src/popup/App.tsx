import { useEffect, useMemo, useState } from 'react'
import { errorText, type ErrorInfo } from '../lib/errors'
import { isCounted } from '../lib/filters'
import { t } from '../lib/i18n'
import { POPUP_PORT, send } from '../lib/messages'
import { formatDuration, isActive, progressSummary, runProgress, timeLabel } from '../lib/progress'
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
        <h1>{t('extName')}</h1>
        <span className="spacer" />
        {auth && settings.repos.length > 0 && (
          <button className="btn-icon" onClick={refresh} disabled={refreshing} title={t('refreshNow')} aria-label={t('refreshNow')}>
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
        <button className="btn-icon" onClick={() => chrome.runtime.openOptionsPage()} title={t('settings')} aria-label={t('settings')}>
          {/* Primer Octicons gear-16 (MIT), the settings icon GitHub itself uses */}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"
            />
          </svg>
        </button>
      </header>

      {!auth ? (
        <EmptyState
          title={t('connectTitle')}
          body={t('connectBody')}
          action={t('signInWithGitHub')}
          error={meta.lastError}
        />
      ) : settings.repos.length === 0 ? (
        <EmptyState
          title={t('pickReposTitle')}
          body={t('pickReposBody')}
          action={t('chooseRepos')}
        />
      ) : (
        <main>
          <section>
            <h2>
              {t('running')} <span className="count">{active.length}</span>
            </h2>
            {active.length === 0 ? (
              <p className="quiet">
                {settings.repos.length === 1 ? t('nothingRunningOne') : t('nothingRunningMany', settings.repos.length)}
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
              <h2>{t('recentlyFinished')}</h2>
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
            <span className="error">{errorText(meta.lastError)}</span>
          ) : Object.keys(repoErrors).length > 0 ? (
            <span className="error" title={Object.entries(repoErrors).map(([r, e]) => `${r}: ${errorText(e)}`).join('\n')}>
              {Object.keys(repoErrors).length === 1
                ? t('repoCouldNotLoad', Object.keys(repoErrors)[0])
                : t('reposCouldNotLoad', Object.keys(repoErrors).length)}
            </span>
          ) : (
            <span>{meta.lastPolledAt ? t('updatedAgo', timeAgo(meta.lastPolledAt, now)) : t('loading')}</span>
          )}
          {meta.rateLimit && meta.rateLimit.remaining < meta.rateLimit.limit * 0.2 && (
            <span title={t('apiRequestsLeft')}>
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
  const p = runProgress(run, now)
  const tone = toneOf(run.status, run.conclusion)
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
          aria-label={t('runProgressAria', run.workflowName)}
        >
          <div className="bar-fill" style={{ width: `${Math.max(pct, tone === 'queued' ? 0 : 3)}%` }} />
        </div>
        <div className="run-stats">
          <span className="run-step">
            {tone === 'queued'
              ? t('waitingForRunner')
              : progressSummary(run.jobs)}
          </span>
          <span className="run-time">{timeLabel(p, tone === 'queued')}</span>
        </div>
      </a>
      {run.jobs.length > 0 && (
        <>
          <button className="jobs-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('hideJobs') : run.jobs.length === 1 ? t('showJobsOne') : t('showJobsMany', run.jobs.length)}
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
          {formatDuration(run.progress.elapsedMs)} · {timeAgo(Date.parse(run.updatedAt), now)}
        </span>
      </a>
    </li>
  )
}

function EmptyState({
  title,
  body,
  action,
  error,
}: {
  title: string
  body: string
  action: string
  error?: ErrorInfo | string | null
}) {
  return (
    <div className="empty">
      <Logo size={36} />
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {error && <p className="error">{errorText(error)}</p>}
      <button className="btn btn-primary" onClick={() => chrome.runtime.openOptionsPage()}>
        {action}
      </button>
    </div>
  )
}

function Logo({ size = 20 }: { size?: number }) {
  return <img src="/icons/icon-128.png" width={size} height={size} alt="" className="logo" />
}
