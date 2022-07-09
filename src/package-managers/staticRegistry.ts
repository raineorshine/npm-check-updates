import memoize from 'fast-memoize'
import fs from 'fs/promises'
import { GetVersion } from '../types/GetVersion'
import { Options } from '../types/Options'
import { StaticRegistry } from '../types/StaticRegistry'
import { Version } from '../types/Version'

/**
 * Returns registry object given a valid path
 *
 * @param path
 * @returns a registry object
 */
const readStaticRegistry = async (path: string): Promise<StaticRegistry> => JSON.parse(await fs.readFile(path, 'utf8'))

const registryMemoized = memoize(readStaticRegistry)

/**
 * Fetches the version in static registry.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns A promise that fulfills to string value or null
 */
export const latest: GetVersion = async (packageName: string, currentVersion: Version, options: Options = {}) => {
  const registry: { [key: string]: string } = await registryMemoized(options.registry!)
  return registry[packageName] || null
}
