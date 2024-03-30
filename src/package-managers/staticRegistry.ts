import memoize from 'fast-memoize'
import fetch from 'make-fetch-happen'
import fs from 'node:fs/promises'
import programError from '../lib/programError.js'
import { GetVersion } from '../types/GetVersion.js'
import { Options } from '../types/Options.js'
import { StaticRegistry } from '../types/StaticRegistry.js'
import { Version } from '../types/Version.js'

/** Returns true if a string is a url. */
const isUrl = (s: string) => (s && s.startsWith('http://')) || s.startsWith('https://')

/**
 * Returns a registry object given a valid file path or url.
 *
 * @param path
 * @returns a registry object
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

const registryMemoized = memoize(readStaticRegistry)

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
