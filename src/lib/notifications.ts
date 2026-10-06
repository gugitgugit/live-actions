const PREFIX = 'run|'

/**
 * Notification id for a finished run. It carries the URL so the click handler needs no
 * extra state, and is unique per notification: re-runs keep the same run URL, and
 * creating a notification with an existing id only updates it in place, which may not
 * alert the user again.
 */
export function runNotificationId(url: string, now = Date.now()): string {
  return `${PREFIX}${now}|${url}`
}

/** The run URL from a notification id, or null if the id is not ours or not a GitHub URL. */
export function urlFromNotificationId(id: string): string | null {
  if (!id.startsWith(PREFIX)) return null
  const sep = id.indexOf('|', PREFIX.length)
  if (sep === -1) return null
  const url = id.slice(sep + 1)
  return url.startsWith('https://github.com/') ? url : null
}
