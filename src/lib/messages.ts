export type Message = { type: 'poll' } | { type: 'getToken' }

export type TokenResponse = { token: string } | { error: string }

export const POPUP_PORT = 'popup'
/** content script on github.com; tells the background which repository the tab shows */
export const PAGE_PORT = 'page'

/** `sha`: the commit whose status badge the page shows (code pages), so its full Actions state can be fetched */
export type PageMessage = { type: 'view'; repo: string | null; sha: string | null }

export function send<T = unknown>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

/** Token for UI pages. The background owns refreshing so single-use refresh tokens never race. */
export async function getTokenFromBackground(): Promise<string> {
  const res = await send<TokenResponse>({ type: 'getToken' })
  if ('error' in res) throw new Error(res.error)
  return res.token
}
