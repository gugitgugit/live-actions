import type { AuthState, CacheEntry, CommitInfo, HistoryEntry, Meta, RepoInfo, Settings, TrackedRun } from './types'

export interface StorageSchema {
  auth: AuthState | null
  settings: Settings
  runs: Record<string, TrackedRun>
  /** key: `${repo}#${workflowId}` */
  histories: Record<string, HistoryEntry>
  httpCache: Record<string, CacheEntry>
  /** repositories viewed on github.com, key: "owner/name" */
  repoInfo: Record<string, RepoInfo>
  /** commits shown in an open tab, key: "owner/name@sha" */
  commits: Record<string, CommitInfo>
  meta: Meta
}

const defaults: StorageSchema = {
  auth: null,
  settings: { repos: [], notify: 'all', onlyMine: false, inPage: true },
  runs: {},
  histories: {},
  httpCache: {},
  repoInfo: {},
  commits: {},
  meta: { lastPolledAt: null, lastError: null, repoErrors: {}, rateLimit: null, unseenFailures: 0 },
}

export type StorageKey = keyof StorageSchema

/** keys holding maps keyed by id, which must not be merged with defaults */
const RECORD_KEYS: ReadonlySet<StorageKey> = new Set(['runs', 'histories', 'httpCache', 'repoInfo', 'commits'])

export async function getItem<K extends StorageKey>(key: K): Promise<StorageSchema[K]> {
  const result = await chrome.storage.local.get(key)
  return withDefaults(key, result[key] as StorageSchema[K] | undefined)
}

function withDefaults<K extends StorageKey>(key: K, value: StorageSchema[K] | undefined): StorageSchema[K] {
  if (value === undefined) return structuredClone(defaults[key])
  // merge so newly added fields get their defaults after an update
  if (isPlainObject(defaults[key]) && isPlainObject(value) && !RECORD_KEYS.has(key)) {
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
    cb(withDefaults(key, changes[key].newValue as StorageSchema[K] | undefined))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
