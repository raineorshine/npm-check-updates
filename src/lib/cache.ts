import fs from 'fs'
import os from 'os'
import path from 'path'
import { CURRENT_CACHE_SCHEMA, type CacheData, type Cacher } from '../types/Cacher'
import { type Index } from '../types/IndexType'
import { type Options } from '../types/Options'
import { type Version } from '../types/Version'
import { print } from './logging'

export const CACHE_DELIMITER = '___'

/**
 * Check if cache is expired if timestamp is set
 *
 * @param cacheData
 * @param cacheExpiration
 * @returns
 */
function checkCacheExpiration(cacheData: CacheData, cacheExpiration = 10) {
  if (cacheData.schema !== CURRENT_CACHE_SCHEMA) {
    return true
  }

  if (typeof cacheData.timestamp !== 'number') {
    return false
  }

  const unixMinuteMS = 60 * 1000
  const expirationLimit = cacheData.timestamp + cacheExpiration * unixMinuteMS
  return expirationLimit < Date.now()
}

export const defaultCacheFilename = '.ncu-cache.json'
export const defaultCacheFile = `~/${defaultCacheFilename}`
export const resolvedDefaultCacheFile = path.join(os.homedir(), defaultCacheFilename)

/** Resolve the cache file path based on os/homedir. */
export function resolveCacheFile(optionsCacheFile: string) {
  return optionsCacheFile === defaultCacheFile ? resolvedDefaultCacheFile : optionsCacheFile
}

/** Clear the default cache, or the cache file specified by --cacheFile. */
export async function cacheClear(options: Options) {
  if (!options.cacheFile) {
    return
  }

  await fs.promises.rm(resolveCacheFile(options.cacheFile), { force: true })
}

/**
 * The cacher stores key (name + target) - value (new version) pairs
 * for quick updates across `ncu` calls.
 *
 * @returns
 */
export default async function cacher(options: Omit<Options, 'cacher'>): Promise<Cacher | undefined> {
  if (!options.cache || !options.cacheFile) {
    return
  }

  const cacheFile = resolveCacheFile(options.cacheFile)
  const cacheHits = new Set<string>()

  let cacheData: CacheData = {
    schema: CURRENT_CACHE_SCHEMA,
    timestamp: Date.now(),
    packages: {},
    peers: {},
  }

  try {
    const raw = await fs.promises.readFile(cacheFile, 'utf-8')
    const parsed = JSON.parse(raw)

    // Validate schema before assigning
    if (!checkCacheExpiration(parsed, options.cacheExpiration)) {
      const { schema, timestamp, packages = {}, peers = {} } = parsed
      cacheData = { schema, timestamp, packages, peers }
    } else {
      // reset cache
      await fs.promises.rm(cacheFile, { force: true })
    }
  } catch (error) {
    // ignore file read/parse/remove errors
  }

  return {
    get: (name: string, target: string) => {
      const key = `${name}${CACHE_DELIMITER}${target}`
      const cached = cacheData.packages[key]
      if (cached) {
        cacheHits.add(name)
      }
      return cached
    },
    set: (name: string, target: string, version: string, time?: string) => {
      const key = `${name}${CACHE_DELIMITER}${target}`
      cacheData.packages[key] = { version, time }
    },
    getPeers: (name: string, version: Version) => {
      if (!cacheData.peers) return
      const key = `${name}${CACHE_DELIMITER}${version}`
      const cached = cacheData.peers[key]
      if (cached) {
        cacheHits.add(name)
      }
      return cached
    },
    setPeers: (name: string, version: Version, peers: Index<string>) => {
      const key = `${name}${CACHE_DELIMITER}${version}`
      if (!cacheData.peers) return
      cacheData.peers[key] = peers
    },
    save: async () => {
      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData))
    },
    log: (peers?: boolean) => {
      const cacheCount = cacheHits.size
      if (cacheCount === 0) return

      print(
        options,
        `\nUsing ${cacheCount} cached package ${peers ? 'peer' : 'version'}${cacheCount > 1 ? 's' : ''}`,
        'warn',
      )
      print(options, cacheHits, 'verbose')
      cacheHits.clear()
    },
  } satisfies Cacher
}
