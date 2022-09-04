import fs from 'fs'
import os from 'os'
import path from 'path'
import { CacheData, Cacher } from '../types/Cacher'
import { Options } from '../types/Options'
import { print } from './logging'

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
const cacheKeyDivider = '###'

/**
 * The cacher stores key (name + version) - value (new version) pairs
 * for quick updates across `ncu` calls.
 *
 * @returns
 */
export default async function getCacher(options: Omit<Options, 'cacher'>): Promise<Cacher | undefined> {
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
      fs.promises.rm(cacheFile)
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
    key: (name, version) => name + cacheKeyDivider + version,
    get: key => {
      if (!key || !cacheData.packages) return
      const cached = cacheData.packages[key]
      if (cached && !key.includes(cached)) {
        const [name] = key.split(cacheKeyDivider)
        cacheUpdates[name] = cached
      }
      return cached
    },
    set: (key, value) => {
      if (!key || !cacheData.packages) return
      cacheData.packages[key] = value
    },
    save: async () => {
      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData))
    },
    log: () => {
      const cacheCount = Object.keys(cacheUpdates).length
      if (cacheCount === 0) return

      const message = `\nUsing ${cacheCount} cached package versions`

      if (options.loglevel === 'verbose') {
        print(options, message + ':', 'verbose')
        print(options, cacheUpdates, 'verbose')
      } else {
        print(options, message, 'warn')
      }
    },
  } as Cacher
}
