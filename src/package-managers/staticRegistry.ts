import fs from 'fs'
import { GetVersion } from '../types/GetVersion'
import { Version } from '../types/Version'
import { Options } from '../types/Options'
import { StaticRegistry } from '../types/StaticRegistry'

let registry: StaticRegistry = {}

/**
 * Assigns static registry dependencies to variable given a valid path
 *
 * @param path
 * @returns
 */
const initializeRegistry = (path: string | undefined): void => {
  if (path === undefined || !fs.existsSync(path)) {
    throw new Error('No or invalid path to static registry was provided. Please try again')
  }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'))
  registry = { ...registry, ...data }
}
/**
 * Fetches the version in static registry.
 *
 * @param packageName
 * @param currentVersion
 * @param options
 * @returns A promise that fulfills to string value or null
 */
export const latest: GetVersion = (packageName: string, currentVersion: Version, options: Options = {}) => {
  if (Object.keys(registry).length === 0) {
    initializeRegistry(options.registry)
  }
  return Promise.resolve(registry[packageName] || null)
}
