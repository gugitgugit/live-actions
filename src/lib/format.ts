import { t } from './i18n'

export function timeAgo(ms: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  if (sec < 10) return t('timeJustNow')
  if (sec < 60) return t('timeSecondsAgo', sec)
  const min = Math.round(sec / 60)
  if (min < 60) return t('timeMinutesAgo', min)
  return t('timeHoursAgo', Math.round(min / 60))
}

/**
 * Milliseconds until timeAgo(ms) reads differently: every second while it counts seconds,
 * then when the minute or hour it shows ticks over. Lets a page that is not animating
 * anything re-render exactly when the text would change, instead of every second or only
 * when something else happens to trigger a render. Mirrors timeAgo's rounding: seconds
 * first, then minutes from those, then hours from those.
 */
export function timeAgoChangesIn(ms: number, now = Date.now()): number {
  const elapsed = Math.max(0, now - ms)
  const sec = Math.round(elapsed / 1000)
  let nextSec: number
  if (sec < 10) nextSec = 10 // "just now"
  else if (sec < 60) nextSec = sec + 1
  else {
    const min = Math.round(sec / 60)
    if (min < 60) nextSec = min * 60 + 30
    else {
      const hours = Math.round(min / 60)
      nextSec = (hours * 60 + 30) * 60 - 30
    }
  }
  // a whole second count is reached half a second early, since timeAgo rounds
  return Math.max(1, (nextSec - 0.5) * 1000 - elapsed)
}
