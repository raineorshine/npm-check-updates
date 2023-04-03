import { NpmConfig } from './NpmConfig'
import { Options } from './Options'
import { Version } from './Version'
import { VersionResult } from './VersionResult'

/** A function that gets a target version of a dependency. */
export type GetVersion = (
  packageName: string,
  currentVersion: Version,
  options?: Options,
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
) => Promise<VersionResult>
