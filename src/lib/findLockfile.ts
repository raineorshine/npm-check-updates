import fs from 'fs/promises'
import path from 'path'
import { Options } from '../types/Options'

/**
 * Goes up the filesystem tree until it finds a package-lock.json or yarn.lock.
 *
 * @param readdirSync This is only a parameter so that it can be used in tests.
 * @returns The path of the directory that contains the lockfile and the
 * filename of the lockfile.
 */
export default async function findLockfile(
  options: Pick<Options, 'cwd' | 'packageFile'>,
  readdir: (_path: string) => Promise<string[]> = fs.readdir,
): Promise<{ directoryPath: string; filename: string } | null> {
  try {
    // 1. explicit cwd
    // 2. same directory as package file
    // 3. current directory
    let currentPath = options.cwd ? options.cwd : options.packageFile ? path.dirname(options.packageFile) : '.'

    // eslint-disable-next-line fp/no-loops
    while (true) {
      const files = await readdir(currentPath)

      if (files.includes('package-lock.json')) {
        return { directoryPath: currentPath, filename: 'package-lock.json' }
      } else if (files.includes('yarn.lock')) {
        return { directoryPath: currentPath, filename: 'yarn.lock' }
      } else if (files.includes('pnpm-lock.yaml')) {
        return { directoryPath: currentPath, filename: 'pnpm-lock.yaml' }
      }

      const pathParent = path.resolve(currentPath, '..')
      if (pathParent === currentPath) break

      currentPath = pathParent
    }
  } catch (e) {
    // if readdirSync fails, return null
  }

  return null
}
