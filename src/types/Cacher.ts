import { Index } from './IndexType'
import { Version } from './Version'

export interface CacheData {
  timestamp?: number
  packages?: Record<string, string | undefined>
  peers?: Record<string, Index<string> | undefined>
}

export type Cacher = {
  get(name: string, target: string): string | undefined
  set(name: string, target: string, version: string): void
  getPeers(name: string, version: Version): Index<string> | undefined
  setPeers(name: string, version: Version, peers: Index<string>): void
  save(): Promise<void>
  log(peers?: boolean): void
}
