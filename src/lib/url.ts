/**
 * `url` if it is a page on github.com, otherwise null. Links from API responses end up as
 * `href`s on github.com pages and in the popup, and as tabs opened from notifications; the
 * API is trusted, but a `javascript:` or other-site URL there would run or navigate with the
 * user's click, so only GitHub pages are let through.
 */
export function githubUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'github.com' ? u.href : null
  } catch {
    return null
  }
}
