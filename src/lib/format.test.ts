import { describe, expect, it } from 'vitest'
import { timeAgo, timeAgoChangesIn } from './format'

describe('timeAgoChangesIn', () => {
  const t0 = Date.parse('2026-01-01T00:00:00Z')

  it('waits out "just now", then ticks every second while counting seconds', () => {
    expect(timeAgoChangesIn(t0, t0 + 3_000)).toBe(6_500)
    expect(timeAgoChangesIn(t0, t0 + 12_300)).toBe(200)
    expect(timeAgoChangesIn(t0, t0 + 30_000)).toBe(500)
  })

  it('waits for the rounded minute or hour to change', () => {
    // 100 s reads "2 min" until it rounds to 150 s
    expect(timeAgoChangesIn(t0, t0 + 100_000)).toBe(49_500)
    // 2 h reads "2 h" until the minutes round to 150
    expect(timeAgoChangesIn(t0, t0 + 2 * 3_600_000)).toBe(1_799_500 - 30_000)
  })

  it('lands where the text actually changes', () => {
    for (const elapsed of [0, 5_000, 9_499, 9_500, 30_200, 59_400, 59_700, 89_499, 100_000, 1_769_000, 3_000_000, 3_600_000, 5_369_000, 7_000_000]) {
      const wait = timeAgoChangesIn(t0, t0 + elapsed)
      expect(timeAgo(t0, t0 + elapsed + wait - 1)).toBe(timeAgo(t0, t0 + elapsed))
      expect(timeAgo(t0, t0 + elapsed + wait)).not.toBe(timeAgo(t0, t0 + elapsed))
    }
  })
})
