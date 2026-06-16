import { type PackageFile } from './PackageFile.ts'

/** Describes package data plus it's filepath */
export interface PackageInfo {
  name?: string
  pkg: PackageFile
  pkgFile: string // the raw file string
  filepath: string
}
