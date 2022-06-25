import fs from 'fs'
import path from 'path'
import { print } from '../logging'
import { Options } from '../types/Options'

const defaultPackageManager = 'npm'

/**
 * If the packageManager option was not provided, look at the lockfiles to
 * determine which package manager is being used.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 */
export function determinePackageManager(
  options: Options,
  readdirSync: (_path: string) => string[] = fs.readdirSync,
): string {
  if (options.packageManager) return options.packageManager
  if (options.global) return defaultPackageManager

  try {
    let currentPath: string

    if (options.cwd) {
      currentPath = options.cwd
    } else if (options.packageFile) {
      currentPath = path.dirname(options.packageFile)
    } else {
      currentPath = '.'
    }

    // eslint-disable-next-line fp/no-loops
    while (true) {
      const files = readdirSync(currentPath)

      if (files.includes('package-lock.json')) return 'npm'
      if (files.includes('yarn.lock')) return 'yarn'

      const newPath = path.resolve(currentPath, '..')
      if (newPath === currentPath) break

      currentPath = newPath
    }
  } catch (e) {
    print(options, `Encountered error while determining package manager: ${e}`, 'verbose', 'warn')
  }

  return defaultPackageManager
}
