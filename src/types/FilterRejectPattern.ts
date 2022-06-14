import { FilterFunction } from './FilterFunction'

/** Supported patterns for the --filter and --reject options. */
export type FilterRejectPattern = string | string[] | RegExp | RegExp[] | FilterFunction
