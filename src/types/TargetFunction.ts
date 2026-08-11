import { type SemVer } from 'semver-utils'

/** A function that can be provided to the `--target` option to determine a custom target per package. */
export type TargetFunction = (packageName: string, versionRange: SemVer[]) => string
