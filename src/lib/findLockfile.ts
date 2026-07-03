import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type Options } from '../types/Options.ts'

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
 * Goes up the filesystem tree until it finds a lock file. (e.g. "package-lock.json", "yarn.lock", etc.)
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
    // Get boundaries to stop searching.
    const homeDir = os.homedir()
    const tempDir = os.tmpdir()

    // 1. explicit cwd
    // 2. same directory as package file
    // 3. current directory
    let currentPath = options.cwd ? options.cwd : options.packageFile ? path.dirname(options.packageFile) : '.'
    currentPath = path.resolve(currentPath)

    while (true) {
      const files = await readdir(currentPath)

      for (const filename of lockFileNames) {
        if (files.includes(filename)) {
          return { directoryPath: currentPath, filename }
        }
      }

      const pathParent = path.resolve(currentPath, '..')
      // Stop at the root of the file system, the user's home directory, or the temporary directory.
      if ([currentPath, homeDir, tempDir].includes(pathParent)) {
        break
      }

      currentPath = pathParent
    }
  } catch (e) {
    // if readdirSync fails, return null
  }

  return null
}
