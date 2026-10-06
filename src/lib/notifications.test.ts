import { describe, expect, it } from 'vitest'
import { runNotificationId, urlFromNotificationId } from './notifications'

const url = 'https://github.com/gugitgugit/actions-pulse/actions/runs/37403789339'

describe('runNotificationId', () => {
  it('differs for re-runs of the same run', () => {
    expect(runNotificationId(url, 1)).not.toBe(runNotificationId(url, 2))
  })

  it('round-trips the URL', () => {
    expect(urlFromNotificationId(runNotificationId(url))).toBe(url)
  })
})

describe('urlFromNotificationId', () => {
  it('ignores ids that are not ours', () => {
    expect(urlFromNotificationId('other|123|' + url)).toBeNull()
  })

  it('rejects non-GitHub URLs', () => {
    expect(urlFromNotificationId(runNotificationId('https://evil.example/x'))).toBeNull()
  })
})
