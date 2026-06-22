import fs from 'fs/promises'
import path from 'node:path'
import { type Options } from '../types/Options'
import { type PackageFile } from '../types/PackageFile'
import { type PackageInfo } from '../types/PackageInfo'
import programError from './programError'

/** Load and parse a package file. */
const loadPackageInfoFromFile = async (options: Options, filepath: string): Promise<PackageInfo> => {
  let pkg: PackageFile, pkgFile: string

  const fullpath = path.resolve(options.cwd || process.cwd(), filepath)

  // assert package.json
  try {
    pkgFile = await fs.readFile(fullpath, 'utf-8')
    pkg = JSON.parse(pkgFile)
  } catch (e) {
    programError(options, `Missing or invalid ${filepath}`)
  }

  return {
    name: undefined, // defined by workspace code only
    pkg,
    pkgFile,
    filepath: !options.cwd ? filepath : fullpath.replace(/\\/g, '/'),
  }
}

export default loadPackageInfoFromFile
