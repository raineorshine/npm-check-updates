export interface CacheData {
  timestamp?: number
  packages?: Record<string, string | undefined>
}

export type Cacher = {
  get(name: string, target: string): string | undefined
  set(name: string, target: string, version: string): void
  save(): Promise<void>
  log(): void
}
