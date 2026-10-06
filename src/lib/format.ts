import { t } from './i18n'

export function timeAgo(ms: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  if (sec < 10) return t('timeJustNow')
  if (sec < 60) return t('timeSecondsAgo', sec)
  const min = Math.round(sec / 60)
  if (min < 60) return t('timeMinutesAgo', min)
  return t('timeHoursAgo', Math.round(min / 60))
}
