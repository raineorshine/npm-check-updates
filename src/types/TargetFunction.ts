import { SemVer } from 'semver-utils'

/** A function that can be provided to the --target option for custom filtering. */
export type TargetFunction = (packageName: string, versionRange: SemVer[]) => string
