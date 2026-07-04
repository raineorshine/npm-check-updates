import { type TargetFunction } from './TargetFunction.ts'

/** Valid strings for the `--target` option. Indicates the desired version to upgrade to. */
export const supportedVersionTargets = ['latest', 'newest', 'greatest', 'minor', 'patch', 'semver'] as const

/** A union of supported version target strings. */
export type TargetString = (typeof supportedVersionTargets)[number]

/** Upgrade to a specific distribution tag by passing an @-prefixed value to the `--target` option. */
export type TargetDistTag = `@${string}`

/** The type of the `--target` option. Specifies the range from which to select the version to upgrade to. */
export type Target = TargetString | TargetDistTag | TargetFunction
