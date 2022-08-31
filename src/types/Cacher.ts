export interface CacheData {
  timestamp?: number
  packages?: Record<string, string | undefined>
}

export type Cacher = {
  key(name: string, version: string): string
  get(key: string | undefined): string | undefined
  set(key: string | undefined, value: string): void
  save(): Promise<void>
}
