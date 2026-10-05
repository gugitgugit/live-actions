import type { AuthState, DurationStat, Meta, Settings, TrackedRun } from './types'

export interface CacheEntry {
  etag: string
  body: unknown
  storedAt: number
}

export interface StorageSchema {
  auth: AuthState | null
  settings: Settings
  runs: Record<string, TrackedRun>
  /** key: `${repo}#${workflowId}` */
  durations: Record<string, DurationStat>
  httpCache: Record<string, CacheEntry>
  meta: Meta
}

const defaults: StorageSchema = {
  auth: null,
  settings: { repos: [], notify: 'all', onlyMine: false },
  runs: {},
  durations: {},
  httpCache: {},
  meta: { lastPolledAt: null, lastError: null, repoErrors: {}, rateLimit: null, unseenFailures: 0 },
}

export type StorageKey = keyof StorageSchema

export async function getItem<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  const result = await chrome.storage.local.get(key)
  const value = result[key] as StorageSchema[K] | undefined
  if (value === undefined) return structuredClone(defaults[key])
  // merge so newly added fields get their defaults after an update
  if (isPlainObject(defaults[key]) && isPlainObject(value) && key !== 'runs' && key !== 'durations' && key !== 'httpCache') {
    return { ...structuredClone(defaults[key]), ...value }
  }
  return value
}

export async function setItem<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function updateItem<K extends StorageKey>(
  key: K,
  fn: (current: StorageSchema[K]) => StorageSchema[K],
): Promise<StorageSchema[K]> {
  const next = fn(await getItem(key))
  await setItem(key, next)
  return next
}

export function onItemChanged<K extends StorageKey>(
  key: K,
  cb: (value: StorageSchema[K]) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(key in changes)) return
    const next = changes[key].newValue as StorageSchema[K] | undefined
    cb(next === undefined ? structuredClone(defaults[key]) : next)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
