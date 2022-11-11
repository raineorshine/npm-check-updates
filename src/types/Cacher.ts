export interface CacheData {
  timestamp?: number
  packages?: Record<string, string | undefined>
}

export type Cacher = {
  get(name: string): string | undefined
  set(name: string, versionNew: string): void
  save(): Promise<void>
  log(): void
}
