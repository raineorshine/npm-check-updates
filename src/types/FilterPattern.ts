import { FilterFunction } from './FilterFunction.js'

/** Supported patterns for the --filter and --reject options. */
export type FilterPattern = string | RegExp | (string | RegExp)[] | FilterFunction
