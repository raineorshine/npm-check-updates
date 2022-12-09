import { PackageFile } from '../types/PackageFile'

/** Describes package data plus it's filepath */
export interface PackageInfo {
  pkg: PackageFile
  pkgFile: string
}
