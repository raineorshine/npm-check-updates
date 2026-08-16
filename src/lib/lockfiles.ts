import { type PackageManagerName } from '../types/PackageManagerName.ts'

/**
 * The lockfiles each package manager writes. Order matters: it is the order findLockfile probes
 * them in, and the first entry is the lockfile doctor mode assumes when none exists yet.
 */
const lockfilesByPackageManager = {
  npm: ['package-lock.json'],
  yarn: ['yarn.lock'],
  pnpm: ['pnpm-lock.yaml'],
  deno: ['deno.json', 'deno.jsonc'],
  bun: ['bun.lock', 'bun.lockb'],
} satisfies Partial<Record<PackageManagerName, string[]>>

/** Every known lockfile name, in the order they are probed. */
export const lockfileNames: string[] = Object.values(lockfilesByPackageManager).flat()

/** Returns the package manager that owns a lockfile, or null if the name is not a known lockfile. */
export function packageManagerForLockfile(filename: string): PackageManagerName | null {
  for (const [packageManager, lockfiles] of Object.entries(lockfilesByPackageManager)) {
    if ((lockfiles as string[]).includes(filename)) return packageManager as PackageManagerName
  }
  return null
}

/** Returns the lockfile a package manager writes by default. */
export function defaultLockfile(packageManager: PackageManagerName | undefined): string {
  const lockfiles = lockfilesByPackageManager[packageManager as keyof typeof lockfilesByPackageManager]
  return lockfiles?.[0] ?? lockfilesByPackageManager.npm[0]
}
