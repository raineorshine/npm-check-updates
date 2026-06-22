import fs from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import { type PackageManagerName } from '../../src/types/PackageManagerName'
import { runNcuCli } from './runNcuCli'

/**
 * Windows terminal environments (like Git-Bash) often render different column padding
 * than Linux, resulting in multiple spaces between the name and version.
 * We use Regex with \s+ to ensure the test passes regardless of whitespace count.
 *
 * Converts a string into a RegExp that handles version arrows and spacing.
 * Escapes dots for literal matching and replaces spaces with \s+.
 */
export function createNcuRegExp(input: string): RegExp {
  // 1. Escape special regex characters (like dots in 1.0.0)
  // 2. Replace spaces with \s+ for flexible matching
  const pattern = input
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Standard escape for regex
    .replace(/ /g, '\\s+') // Replace literal space with \s+

  return new RegExp(pattern, 'i')
}

/** Assertions for npm or yarn when tests pass. */
export const testPass = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('upgrade dependencies when tests pass', async function () {
    const cwd = await sandbox.createTestFolder('doctor/pass')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(
      cwd,
      packageManager === 'yarn'
        ? 'yarn.lock'
        : packageManager === 'pnpm'
          ? 'pnpm-lock.yaml'
          : packageManager === 'bun'
            ? 'bun.lockb'
            : 'package-lock.json',
    )

    // touch yarn.lock
    // yarn.lock is necessary otherwise yarn sees the package.json in the npm-check-updates directory and throws an error.
    if (packageManager === 'yarn' || packageManager === 'bun') {
      await fs.writeFile(lockfilePath, '')
    }

    // explicitly set packageManager to avoid auto yarn detection
    const { stdout } = await runNcuCli(['--doctor', '-u', '-p', packageManager], { rejectOnError: false, cwd })

    const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

    // stdout should include normal output
    stripAnsi(stdout).should.containIgnoreCase('Tests pass')
    stripAnsi(stdout).should.containIgnoreCase('ncu-test-v2  ~1.0.0  →  ~2.0.0')

    // package file should include upgrades
    pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
  })
}

/** Assertions for npm or yarn when tests fail. */
export const testFail = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('identify broken upgrade', async function () {
    const cwd = await sandbox.createTestFolder('doctor/fail')
    const pkgPath = path.join(cwd, 'package.json')
    const lockfilePath = path.join(
      cwd,
      packageManager === 'yarn'
        ? 'yarn.lock'
        : packageManager === 'pnpm'
          ? 'pnpm-lock.yaml'
          : packageManager === 'bun'
            ? 'bun.lockb'
            : 'package-lock.json',
    )

    // touch yarn.lock (see fail/README)
    if (packageManager === 'yarn') {
      await fs.writeFile(lockfilePath, '')
    }

    // explicitly set packageManager to avoid auto yarn detection
    const { stdout, stderr } = await runNcuCli(['--doctor', '-u', '-p', packageManager], { rejectOnError: false, cwd })

    const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

    const testVersion = createNcuRegExp('ncu-test-return-version ~1.0.0 →')
    const testV2 = createNcuRegExp('ncu-test-v2 ~1.0.0 →')
    const emitter = createNcuRegExp('emitter20 1.0.0 →')

    // stdout should include successful upgrades
    stdout.should.match(testV2)
    stdout.should.not.match(testVersion)
    stdout.should.match(emitter)

    // stderr should include first failing upgrade
    stderr.should.containIgnoreCase('Breaks with v2.x')
    stderr.should.not.match(testV2)
    stderr.should.match(testVersion)
    stderr.should.not.match(emitter)

    // package file should only include successful upgrades
    pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.containIgnoreCase('"ncu-test-return-version": "~1.0.0"')
    pkgUpgraded.should.not.include('"emitter20": "1.0.0"')
  })
}
