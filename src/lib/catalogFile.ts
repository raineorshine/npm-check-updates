import path from 'node:path'
import { type Index } from '../types/IndexType.ts'
import { type Maybe } from '../types/Maybe.ts'

// The file that holds a package manager's catalog definitions. Managers not listed here (bun, npm)
// declare catalogs in the package file itself.
const catalogFiles: Index<string> = {
  pnpm: 'pnpm-workspace.yaml',
  yarn: '.yarnrc.yml',
}

/** Returns the catalog file name for a package manager, or null when catalogs live in the package file. */
export const catalogFileFor = (packageManager: Maybe<string>): string | null =>
  (packageManager && catalogFiles[packageManager]) || null

/** Returns true if the path is a package manager's dedicated catalog file. */
export const isCatalogFile = (filePath: string): boolean =>
  Object.values(catalogFiles).includes(path.basename(filePath))
