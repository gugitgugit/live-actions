import { describe, expect, it } from 'vitest'
import { AuthError } from './auth'
import { describeError, isBackedOff, NOT_FOUND_RETRY_MS } from './errors'
import { GitHubError } from './github'

describe('isBackedOff', () => {
  const now = Date.parse('2026-01-01T00:10:00Z')

  it('leaves a repository alone for a while after a 404', () => {
    expect(isBackedOff({ code: 'not_found', at: now - 60_000 }, now)).toBe(true)
    expect(isBackedOff({ code: 'not_found', at: now - NOT_FOUND_RETRY_MS }, now)).toBe(false)
  })

  it('retries other errors, and 404s without a time, on the next poll', () => {
    expect(isBackedOff({ code: 'network' }, now)).toBe(false)
    expect(isBackedOff({ code: 'forbidden', at: now }, now)).toBe(false)
    expect(isBackedOff({ code: 'not_found' }, now)).toBe(false)
    expect(isBackedOff(undefined, now)).toBe(false)
  })
})

describe('describeError', () => {
  it('turns GitHub responses into codes', () => {
    expect(describeError(new GitHubError(401, 'Bad credentials'))).toEqual({ code: 'session_expired' })
    expect(describeError(new GitHubError(404, 'Not Found'))).toEqual({ code: 'not_found' })
    expect(describeError(new GitHubError(403, 'Resource not accessible'))).toEqual({ code: 'forbidden', detail: 'Resource not accessible' })
    expect(describeError(new GitHubError(502, 'Bad gateway'))).toEqual({ code: 'http', status: 502, detail: 'Bad gateway' })
  })

  it('tells network trouble and failed token refreshes apart', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toEqual({ code: 'network' })
    expect(describeError(new AuthError('http_error', 'GitHub responded with 503', 503))).toEqual({
      code: 'http',
      status: 503,
      detail: 'GitHub responded with 503',
    })
    expect(describeError(new Error('boom'))).toEqual({ code: 'unknown', detail: 'boom' })
  })
})
