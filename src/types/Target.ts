import { TargetFunction } from './TargetFunction'


/** Valid strings for the --target option. Indicates the desired version to upgrade to. */
type TargetString = 'latest' | 'newest' | 'greatest' | 'minor' | 'patch'

/** Upgrading to specific distribution tags can be done by passing @-starting value to --target option. */
export type TargetDistTag = `@${string}`

/** The type of the --target option. Specifies the range from which to select the version to upgrade to. */
export type Target = TargetString | TargetDistTag | TargetFunction
