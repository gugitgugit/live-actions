import { describe, expect, it } from 'vitest'
import { isBackedOff, NOT_FOUND_RETRY_MS } from './errors'

describe('isBackedOff', () => {
  const now = Date.parse('2026-01-01T00:10:00Z')

  it('leaves a repository alone for a while after a 404', () => {
    expect(isBackedOff({ code: 'not_found', at: now - 60_000 }, now)).toBe(true)
    expect(isBackedOff({ code: 'not_found', at: now - NOT_FOUND_RETRY_MS }, now)).toBe(false)
  })

  it('retries other errors, and 404s stored without a time, on the next poll', () => {
    expect(isBackedOff({ code: 'network' }, now)).toBe(false)
    expect(isBackedOff({ code: 'forbidden', at: now }, now)).toBe(false)
    expect(isBackedOff({ code: 'not_found' }, now)).toBe(false)
    expect(isBackedOff('Not found', now)).toBe(false)
    expect(isBackedOff(undefined, now)).toBe(false)
  })
})
