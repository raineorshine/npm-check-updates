import { type PackageFile } from './PackageFile.ts'

/** Describes package data plus its filepath. */
export interface PackageInfo {
  name?: string
  pkg: PackageFile
  pkgFile: string // the raw file string
  filepath: string
  /** True when this is a synthetic entry holding the catalog dependencies extracted from filepath. */
  catalog?: boolean
}
