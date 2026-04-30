import { type Index } from './IndexType'
import { type Version } from './Version'

export interface PackageInfo {
  version: string
  time?: string
}

export const CURRENT_CACHE_SCHEMA = 1

export interface CacheData {
  schema: number
  timestamp: number
  packages: Record<string, PackageInfo>
  peers: Record<string, Index<string>>
}

export type Cacher = {
  get(name: string, target: string): PackageInfo | undefined
  set(name: string, target: string, version: string, time?: string): void
  getPeers(name: string, version: Version): Index<string> | undefined
  setPeers(name: string, version: Version, peers: Index<string>): void
  save(): Promise<void>
  log(peers?: boolean): void
}
