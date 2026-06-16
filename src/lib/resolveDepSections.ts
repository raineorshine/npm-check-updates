import { cliOptionsMap } from '../cli-options.ts'
import { type Index } from '../types/IndexType.ts'
import { type PackageFile } from '../types/PackageFile.ts'

// dependency section aliases that will be resolved to the full name
const depAliases: Index<keyof PackageFile> = {
  dev: 'devDependencies',
  peer: 'peerDependencies',
  prod: 'dependencies',
  optional: 'optionalDependencies',
}

/** Gets a list of dependency sections based on options.dep. */
const resolveDepSections = (dep?: string | readonly string[]): (keyof PackageFile)[] => {
  // parse dep string and set default
  const depOptions: string[] = dep ? (typeof dep === 'string' ? dep.split(',') : dep) : cliOptionsMap.dep.default

  // map the dependency section option to a full dependency section name
  const depSections = depOptions.map(name => depAliases[name] || name)

  return depSections
}

export default resolveDepSections
