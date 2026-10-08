import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { APP_SLUG, AuthError, isAppConfigured, pollForToken, requestDeviceCode, type DeviceCode } from '../lib/auth'
import { errorText, type ErrorInfo } from '../lib/errors'
import { GitHubClient, GitHubError } from '../lib/github'
import { t, tAround, type MessageKey } from '../lib/i18n'
import { getTokenFromBackground } from '../lib/messages'
import { setItem, updateItem } from '../lib/storage'
import type { ApiRepo, AuthState, NotifyMode, Settings, WatchedRepo } from '../lib/types'
import { GitHubMark } from '../shared/GitHubMark'
import { useStorage } from '../shared/useStorage'

export function Options() {
  const auth = useStorage('auth')
  const settings = useStorage('settings')
  const meta = useStorage('meta')

  useEffect(() => {
    document.title = t('settingsPageTitle')
  }, [])

  if (auth === undefined || settings === undefined || meta === undefined) return null

  return (
    <div className="page">
      <header className="page-header">
        <img src="/icons/icon-128.png" width={32} height={32} alt="" />
        <div>
          <h1>{t('appName')}</h1>
          <p className="muted">{t('tagline')}</p>
        </div>
      </header>

      <Account auth={auth} lastError={meta.lastError} />
      {auth && <Repositories auth={auth} settings={settings} repoErrors={meta.repoErrors} />}
      {auth && <Preferences settings={settings} />}

      <footer className="page-footer muted">{t('privacyFooter')}</footer>
    </div>
  )
}

// ---------- account ----------

async function saveAuth(auth: AuthState) {
  const viewer = await new GitHubClient({ getToken: async () => auth.accessToken }).getViewer()
  await updateItem('meta', (m) => ({ ...m, lastError: null }))
  await setItem('auth', { ...auth, login: viewer.login })
}

