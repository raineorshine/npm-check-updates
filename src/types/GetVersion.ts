import { type NpmConfig } from './NpmConfig.ts'
import { type Options } from './Options.ts'
import { type Version } from './Version.ts'
import { type VersionResult } from './VersionResult.ts'

/** A function that gets a target version of a dependency. */
export type GetVersion = (
  packageName: string,
  currentVersion: Version,
  options?: Options,
  npmConfig?: NpmConfig,
  npmConfigProject?: NpmConfig,
  caller?: 'distTag' | 'latest',
) => Promise<VersionResult>
