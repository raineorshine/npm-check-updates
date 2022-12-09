import fs from 'fs/promises'
import { Options } from '../types/Options'
import { PackageManagerName } from '../types/PackageManagerName'
import findLockfile from './findLockfile'

const defaultPackageManager = 'npm'

/**
 * If the packageManager option was not provided, look at the lockfiles to
 * determine which package manager is being used.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
const determinePackageManager = async (
  options: Options,
  readdir: (_path: string) => Promise<string[]> = fs.readdir,
): Promise<PackageManagerName> => {
  if (options.packageManager) return options.packageManager
  else if (options.global) return defaultPackageManager

  const lockfileName = (await findLockfile(options, readdir))?.filename

  return lockfileName === 'package-lock.json'
    ? 'npm'
    : lockfileName === 'yarn.lock'
    ? 'yarn'
    : lockfileName === 'pnpm-lock.yaml'
    ? 'pnpm'
    : defaultPackageManager
}

export default determinePackageManager
