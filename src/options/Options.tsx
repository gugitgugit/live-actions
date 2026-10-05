import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { APP_SLUG, AuthError, isAppConfigured, pollForToken, requestDeviceCode, type DeviceCode } from '../lib/auth'
import { GitHubClient, GitHubError } from '../lib/github'
import { getTokenFromBackground } from '../lib/messages'
import { setItem, updateItem } from '../lib/storage'
import type { ApiRepo, AuthState, NotifyMode, Settings, WatchedRepo } from '../lib/types'
import { useStorage } from '../shared/useStorage'

export function Options() {
  const auth = useStorage('auth')
  const settings = useStorage('settings')
  const meta = useStorage('meta')

  if (auth === undefined || settings === undefined || meta === undefined) return null

  return (
    <div className="page">
      <header className="page-header">
        <img src="/icons/icon-128.png" width={32} height={32} alt="" />
        <div>
          <h1>Actions Pulse</h1>
          <p className="muted">Live progress for your GitHub Actions workflows.</p>
        </div>
      </header>

      <Account auth={auth} lastError={meta.lastError} />
      {auth && <Repositories auth={auth} settings={settings} repoErrors={meta.repoErrors} />}
      {auth && <Preferences settings={settings} />}

      <footer className="page-footer muted">
        Your token is stored only in this browser and is sent only to GitHub. Actions Pulse has no server and collects
        no data.
      </footer>
    </div>
  )
}

// ---------- account ----------

async function saveAuth(auth: AuthState) {
  const viewer = await new GitHubClient({ getToken: async () => auth.accessToken }).getViewer()
  await updateItem('meta', (m) => ({ ...m, lastError: null }))
  await setItem('auth', { ...auth, login: viewer.login })
}

function Account({ auth, lastError }: { auth: AuthState | null; lastError: string | null }) {
  if (auth) {
    return (
      <section className="card">
        <h2>Account</h2>
        <div className="row">
          <img className="avatar" src={`https://github.com/${auth.login}.png?size=64`} width={32} height={32} alt="" />
          <div className="grow">
            <div>
              Signed in as <strong>@{auth.login}</strong>
            </div>
            <div className="muted small">
              {auth.kind === 'app' ? 'GitHub App · read-only access to Actions' : 'Personal access token'}
            </div>
          </div>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await Promise.all([setItem('auth', null), setItem('runs', {}), setItem('httpCache', {})])
            }}
          >
            Sign out
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Account</h2>
      {lastError && <p className="error">{lastError}</p>}
      {isAppConfigured ? (
        <DeviceFlow />
      ) : (
        <p className="notice">
          This build has no GitHub App client ID (<code>VITE_GITHUB_CLIENT_ID</code>), so only personal access tokens are
          available.
        </p>
      )}
      <TokenForm defaultOpen={!isAppConfigured} />
    </section>
  )
}