function Account({ auth, lastError }: { auth: AuthState | null; lastError: ErrorInfo | null }) {
  if (auth) {
    const [before, after] = tAround('signedInAs')
    return (
      <section className="card">
        <h2>{t('account')}</h2>
        <div className="row">
          <img className="avatar" src={`https://github.com/${auth.login}.png?size=64`} width={32} height={32} alt="" />
          <div className="grow">
            <div>
              {before}
              <strong>@{auth.login}</strong>
              {after}
            </div>
            <div className="muted small">
              {auth.kind === 'app' ? t('authAppKind') : t('authPatKind')}
            </div>
          </div>
          <button
            className="btn btn-danger"
            // the background clears runs and caches when it sees `auth` go
            onClick={() => setItem('auth', null)}
          >
            {t('signOut')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>{t('connectTitle')}</h2>
      {lastError && <p className="error">{errorText(lastError)}</p>}
      {isAppConfigured ? (
        <DeviceFlow />
      ) : (
        <p className="notice">
          {tAround('noClientId')[0]}
          <code>VITE_GITHUB_CLIENT_ID</code>
          {tAround('noClientId')[1]}
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
        <ol className="steps">
          <li>{t('deviceStep1')}</li>
          <li>{t('deviceStep2')}</li>
          <li>{t('deviceStep3')}</li>
        </ol>
        <div className="device-code mono" aria-live="polite">
          {code.userCode}
        </div>
        <div className="row center">
          <button className="btn btn-primary" onClick={() => copyAndOpen(code)}>
            {copied ? t('deviceCopied') : t('deviceCopyOpen')}
          </button>
          <button className="btn" onClick={cancel}>
            {t('cancel')}
          </button>
        </div>
        <p className="muted small waiting">
          <span className="dot" /> {t('deviceWaiting')}
        </p>
      </div>
    )
  }

  return (
    <div className="signin">
      <p className="muted">{t('deviceIntro')}</p>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-github btn-large" onClick={start} disabled={busy}>
        <GitHubMark /> {t('signInWithGitHub')}
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
      setError(err instanceof GitHubError && err.status === 401 ? t('tokenRejected') : describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="pat" open={defaultOpen}>
      <summary>{t('patSummary')}</summary>
      <p className="muted small">
        {tAround('patHelp')[0]}
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
          {t('patHelpLink')}
        </a>
        {tAround('patHelp')[1]}
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
          aria-label={t('authPatKind')}
        />
        <button className="btn" disabled={busy || token.trim().length === 0}>
          {t('saveToken')}
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
  repoErrors: Record<string, ErrorInfo>
}) {
  const client = useMemo(() => new GitHubClient({ getToken: getTokenFromBackground }), [])
  const [available, setAvailable] = useState<ApiRepo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
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
  const q = query.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  // what the app (or token) can list, minus what is already added
  const addable = useMemo(
    () =>
      (available ?? [])
        .filter((r) => !watched.has(r.full_name) && matches(r.full_name))
        .map((r): WatchedRepo => ({ fullName: r.full_name, private: r.private })),
    [available, settings.repos, query],
  )
  // "owner/name" typed into the search that is in neither list: offer to add it by name,
  // which is how public repositories the app was not installed on get added
  const typed = query.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '')
  const offerTyped =
    /^[\w.-]+\/[\w.-]+$/.test(typed) &&
    !watched.has(typed) &&
    !(available ?? []).some((r) => r.full_name.toLowerCase() === typed.toLowerCase())

  const setRepos = (fn: (repos: WatchedRepo[]) => WatchedRepo[]) => updateItem('settings', (s) => ({ ...s, repos: fn(s.repos) }))
  const add = (repo: WatchedRepo) => setRepos((repos) => (repos.some((r) => r.fullName === repo.fullName) ? repos : [...repos, repo]))
  const remove = (fullName: string) => setRepos((repos) => repos.filter((r) => r.fullName !== fullName))

  const addTyped = async () => {
    setAddError(null)
    try {
      const repo = await client.getRepo(typed)
      await add({ fullName: repo.full_name, private: repo.private })
      setQuery('')
    } catch (err) {
      setAddError(
        err instanceof GitHubError && err.status === 404
          ? auth.kind === 'app'
            ? t('notFoundApp')
            : t('notFoundPat')
          : err instanceof Error
            ? err.message
            : String(err),
      )
    }
  }

  return (
    <section className="card">
      <div className="row">
        <h2 className="grow">{t('reposTitle')}</h2>
        <span className="muted small">{t('reposWatched', settings.repos.length)}</span>
      </div>
      <p className="muted small">{t('reposIntro')}</p>

      <div className="notice small">
        {auth.kind === 'app' ? t('accessNoteApp') : t('accessNotePat')}
        {auth.kind === 'app' && APP_SLUG && (
          <div className="notice-actions">
            <a href={`https://github.com/apps/${APP_SLUG}/installations/new`} target="_blank" rel="noreferrer">
              {t('allowAccess')}
            </a>
            <span className="muted">·</span>
            <button className="link" onClick={() => setReload((n) => n + 1)}>
              {t('reloadList')}
            </button>
          </div>
        )}
      </div>

      <h3 className="group">{t('groupWatching')}</h3>
      {settings.repos.length === 0 ? (
        <p className="muted small">{t('noneWatched')}</p>
      ) : (
        <ul className="repo-list">
          {settings.repos.map((repo) => (
            <li key={repo.fullName}>
              <div className="repo-row">
                <span className="grow repo-name">{repo.fullName}</span>
                {repo.private && <span className="tag">{t('private')}</span>}
                <button className="btn btn-small" onClick={() => remove(repo.fullName)}>
                  {t('remove')}
                </button>
              </div>
              {repoErrors[repo.fullName] && <div className="error small repo-error">{errorText(repoErrors[repo.fullName])}</div>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="group">{t('groupAvailable')}</h3>
      <input
        type="search"
        className="full"
        placeholder={t('filterRepos')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setAddError(null)
        }}
        aria-label={t('filterRepos')}
      />
      {loadError && <p className="error">{t('reposLoadError', loadError)}</p>}
      {addError && <p className="error small">{addError}</p>}
      {available === null && !loadError ? (
        <p className="muted">{t('reposLoading')}</p>
      ) : addable.length === 0 && !offerTyped ? (
        <p className="muted small">{q ? t('reposNoMatch') : t('reposNone')}</p>
      ) : (
        <ul className="repo-list">
          {offerTyped && (
            <li>
              <div className="repo-row">
                <span className="grow repo-name">{typed}</span>
                <button className="btn btn-small btn-primary" onClick={addTyped} aria-label={t('addNamed', typed)}>
                  {t('add')}
                </button>
              </div>
            </li>
          )}
          {addable.map((repo) => (
            <li key={repo.fullName}>
              <div className="repo-row">
                <span className="grow repo-name">{repo.fullName}</span>
                {repo.private && <span className="tag">{t('private')}</span>}
                <button className="btn btn-small" onClick={() => add(repo)}>
                  {t('add')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- preferences ----------

const NOTIFY_OPTIONS = [
  { value: 'all', label: 'notifyAll' },
  { value: 'failure', label: 'notifyFailure' },
  { value: 'none', label: 'notifyNone' },
] as const satisfies readonly { value: NotifyMode; label: MessageKey }[]

function Preferences({ settings }: { settings: Settings }) {
  const update = (patch: Partial<Settings>) => updateItem('settings', (s) => ({ ...s, ...patch }))
  return (
    <section className="card">
      <h2>{t('preferences')}</h2>
      <fieldset>
        <legend>{t('desktopNotifications')}</legend>
        {NOTIFY_OPTIONS.map((o) => (
          <label key={o.value} className="radio">
            <input type="radio" name="notify" checked={settings.notify === o.value} onChange={() => update({ notify: o.value })} />
            {t(o.label)}
          </label>
        ))}
      </fieldset>
      <label className="radio">
        <input type="checkbox" checked={settings.inPage} onChange={(e) => update({ inPage: e.target.checked })} />
        {t('inPageLabel')}
      </label>
      <p className="muted small indent">{t('inPageHelp')}</p>
      <label className="radio">
        <input type="checkbox" checked={settings.onlyMine} onChange={(e) => update({ onlyMine: e.target.checked })} />
        {t('onlyMineLabel')}
      </label>
    </section>
  )
}

// ---------- helpers ----------

function describeAuthError(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.code) {
      case 'access_denied':
        return t('authCancelled')
      case 'expired_token':
        return t('authExpired')
      case 'device_flow_disabled':
        return t('authDeviceDisabled')
      case 'incorrect_client_credentials':
        return t('authBadClientId')
    }
  }
  if (e instanceof TypeError) return t('authNetwork')
  return e instanceof Error ? e.message : String(e)
}
