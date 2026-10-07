import { badgeFromOcticon, predictBadge, type BadgeState } from '../lib/commit'

// Keeps GitHub's own commit status badge (the ✓/✗/● next to the latest commit) current
// without touching GitHub's elements: React owns them, and changing their children or
// attributes can be reverted or break its reconciliation. A single <style> we own hides
// the original icon and draws ours in its place with ::before. GitHub's elements are only
// read, never written.

const STYLE_ID = 'live-actions-native'
const BOX = '[data-testid="latest-commit"]'
const BADGE = '[data-testid="checks-status-badge-icon"]'
const SHA = /\/commit\/([0-9a-f]{40})(?:[/?#]|$)/

// Primer Octicons (MIT): check-16, x-16, dot-fill-16
const ICON: Record<BadgeState, { path: string; color: string }> = {
  success: {
    path: 'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z',
    color: 'var(--fgColor-success, #1a7f37)',
  },
  failure: {
    path: 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
    color: 'var(--fgColor-danger, #d1242f)',
  },
  pending: {
    path: 'M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
    color: 'var(--fgColor-attention, #9a6700)',
  },
}

/** The commit shown in the latest-commit box of a code page. */
export function readLatestCommitSha(): string | null {
  const box = document.querySelector(BOX)
  if (!box) return null
  for (const a of box.querySelectorAll<HTMLAnchorElement>('a[href*="/commit/"]')) {
    const m = SHA.exec(new URL(a.href).pathname)
    if (m) return m[1]
  }
  return null
}

interface Baseline {
  native: BadgeState
  actions: BadgeState | null
}
/** per "repo@sha": what GitHub showed and what Actions said when we first saw both */
const baselines = new Map<string, Baseline>()

/**
 * @param actionsNow combined Actions state of the commit; undefined while not fetched yet
 */
export function syncNativeBadge(key: string | null, sha: string | null, actionsNow: BadgeState | null | undefined) {
  let css = ''
  if (key && sha && actionsNow !== undefined) {
    const svg = document.querySelector(`${BOX} ${BADGE} svg`)
    const native = svg ? badgeFromOcticon(svg.getAttribute('class') ?? '') : null
    if (native) {
      let base = baselines.get(key)
      // first sight, or GitHub re-rendered the badge with fresh data itself: start over from there
      if (!base || base.native !== native) {
        base = { native, actions: actionsNow }
        baselines.set(key, base)
      }
      const next = predictBadge(base.native, base.actions, actionsNow)
      if (next) css = rule(sha, next)
    }
  }
  applyCss(css)
}

export function removeNativeBadge() {
  document.getElementById(STYLE_ID)?.remove()
}

function rule(sha: string, state: BadgeState): string {
  const { path, color } = ICON[state]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${path}"/></svg>`
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 16px 16px no-repeat`
  // scoped to this exact commit, so a stale rule can never paint another commit's badge
  const target = `${BOX}:has(a[href$="/commit/${sha}"]) ${BADGE}`
  return `
${target} svg { display: none !important; }
${target}::before {
  content: "";
  display: inline-block;
  width: 16px;
  height: 16px;
  vertical-align: text-bottom;
  background-color: ${color};
  -webkit-mask: ${mask};
  mask: ${mask};
}`
}

function applyCss(css: string) {
  let style = document.getElementById(STYLE_ID)
  if (!css) {
    style?.remove()
    return
  }
  // GitHub's navigation may swap <head>; recreate when gone
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  if (style.textContent !== css) style.textContent = css
}
