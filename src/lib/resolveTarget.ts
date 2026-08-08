import { parseRange } from 'semver-utils'
import { type Options } from '../types/Options.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'

/** Resolves the target and dist-tag for a dependency. The target option may be a function of the package name and range. */
const resolveTarget = (name: string, versionSpec: VersionSpec, options: Options): [string, string] => {
  const target = options.target || 'latest'
  const targetString = typeof target === 'string' ? target : target(name, parseRange(versionSpec))
  return targetString.startsWith('@') ? ['distTag', targetString.slice(1)] : [targetString, 'latest']
}

export default resolveTarget
