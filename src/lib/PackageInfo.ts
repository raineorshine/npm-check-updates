import fs from 'fs/promises'
import { PackageFile } from '../types/PackageFile'

/** Describes package data plus it's filepath */
export interface PackageInfo {
  name?: string
  pkg: PackageFile
  pkgFile: string // the raw file string
  filepath: string
}

/** Load package file. */
const loadPackageInfoFromFile = async (filepath: string): Promise<PackageInfo> => {
  let pkg: PackageFile, pkgFile: string

  // assert package.json
  try {
    pkgFile = await fs.readFile(filepath, 'utf-8')
    pkg = JSON.parse(pkgFile)
  } catch (e) {
    throw new Error(`Missing or invalid file '${filepath}'`)
  }

  return {
    name: undefined, // defined by workspace code only
    pkg,
    pkgFile,
    filepath,
  }
}

export { loadPackageInfoFromFile }
