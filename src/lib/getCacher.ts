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

/**
 * The cacher stores key (name + version) - value (new version) pairs
 * for quick updates across `ncu` calls.
 *
 * @returns
 */
export default function getCacher(options: Omit<Options, 'cacher'>): Cacher | undefined {
  if (!options.cache) {
    return
  }

  const file = options.cacheFile
  if (!file) {
    return
  }
  const cacheFile = file === defaultCacheFile ? resolvedDefaultCacheFile : file
  let cacheData: CacheData = {}
  let cacheUsed: string[] = []

  try {
    cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))

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
    key: (name, version) => name + '@' + version,
    get: key => {
      if (!key || !cacheData.packages) return
      const cached = cacheData.packages[key]
      if (cached) {
        cacheUsed = [...cacheUsed, key + `: ${cached}`]
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
      if (cacheUsed.length === 0) return

      const message = '\nUsing cached package versions'

      if (options.loglevel === 'verbose') {
        print(options, message + ':', 'verbose')
        cacheUsed.forEach(cache => print(options, `  ${cache}`, 'verbose'))
      } else {
        print(options, message, 'warn')
      }
    },
  } as Cacher
}
