import fs from 'fs'
import { GetVersion } from '../types/GetVersion'
import { Version } from '../types/Version'
import { Options } from '../types/Options'
import { StaticRegistry } from '../types/StaticRegistry'

const registry: StaticRegistry = {}

const initializeRegistry = (path: string | undefined): void => {
  if (path == undefined || !fs.existsSync(path)) {
    throw new Error('No or invalid path to static registry was provided. Please try again')
  }
  const rawdata = fs.readFileSync(path, 'utf8')
  Object.assign(registry, JSON.parse(rawdata))
}

export const latest: GetVersion = (packageName: string, currentVersion: Version, options: Options = {}) => {
  console.log('foo ', options.registry)
  console.log(registry)
  if (Object.keys(registry).length == 0) {
    initializeRegistry(options.registry)
  }
  return Promise.resolve(registry[packageName] || null)
}
