import { type SemVer } from './SemVer.ts'

/** Supported function for the `--filter` and `--reject` options. */
export type FilterFunction = (packageName: string, versionRange: SemVer[]) => boolean
