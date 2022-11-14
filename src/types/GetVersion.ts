import { NpmConfig } from './NpmConfig'
import { Options } from './Options'
import { Version } from './Version'

/** A function that gets a target version of a dependency. */
export type GetVersion = (
  packageName: string,
  currentVersion: Version,
  options?: Options,
  npmConfig?: NpmConfig,
) => Promise<Version | null>
