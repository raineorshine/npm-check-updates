import { type Index } from './IndexType.ts'
import { type Packument } from './Packument.ts'
import { type Version } from './Version.ts'

export const CURRENT_CACHE_SCHEMA = 2

export interface CacheData {
  schema: number
  timestamp: number
  packuments: Record<string, Partial<Packument>>
  peers: Record<string, Index<string>>
}

export type Cacher = {
  getPackument(name: string): Partial<Packument> | undefined
  setPackument(name: string, packument: Partial<Packument>): void
  getPeers(name: string, version: Version): Index<string> | undefined
  setPeers(name: string, version: Version, peers: Index<string>): void
  save(): Promise<void>
  log(peers?: boolean): void
}
