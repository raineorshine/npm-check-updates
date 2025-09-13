import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { Options } from '../types/Options'

const lockFileNames = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'deno.json',
  'deno.jsonc',
  'bun.lock',
  'bun.lockb',
]

/**
 * Goes up the filesystem tree until it finds a package-lock.json, yarn.lock, pnpm-lock.yaml, deno.json, deno.jsonc, or bun.lockb file.
 *
 * @param readdir This is only a parameter so that it can be used in tests.
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

    // Resolve starting path to absolute path
    currentPath = path.resolve(currentPath)
    const startingPath = currentPath

    // Get boundaries to stop searching - don't go beyond home directory or temp directories
    const homeDir = os.homedir()
    const tempDir = os.tmpdir()

    let levelsTraversed = 0
    const maxLevels = 10 // Safety limit to prevent excessive traversal

    while (true) {
      const files = await readdir(currentPath)

      for (const filename of lockFileNames) {
        if (files.includes(filename)) {
          // Additional check: if we found a lockfile in temp directory or too far from start,
          // and the starting path looks like a temporary directory, be more restrictive
          if (startingPath.includes(tempDir) && levelsTraversed > 2) {
            // Don't use lockfiles found too far up from temporary directories
            continue
          }

          return { directoryPath: currentPath, filename }
        }
      }

      const pathParent = path.resolve(currentPath, '..')

      // Stop conditions:
      // 1. Reached filesystem root
      if (pathParent === currentPath) break

      // 2. Reached home directory (don't search beyond user's home)
      if (pathParent === homeDir || currentPath === homeDir) break

      // 3. Safety limit on traversal levels
      if (levelsTraversed >= maxLevels) break

      currentPath = pathParent
      levelsTraversed++
    }
  } catch (e) {
    // if readdirSync fails, return null
  }

  return null
}
