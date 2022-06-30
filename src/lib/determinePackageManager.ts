import fs from 'fs'
import { Options } from '../types/Options'
import findLockfile from './findLockfile'

const defaultPackageManager = 'npm'

/**
 * If the packageManager option was not provided, look at the lockfiles to
 * determine which package manager is being used.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
export default function determinePackageManager(
  options: Options,
  readdirSync: (_path: string) => string[] = fs.readdirSync,
): string {
  if (options.packageManager) return options.packageManager
  if (options.global) return defaultPackageManager

  const lockfileName = findLockfile(options, readdirSync)?.filename

  if (lockfileName === 'package-lock.json') return 'npm'
  if (lockfileName === 'yarn.lock') return 'yarn'

  return defaultPackageManager
}