function DeviceFlow() {
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const start = async () => {
    setError(null)
    setBusy(true)
    abort.current = new AbortController()
    try {
      const dc = await requestDeviceCode()
      setCode(dc)
      const auth = await pollForToken(dc, abort.current.signal)
      await saveAuth(auth)
    } catch (e) {
      if (e instanceof AuthError && e.code === 'aborted') return
      setError(describeAuthError(e))
    } finally {
      setBusy(false)
      setCode(null)
    }
  }

  const cancel = () => abort.current?.abort()

  const copyAndOpen = async (dc: DeviceCode) => {
    try {
      await navigator.clipboard.writeText(dc.userCode)
      setCopied(true)
    } catch {
      // clipboard can be unavailable; the code is shown on screen anyway
    }
    chrome.tabs.create({ url: dc.verificationUri })
  }

  if (code) {
    return (
      <div className="device">
        <p>Enter this code on GitHub to authorize Actions Pulse:</p>
        <div className="device-code mono" aria-live="polite">
          {code.userCode}
        </div>
        <div className="row center">
          <button className="btn btn-primary" onClick={() => copyAndOpen(code)}>
            {copied ? 'Copied — open GitHub again' : 'Copy code & open GitHub'}
          </button>
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
        </div>
        <p className="muted small waiting">
          <span className="dot" /> Waiting for authorization… Keep this tab open.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="muted">
        Sign in with the Actions Pulse GitHub App. It only asks for read access to Actions and repository metadata.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" onClick={start} disabled={busy}>
        <GitHubMark /> Sign in with GitHub
      </button>
    </div>
  )
}

function TokenForm({ defaultOpen }: { defaultOpen: boolean }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveAuth({ kind: 'pat', accessToken: token.trim() })
      setToken('')
    } catch (err) {
      setError(err instanceof GitHubError && err.status === 401 ? 'GitHub rejected this token.' : describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="pat" open={defaultOpen}>
      <summary>Use a personal access token instead</summary>
      <p className="muted small">
        Create a{' '}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
          fine-grained token
        </a>{' '}
        with <strong>Actions: Read-only</strong> and <strong>Metadata: Read-only</strong> for the repositories you want to
        watch.
      </p>
      <form className="row" onSubmit={submit}>
        <input
          type="password"
          className="grow"
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Personal access token"
        />
        <button className="btn" disabled={busy || token.trim().length === 0}>
          Save token
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </details>
  )
}

// ---------- repositories ----------

function Repositories({
  auth,
  settings,
  repoErrors,
}: {
  auth: AuthState
  settings: Settings
  repoErrors: Record<string, string>
}) {
  const client = useMemo(() => new GitHubClient({ getToken: getTokenFromBackground }), [])
  const [available, setAvailable] = useState<ApiRepo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoadError(null)
    ;(auth.kind === 'app' ? client.listAppRepos() : client.listUserRepos())
      .then((repos) => alive && setAvailable(repos))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [auth.kind, auth.login, client, reload])

  const watched = new Set(settings.repos.map((r) => r.fullName))

  // watched repos first, then everything else; include watched repos missing from the listing
  const rows = useMemo(() => {
    const byName = new Map<string, WatchedRepo>()
    for (const r of settings.repos) byName.set(r.fullName, r)
    for (const r of available ?? []) if (!byName.has(r.full_name)) byName.set(r.full_name, { fullName: r.full_name, private: r.private })
    const q = query.trim().toLowerCase()
    return [...byName.values()]
      .filter((r) => !q || r.fullName.toLowerCase().includes(q))
      .sort((a, b) => Number(watched.has(b.fullName)) - Number(watched.has(a.fullName)))
  }, [available, settings.repos, query])

  const toggle = (repo: WatchedRepo) =>
    updateItem('settings', (s) => ({
      ...s,
      repos: s.repos.some((r) => r.fullName === repo.fullName)
        ? s.repos.filter((r) => r.fullName !== repo.fullName)
        : [...s.repos, repo],
    }))

  const addManual = async (e: FormEvent) => {
    e.preventDefault()
    setManualError(null)
    const name = manual
      .trim()
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\/$/, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) {
      setManualError('Use the owner/name format, e.g. vercel/next.js')
      return
    }
    try {
      const repo = await client.getRepo(name)
      if (!watched.has(repo.full_name)) await toggle({ fullName: repo.full_name, private: repo.private })
      setManual('')
    } catch (err) {
      setManualError(
        err instanceof GitHubError && err.status === 404
          ? auth.kind === 'app'
            ? 'Not found. Is the app installed on this repository?'
            : 'Not found, or your token has no access to it.'
          : err instanceof Error
            ? err.message
            : String(err),
      )
    }
  }

  return (
    <section className="card">
      <div className="row">
        <h2 className="grow">Repositories</h2>
        <span className="muted small">{settings.repos.length} watched</span>
      </div>

      {auth.kind === 'app' && APP_SLUG && (
        <p className="muted small">
          Missing a repository?{' '}
          <a href={`https://github.com/apps/${APP_SLUG}/installations/new`} target="_blank" rel="noreferrer">
            Install the app on more repositories
          </a>
          , then{' '}
          <button className="link" onClick={() => setReload((n) => n + 1)}>
            reload the list
          </button>
          .
        </p>
      )}

      <input
        type="search"
        className="full"
        placeholder="Filter repositories"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter repositories"
      />

      {loadError && <p className="error">Could not load repositories: {loadError}</p>}
      {available === null && !loadError ? (
        <p className="muted">Loading repositories…</p>
      ) : rows.length === 0 ? (
        <p className="muted">{query ? 'No matching repositories.' : 'No repositories found.'}</p>
      ) : (
        <ul className="repo-list">
          {rows.map((repo) => (
            <li key={repo.fullName}>
              <label>
                <input type="checkbox" checked={watched.has(repo.fullName)} onChange={() => toggle(repo)} />
                <span className="grow repo-name">{repo.fullName}</span>
                {repo.private && <span className="tag">Private</span>}
              </label>
              {watched.has(repo.fullName) && repoErrors[repo.fullName] && (
                <div className="error small repo-error">{repoErrors[repo.fullName]}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={addManual}>
        <input
          type="text"
          className="grow"
          placeholder="Add by name: owner/repo"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          aria-label="Add repository by name"
        />
        <button className="btn" disabled={!manual.trim()}>
          Add
        </button>
      </form>
      {manualError && <p className="error small">{manualError}</p>}
    </section>
  )
}

// ---------- preferences ----------

const NOTIFY_OPTIONS: { value: NotifyMode; label: string }[] = [
  { value: 'all', label: 'Every finished run' },
  { value: 'failure', label: 'Failures only' },
  { value: 'none', label: 'Never' },
]

function Preferences({ settings }: { settings: Settings }) {
  const update = (patch: Partial<Settings>) => updateItem('settings', (s) => ({ ...s, ...patch }))
  return (
    <section className="card">
      <h2>Preferences</h2>
      <fieldset>
        <legend>Desktop notifications</legend>
        {NOTIFY_OPTIONS.map((o) => (
          <label key={o.value} className="radio">
            <input type="radio" name="notify" checked={settings.notify === o.value} onChange={() => update({ notify: o.value })} />
            {o.label}
          </label>
        ))}
      </fieldset>
      <label className="radio">
        <input type="checkbox" checked={settings.onlyMine} onChange={(e) => update({ onlyMine: e.target.checked })} />
        Only show runs I triggered
      </label>
    </section>
  )
}

// ---------- helpers ----------

function describeAuthError(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.code) {
      case 'access_denied':
        return 'Authorization was cancelled on GitHub.'
      case 'expired_token':
        return 'The code expired. Please try again.'
      case 'device_flow_disabled':
        return 'Device flow is disabled in the GitHub App settings.'
      case 'incorrect_client_credentials':
        return 'The GitHub App client ID is invalid.'
    }
  }
  if (e instanceof TypeError) return 'Network error. Check your connection and try again.'
  return e instanceof Error ? e.message : String(e)
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}
