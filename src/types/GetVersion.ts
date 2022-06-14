import { Options } from './Options'
import { Version } from './Version'

/** A function that gets a target version of a dependency. */
export type GetVersion = (packageName: string, currentVersion: Version, options?: Options) => Promise<Version | null>
