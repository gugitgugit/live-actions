import { describe, expect, it } from 'vitest'
import { AuthError, isTransientRefreshError } from './auth'

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
