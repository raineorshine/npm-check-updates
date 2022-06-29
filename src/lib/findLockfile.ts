import fs from 'fs'
import path from 'path'
import { print } from '../logging'
import { Options } from '../types/Options'

/**
 * Goes up the filesystem tree until it finds a package-lock.json or yarn.lock.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 * @returns The path of the directory that contains the lockfile and the
 * filename of the lockfile.
 */
export default function findLockfile(
  options: Pick<Options, 'cwd' | 'packageFile'>,
  readdirSync: (_path: string) => string[] = fs.readdirSync,
): { directoryPath: string; filename: string } | undefined {
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

      if (files.includes('package-lock.json')) {
        return { directoryPath: currentPath, filename: 'package-lock.json' }
      }

      if (files.includes('yarn.lock')) {
        return { directoryPath: currentPath, filename: 'yarn.lock' }
      }

      const newPath = path.resolve(currentPath, '..')
      if (newPath === currentPath) break

      currentPath = newPath
    }
  } catch (e) {
    print(options, `Encountered error while determining package manager: ${e}`, 'warn', 'warn')
  }

  return undefined
}
