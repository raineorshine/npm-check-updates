import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { expect, it } from 'vitest'
import { type PackageManagerName } from '../../src/types/PackageManagerName.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../../build/cli.js')
const doctorTests = path.join(__dirname, '../test-data/doctor')

/** Run the ncu CLI. */
const ncu = async (
  args: string[],
  spawnPleaseOptions?: Parameters<typeof spawn>[2],
  spawnOptions?: Parameters<typeof spawn>[3],
) => {
  const { stdout } = await spawn('node', [bin, ...args], spawnPleaseOptions, spawnOptions)
  return stdout
}

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
    .replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&') // Standard escape for regex
    .replaceAll(' ', '\\s+') // Replace literal space with \s+

  return new RegExp(pattern, 'i')
}

/** Assertions for npm or yarn when tests pass. */
export const testPass = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('upgrade dependencies when tests pass', async () => {
    const cwd = path.join(doctorTests, 'pass')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
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
    const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''

    // touch yarn.lock
    // yarn.lock is necessary otherwise yarn sees the package.json in the npm-check-updates directory and throws an error.
    if (packageManager === 'yarn' || packageManager === 'bun') {
      await fs.writeFile(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(
        ['--doctor', '-u', '-p', packageManager],
        {
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        },
        { cwd },
      )
    } catch {}

    const pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')

    // cleanup before assertions in case they fail
    await fs.writeFile(pkgPath, pkgOriginal)
    await fs.rm(nodeModulesPath, { recursive: true, force: true })
    await fs.rm(lockfilePath, { recursive: true, force: true })

    // delete yarn cache
    if (packageManager === 'yarn') {
      await fs.rm(path.join(cwd, '.yarn'), { recursive: true, force: true })
      await fs.rm(path.join(cwd, '.pnp.js'), { recursive: true, force: true })
    }

    // bun prints the run header to stderr instead of stdout
    if (packageManager === 'bun') {
      expect(stripAnsi(stderr)).toBe('$ echo Success\n\n$ echo Success\n\n')
    } else {
      stderr = stripAnsi(stderr).trim()
      if (stderr !== '') {
        expect(stderr).toBe(`> test
> echo Success



> test
> echo Success`)
      }
    }

    // stdout should include normal output
    expect(stripAnsi(stdout).toLowerCase()).toContain('tests pass')
    expect(stripAnsi(stdout).toLowerCase()).toContain('ncu-test-v2  ~1.0.0  →  ~2.0.0'.toLowerCase())

    // package file should include upgrades
    expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
  })
}

/** Assertions for npm or yarn when tests fail. */
export const testFail = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('identify broken upgrade', async () => {
    const cwd = path.join(doctorTests, 'fail')
    const pkgPath = path.join(cwd, 'package.json')
    const nodeModulesPath = path.join(cwd, 'node_modules')
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
    const pkgOriginal = await fs.readFile(path.join(cwd, 'package.json'), 'utf-8')
    let stdout = ''
    let stderr = ''
    let pkgUpgraded

    // touch yarn.lock (see fail/README)
    if (packageManager === 'yarn') {
      await fs.writeFile(lockfilePath, '')
    }

    try {
      // explicitly set packageManager to avoid auto yarn detection
      await ncu(
        ['--doctor', '-u', '-p', packageManager],
        {
          stdout: function (data: string) {
            stdout += data
          },
          stderr: function (data: string) {
            stderr += data
          },
        },
        { cwd },
      )
    } finally {
      pkgUpgraded = await fs.readFile(pkgPath, 'utf-8')
      await fs.writeFile(pkgPath, pkgOriginal)
      await fs.rm(nodeModulesPath, { recursive: true, force: true })
      await fs.rm(lockfilePath, { recursive: true, force: true })

      // delete yarn cache
      if (packageManager === 'yarn') {
        await fs.rm(path.join(cwd, '.yarn'), { recursive: true, force: true })
        await fs.rm(path.join(cwd, '.pnp.js'), { recursive: true, force: true })
      }
    }

    const testVersion = createNcuRegExp('ncu-test-return-version ~1.0.0 →')
    const testV2 = createNcuRegExp('ncu-test-v2 ~1.0.0 →')
    const emitter = createNcuRegExp('emitter20 1.0.0 →')

    // stdout should include successful upgrades
    expect(stdout).toMatch(testV2)
    expect(stdout).not.toMatch(testVersion)
    expect(stdout).toMatch(emitter)

    // stderr should include first failing upgrade
    expect(stderr.toLowerCase()).toContain('Breaks with v2.x'.toLowerCase())
    expect(stderr).not.toMatch(testV2)
    expect(stderr).toMatch(testVersion)
    expect(stderr).not.toMatch(emitter)

    // package file should only include successful upgrades
    expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-v2": "~2.0.0"'.toLowerCase())
    expect(pkgUpgraded.toLowerCase()).toContain('"ncu-test-return-version": "~1.0.0"'.toLowerCase())
    expect(pkgUpgraded).not.toContain('"emitter20": "1.0.0"')
  })
}
