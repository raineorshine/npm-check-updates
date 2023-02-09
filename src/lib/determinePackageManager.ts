import fs from 'fs/promises'
import { Index } from '../types/IndexType'
import { Options } from '../types/Options'
import { PackageManagerName } from '../types/PackageManagerName'
import findLockfile from './findLockfile'

// map lockfiles to package managers
const packageManagerLockfileMap: Index<PackageManagerName> = {
  'package-lock': 'npm',
  yarn: 'yarn',
  'pnpm-lock': 'pnpm',
  deno: 'deno',
}

/**
 * If the packageManager option was not provided, look at the lockfiles to
 * determine which package manager is being used.
 */
const determinePackageManager = async (
  options: Options,
  // only for testing
  readdir: (_path: string) => Promise<string[]> = fs.readdir,
): Promise<PackageManagerName> => {
  if (options.packageManager) return options.packageManager
  else if (options.global) return 'npm'

  const lockfileName = (await findLockfile(options, readdir))?.filename
  return lockfileName ? packageManagerLockfileMap[lockfileName.split('.')[0]] : 'npm'
}

export default determinePackageManager
