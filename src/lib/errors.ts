import { AuthError } from './auth'
import { GitHubError } from './github'
import { t } from './i18n'

// Errors are stored as codes and turned into text where they are shown, so the text follows
// the viewer's language and code (the GitHub page's install hint) can check what went wrong.

export type ErrorCode = 'not_found' | 'forbidden' | 'http' | 'network' | 'session_expired' | 'unknown'

export interface ErrorInfo {
  code: ErrorCode
  status?: number
  /** GitHub's own message, which stays in English */
  detail?: string
  /** epoch ms when it happened; set for `not_found`, see isBackedOff */
  at?: number
}

/**
 * How long a repository that answered 404 is left alone. The GitHub App cannot see a private
 * repository it is not installed on, and a 404 is not a 304: each one counts against the
 * rate limit, every 10 s while such a page is in view. Installing the app there shows up
 * within this time; changing settings retries right away.
 */
export const NOT_FOUND_RETRY_MS = 5 * 60_000

/** true while a repository's last 404 is recent enough not to ask again */
export function isBackedOff(e: ErrorInfo | null | undefined, now: number): boolean {
  return e?.code === 'not_found' && e.at !== undefined && now - e.at < NOT_FOUND_RETRY_MS
}

export function errorText(e: ErrorInfo | null | undefined): string {
  if (!e) return ''
  switch (e.code) {
    case 'not_found':
      return t('errorNotFound')
    case 'forbidden':
      return t('errorForbidden', e.detail ?? '')
    case 'http':
      return t('errorHttp', e.status ?? '', e.detail ?? '')
    case 'network':
      return t('errorNetwork')
    case 'session_expired':
      return t('errorSessionExpired')
    default:
      return e.detail ?? ''
  }
}

export function isNotFound(e: ErrorInfo | null | undefined): boolean {
  return e?.code === 'not_found'
}

/** What went wrong with a GitHub request, as a code to store and show later. */
export function describeError(e: unknown): ErrorInfo {
  if (e instanceof GitHubError) {
    if (e.status === 401) return { code: 'session_expired' }
    if (e.status === 404) return { code: 'not_found' }
    if (e.status === 403) return { code: 'forbidden', detail: e.message }
    return { code: 'http', status: e.status, detail: e.message }
  }
  // fetch rejects with a TypeError when there is no network
  if (e instanceof TypeError) return { code: 'network' }
  if (e instanceof AuthError && e.code === 'http_error') return { code: 'http', status: e.status, detail: e.message }
  return { code: 'unknown', detail: e instanceof Error ? e.message : String(e) }
}
