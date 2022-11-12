import fs from 'fs'
import os from 'os'
import path from 'path'
import { CacheData, Cacher } from '../types/Cacher'
import { Options } from '../types/Options'
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

/** Resolve the cache file path based on os/homedir */
export function resolveCacheFile(optionsCacheFile: string) {
  return optionsCacheFile === defaultCacheFile ? resolvedDefaultCacheFile : optionsCacheFile
}

/** Remove the default cache file. */
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

  const cacheFile = options.cacheFile === defaultCacheFile ? resolvedDefaultCacheFile : options.cacheFile
  let cacheData: CacheData = {}
  const cacheUpdates: Record<string, string> = {}

  try {
    cacheData = JSON.parse(await fs.promises.readFile(cacheFile, 'utf-8'))

    const expired = checkCacheExpiration(cacheData, options.cacheExpiration)
    if (expired) {
      // reset cache
      fs.promises.rm(cacheFile, { force: true })
      cacheData = {}
    }
  } catch (error) {
    // ignore file read/parse/remove errors
  }

  if (typeof cacheData.timestamp !== 'number') {
    cacheData.timestamp = Date.now()
  }
  if (!cacheData.packages) {
    cacheData.packages = {}
  }

  return {
    get: (name: string, target: string) => {
      const key = `${name}${CACHE_DELIMITER}${target}`
      if (!key || !cacheData.packages) return
      const cached = cacheData.packages[key]
      if (cached && !key.includes(cached)) {
        const [name] = key.split(CACHE_DELIMITER)
        cacheUpdates[name] = cached
      }
      return cached
    },
    set: (name: string, target: string, version: string) => {
      const key = `${name}${CACHE_DELIMITER}${target}`
      if (!key || !cacheData.packages) return
      cacheData.packages[key] = version
    },
    save: async () => {
      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData))
    },
    log: () => {
      const cacheCount = Object.keys(cacheUpdates).length
      if (cacheCount === 0) return

      print(options, `\nUsing ${cacheCount} cached package versions`, 'warn')
      print(options, cacheUpdates, 'verbose')
    },
  } as Cacher
}
