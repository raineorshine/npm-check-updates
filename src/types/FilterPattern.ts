import { type FilterFunction } from './FilterFunction.ts'

/** Supported patterns for the `--filter` and `--reject` options. */
export type FilterPattern = string | RegExp | readonly (string | RegExp)[] | FilterFunction
