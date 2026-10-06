export function timeAgo(ms: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}
