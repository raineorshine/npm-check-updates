import fs from 'fs/promises'
import { Options } from '../types/Options'
import findLockfile from './findLockfile'

const defaultPackageManager = 'npm'

/**
 * If the packageManager option was not provided, look at the lockfiles to
 * determine which package manager is being used.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
export default async function determinePackageManager(
  options: Options,
  readdir: (_path: string) => Promise<string[]> = fs.readdir,
): Promise<string> {
  if (options.packageManager) return options.packageManager
  if (options.global) return defaultPackageManager

  const lockfileName = (await findLockfile(options, readdir))?.filename

  if (lockfileName === 'package-lock.json') return 'npm'
  if (lockfileName === 'yarn.lock') return 'yarn'

  return defaultPackageManager
}
