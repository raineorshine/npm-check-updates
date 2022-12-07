import { PackageFile } from '../types/PackageFile'

/** Describes package data plus it's filepath */
export interface PackageInfo {
  name: string
  pkg: PackageFile
  pkgFile: string // the raw file string
}
