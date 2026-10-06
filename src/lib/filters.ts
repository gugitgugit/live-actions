import type { Settings, TrackedRun } from './types'

/**
 * Runs that count toward the popup, badge and notifications: watched repositories only
 * (repositories merely open on github.com are tracked for the page, not for alerts),
 * optionally limited to the signed-in user's runs.
 */
export function isCounted(run: TrackedRun, settings: Settings, login: string | undefined): boolean {
  if (!settings.repos.some((r) => r.fullName === run.repo)) return false
  return !settings.onlyMine || !login || run.actor === login
}
