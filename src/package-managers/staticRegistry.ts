import fs from 'fs/promises'
import memoize from 'memoize'
import programError from '../lib/programError'
import { type GetVersion } from '../types/GetVersion'
import { type Options } from '../types/Options'
import { type StaticRegistry } from '../types/StaticRegistry'
import { type Version } from '../types/Version'

/** Returns true if a string is a url. */
const isUrl = (s: string) => (s && s.startsWith('http://')) || s.startsWith('https://')

/**
 * Returns a registry object given a valid file path or url.
 */
const readStaticRegistry = async (options: Options): Promise<StaticRegistry> => {
  const path = options.registry!
  let content: string

  // url
  if (isUrl(path)) {
    const body = await fetch(path)
    content = await body.text()
  }
  // local path
  else {
    try {
      content = await fs.readFile(path, 'utf8')
    } catch (err) {
      programError(options, `\nThe specified static registry file does not exist: ${options.registry}`)
    }
  }

  return JSON.parse(content)
}

/**
 * Memoized version of readStaticRegistry.
 * Uses a selective cacheKey to ensure we only re-fetch if the
 * registry path/URL itself changes.
 */
const registryMemoized = memoize(readStaticRegistry, {
  cacheKey: ([options]) => options.registry,
})

/**
 * Fetches the version in static registry.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns A promise that fulfills to string value or null
 */
export const latest: GetVersion = async (packageName: string, currentVersion: Version, options?: Options) => {
  const registry: StaticRegistry = await registryMemoized(options || {})
  return { version: registry[packageName] || null }
}
