import { useEffect, useState } from 'react'
import { getItem, onItemChanged, type StorageKey, type StorageSchema } from '../lib/storage'

/** Live value of a storage key; `undefined` until the first read resolves. */
export function useStorage<K extends StorageKey>(key: K): StorageSchema[K] | undefined {
  const [value, setValue] = useState<StorageSchema[K]>()
  useEffect(() => {
    let alive = true
    getItem(key).then((v) => alive && setValue(v))
    const off = onItemChanged(key, setValue)
    return () => {
      alive = false
      off()
    }
  }, [key])
  return value
}

/** Re-render every `ms` so relative times and progress bars keep moving between polls. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

