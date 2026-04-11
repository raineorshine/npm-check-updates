import { type NpmConfig } from './NpmConfig'
import { type Options } from './Options'
import { type Version } from './Version'
import { type VersionResult } from './VersionResult'

/** A function that gets a target version of a dependency. */
export type GetVersion = (
  packageName: string,
  currentVersion: Version,
  options?: Options,
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
) => Promise<VersionResult>
