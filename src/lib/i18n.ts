import en from '../../public/_locales/en/messages.json'

// UI strings come from public/_locales/<lang>/messages.json through chrome.i18n, which picks
// the browser's language and falls back to English. The English file is also bundled here so
// that missing keys and environments without chrome.i18n (unit tests) still read correctly.

export type MessageKey = keyof typeof en

interface Entry {
  message: string
  placeholders?: Record<string, { content: string }>
}

export function t(key: MessageKey, ...subs: (string | number)[]): string {
  const args = subs.map(String)
  const fromChrome = typeof chrome !== 'undefined' && chrome.i18n?.getMessage ? chrome.i18n.getMessage(key, args) : ''
  return fromChrome || fallback(en[key] as Entry, args)
}

/** Resolve named placeholders ($COUNT$ → "$1" → first argument) the way Chrome does. */
function fallback(entry: Entry, args: string[]): string {
  return entry.message
    .replace(/\$([A-Za-z0-9_]+)\$/g, (_, name: string) => {
      const content = entry.placeholders?.[name.toLowerCase()]?.content ?? ''
      return content.replace(/\$(\d)/g, (__, n: string) => args[Number(n) - 1] ?? '')
    })
    .replace(/\$\$/g, '$')
}

/**
 * A message split around its one placeholder, for markup inside the sentence (a link, a
 * bold name). Word order differs by language, so the sentence decides where it goes.
 */
export function tAround(key: MessageKey): [string, string] {
  const MARK = '\u0000'
  const [before, after = ''] = t(key, MARK).split(MARK)
  return [before, after]
}
