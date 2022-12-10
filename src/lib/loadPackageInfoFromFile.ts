import fs from 'fs/promises'
import { PackageFile } from '../types/PackageFile'
import { PackageInfo } from '../types/PackageInfo'

/** Load and parse a package file. */
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

export default loadPackageInfoFromFile
