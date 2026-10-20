import { type Index } from '../types/IndexType.ts'
import { type Options } from '../types/Options.ts'
import { type VersionSpec } from '../types/VersionSpec.ts'

/**
 * Returns the names of every package the project lists, including those left out of the upgrade by --dep, --filter or
 * --reject, since the package manager installs them all. A peer among them is not followed transitively.
 */
const listedDependencies = (current: Index<VersionSpec>, options: Options): string[] => [
  ...new Set([...Object.keys(current), ...(options.listedPackages ?? [])]),
]

export default listedDependencies
