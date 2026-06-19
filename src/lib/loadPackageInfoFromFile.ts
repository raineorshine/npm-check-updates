import fs from 'node:fs/promises'
import { type Options } from '../types/Options.ts'
import { type PackageFile } from '../types/PackageFile.ts'
import { type PackageInfo } from '../types/PackageInfo.ts'
import programError from './programError.ts'

/** Load and parse a package file. */
const loadPackageInfoFromFile = async (options: Options, filepath: string): Promise<PackageInfo> => {
  let pkg: PackageFile, pkgFile: string

  // assert package.json
  try {
    pkgFile = await fs.readFile(filepath, 'utf-8')
    pkg = JSON.parse(pkgFile)
  } catch {
    programError(options, `Missing or invalid ${filepath}`)
  }

  return {
    name: undefined, // defined by workspace code only
    pkg,
    pkgFile,
    filepath,
  }
}

export default loadPackageInfoFromFile
