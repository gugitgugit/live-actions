import { t } from './i18n'

// Errors are stored as codes and turned into text where they are shown, so the text follows
// the viewer's language and code (the GitHub page's install hint) can check what went wrong.

export type ErrorCode = 'not_found' | 'forbidden' | 'http' | 'network' | 'session_expired' | 'unknown'

export interface ErrorInfo {
  code: ErrorCode
  status?: number
  /** GitHub's own message, which stays in English */
  detail?: string
}

/** Plain strings are errors saved by versions before 2026-10-06. */
export function errorText(e: ErrorInfo | string | null | undefined): string {
  if (!e) return ''
  if (typeof e === 'string') return e
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

export function isNotFound(e: ErrorInfo | string | null | undefined): boolean {
  return typeof e === 'object' && e?.code === 'not_found'
}
