import { describe, expect, it } from 'vitest'
import { AUTH_LOG_MAX, AuthError, RECOVERY_COOLDOWN_MS, appendAuthEvent, authErrorDetail, canRecover, isTransientRefreshError } from './auth'
import type { AuthState } from './types'

describe('isTransientRefreshError', () => {
  it('keeps the session when offline or GitHub is having trouble', () => {
    // what fetch rejects with when there is no network, e.g. right after waking from sleep
    expect(isTransientRefreshError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientRefreshError(new AuthError('http_error', 'GitHub responded with 502', 502))).toBe(true)
    expect(isTransientRefreshError(new AuthError('http_error', 'GitHub responded with 429', 429))).toBe(true)
  })

  it('ends the session when the refresh token is no good', () => {
    expect(isTransientRefreshError(new AuthError('bad_refresh_token'))).toBe(false)
    expect(isTransientRefreshError(new AuthError('refresh_token_expired'))).toBe(false)
    expect(isTransientRefreshError(new AuthError('no_refresh_token'))).toBe(false)
    expect(isTransientRefreshError(new AuthError('http_error', 'GitHub responded with 400', 400))).toBe(false)
    expect(isTransientRefreshError(new Error('something else'))).toBe(false)
  })
})

describe('appendAuthEvent', () => {
  it('keeps the newest entries only', () => {
    let log = appendAuthEvent([], { at: 0, event: 'signed_in' })
    for (let i = 1; i <= AUTH_LOG_MAX; i++) log = appendAuthEvent(log, { at: i, event: 'refreshed' })
    expect(log).toHaveLength(AUTH_LOG_MAX)
    expect(log[0].at).toBe(1)
    expect(log.at(-1)?.at).toBe(AUTH_LOG_MAX)
  })
})

describe('canRecover', () => {
  const app: AuthState = { kind: 'app', accessToken: 't', refreshToken: 'r' }

  it('tries a fresh token for a GitHub App session', () => {
    expect(canRecover(app, null, 1000)).toBe(true)
  })

  it('does not try without a refresh token (personal access token)', () => {
    expect(canRecover({ kind: 'pat', accessToken: 't' }, null, 1000)).toBe(false)
    expect(canRecover({ kind: 'app', accessToken: 't' }, null, 1000)).toBe(false)
  })

  it('gives up when the fresh token is refused too', () => {
    expect(canRecover(app, 1000, 1000 + RECOVERY_COOLDOWN_MS)).toBe(false)
    expect(canRecover(app, 1000, 1001 + RECOVERY_COOLDOWN_MS)).toBe(true)
  })
})

describe('authErrorDetail', () => {
  it('names GitHub\'s error code, with the HTTP status when there is one', () => {
    expect(authErrorDetail(new AuthError('bad_refresh_token'))).toBe('bad_refresh_token')
    expect(authErrorDetail(new AuthError('http_error', 'GitHub responded with 502', 502))).toBe('http_error (502)')
    expect(authErrorDetail(new TypeError('Failed to fetch'))).toBe('TypeError: Failed to fetch')
  })
})
