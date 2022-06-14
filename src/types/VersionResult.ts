import { Version } from './Version'

/** The result of fetching a version from the package manager, which may include an error. Used to pass errors back up the call chain for better reporting. */
export interface VersionResult {
  version?: Version | null
  error?: string
}
