import fs from 'fs/promises'
import { type Options } from '../types/Options'
import { type PackageFile } from '../types/PackageFile'
import { type PackageInfo } from '../types/PackageInfo'
import programError from './programError'

/** Load and parse a package file. */
const loadPackageInfoFromFile = async (options: Options, filepath: string): Promise<PackageInfo> => {
  let pkg: PackageFile, pkgFile: string

  // assert package.json
  try {
    pkgFile = await fs.readFile(filepath, 'utf-8')
    pkg = JSON.parse(pkgFile)
  } catch (e) {
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
