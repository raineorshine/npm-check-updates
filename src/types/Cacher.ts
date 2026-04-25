import { type Index } from './IndexType'
import { type Version } from './Version'

interface PackageInfo {
  version: string
  time?: string
}

export interface CacheData {
  timestamp?: number
  packages?: Record<string, PackageInfo | undefined>
  peers?: Record<string, Index<string> | undefined>
}

export type Cacher = {
  get(name: string, target: string): PackageInfo | undefined
  set(name: string, target: string, version: string, time?: string): void
  getPeers(name: string, version: Version): Index<string> | undefined
  setPeers(name: string, version: Version, peers: Index<string>): void
  save(): Promise<void>
  log(peers?: boolean): void
}
