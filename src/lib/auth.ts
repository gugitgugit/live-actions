import type { AuthState } from './types'

// GitHub App OAuth device flow. No client secret is needed: GitHub allows both the
// token exchange and refreshing device-flow tokens with the client ID alone.
// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token

export const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? ''
export const APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? ''
export const isAppConfigured = CLIENT_ID.length > 0

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'

export class AuthError extends Error {
  constructor(
    public code: string,
    message?: string,
    /** HTTP status, for code `http_error` */
    public status?: number,
  ) {
    super(message ?? code)
  }
}

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** epoch ms */
  expiresAt: number
  /** seconds */
  interval: number
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
  interval?: number
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new AuthError('http_error', `GitHub responded with ${res.status}`, res.status)
  return (await res.json()) as T
}

export async function requestDeviceCode(): Promise<DeviceCode> {
  if (!isAppConfigured) throw new AuthError('not_configured', 'VITE_GITHUB_CLIENT_ID is not set')
  const data = await postForm<{
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
    error?: string
    error_description?: string
  }>(DEVICE_CODE_URL, { client_id: CLIENT_ID })
  if (data.error) throw new AuthError(data.error, data.error_description)
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: Date.now() + data.expires_in * 1000,
    interval: data.interval,
  }
}

export async function pollForToken(code: DeviceCode, signal: AbortSignal): Promise<AuthState> {
  let interval = code.interval
  while (Date.now() < code.expiresAt) {
    await sleep(interval * 1000, signal)
    const data = await postForm<TokenResponse>(TOKEN_URL, {
      client_id: CLIENT_ID,
      device_code: code.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (data.access_token) return toAuthState(data)
    switch (data.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval = data.interval ?? interval + 5
        continue
      default:
        throw new AuthError(data.error ?? 'unknown', data.error_description)
    }
  }
  throw new AuthError('expired_token', 'The code expired. Please try again.')
}

export async function refreshAuth(auth: AuthState): Promise<AuthState> {
  if (!auth.refreshToken) throw new AuthError('no_refresh_token')
  if (auth.refreshTokenExpiresAt && auth.refreshTokenExpiresAt < Date.now()) {
    throw new AuthError('refresh_token_expired')
  }
  const data = await postForm<TokenResponse>(TOKEN_URL, {
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
  })
  if (!data.access_token) throw new AuthError(data.error ?? 'refresh_failed', data.error_description)
  return { ...toAuthState(data), login: auth.login }
}

/**
 * A refresh that failed for a reason that may pass: offline (fetch rejects with a TypeError,
 * as right after the computer wakes up and before the network is back), or GitHub having
 * trouble. The refresh token is still good then, so signing out would throw away a session
 * that the next poll could have renewed. Anything else (an expired or rejected refresh
 * token, GitHub's `bad_refresh_token` and similar) ends the session.
 */
export function isTransientRefreshError(e: unknown): boolean {
  if (e instanceof TypeError) return true
  return e instanceof AuthError && e.code === 'http_error' && (e.status === undefined || e.status >= 500 || e.status === 429)
}

/** true when the token expires within the next 5 minutes */
export function needsRefresh(auth: AuthState, now = Date.now()): boolean {
  return auth.kind === 'app' && auth.expiresAt !== undefined && auth.expiresAt - now < 5 * 60_000
}

function toAuthState(data: TokenResponse): AuthState {
  const now = Date.now()
  return {
    kind: 'app',
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? now + data.expires_in * 1000 : undefined,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? now + data.refresh_token_expires_in * 1000
      : undefined,
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new AuthError('aborted'))
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new AuthError('aborted'))
      },
      { once: true },
    )
  })
}
