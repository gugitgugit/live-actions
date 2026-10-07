export type Message = { type: 'poll' } | { type: 'getToken' }

export type TokenResponse = { token: string } | { error: string }

export const POPUP_PORT = 'popup'
/** content script on github.com; tells the background which repository the tab shows */
export const PAGE_PORT = 'page'

/**
 * `view`: which repository the tab shows; `sha` is the commit whose status badge it shows (code
 * pages), so its full Actions state can be fetched.
 * `poke`: GitHub just updated the page on its own (a new commit or a change in the checks), so
 * there is probably something new to fetch right now.
 */
export type PageMessage = { type: 'view'; repo: string | null; sha: string | null } | { type: 'poke' }

export function send<T = unknown>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

/** Token for UI pages. The background owns refreshing so single-use refresh tokens never race. */
export async function getTokenFromBackground(): Promise<string> {
  // undefined when the background did not answer (it refuses senders it does not trust)
  const res = await send<TokenResponse | undefined>({ type: 'getToken' })
  if (!res) throw new Error('No token from the background')
  if ('error' in res) throw new Error(res.error)
  return res.token
}
