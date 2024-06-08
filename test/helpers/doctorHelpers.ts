import fs from 'fs/promises'
import path from 'path'
import spawn from 'spawn-please'
import { PackageManagerName } from '../../src/types/PackageManagerName'

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

/** Assertions for npm or yarn when tests pass. */
export const testPass = ({ packageManager }: { packageManager: PackageManagerName }) => {
  it('upgrade dependencies when tests pass', async function () {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
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
    } catch (e) {}

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
      stripAnsi(stderr).should.equal('$ echo Success\n\n$ echo Success\n\n')
    } else {
      const [nodeMajorVersion] = process.versions.node.split('.').map(Number)
      stderr = stderr.trim()
      if (nodeMajorVersion === 18 && stderr !== '') {
        stripAnsi(stderr).should.equal(`> test
> echo Success



> test
> echo Success`)
      } else {
        stderr.should.equal('')
      }
    }

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

    // stdout should include successful upgrades
    stdout.should.containIgnoreCase('ncu-test-v2 ~1.0.0 →')
    stdout.should.not.include('ncu-test-return-version ~1.0.0 →')
    stdout.should.containIgnoreCase('emitter20 1.0.0 →')

    // stderr should include first failing upgrade
    stderr.should.containIgnoreCase('Breaks with v2.x')
    stderr.should.not.include('ncu-test-v2 ~1.0.0 →')
    stderr.should.containIgnoreCase('ncu-test-return-version ~1.0.0 →')
    stderr.should.not.include('emitter20 1.0.0 →')

    // package file should only include successful upgrades
    pkgUpgraded.should.containIgnoreCase('"ncu-test-v2": "~2.0.0"')
    pkgUpgraded.should.containIgnoreCase('"ncu-test-return-version": "~1.0.0"')
    pkgUpgraded.should.not.include('"emitter20": "1.0.0"')
  })
}
