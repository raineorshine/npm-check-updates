import { NpmConfig } from './NpmConfig.js'
import { Options } from './Options.js'
import { Version } from './Version.js'
import { VersionResult } from './VersionResult.js'

/** A function that gets a target version of a dependency. */
export type GetVersion = (
  packageName: string,
  currentVersion: Version,
  options?: Options,
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
) => Promise<VersionResult>
