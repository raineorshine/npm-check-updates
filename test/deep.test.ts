import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import mergeOptions from '../src/lib/mergeOptions.ts'
import removeDir from './helpers/removeDir.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')
const srcBin = path.join(__dirname, '../src/bin/cli.ts')
const tsNodeBin = path.join(__dirname, `../node_modules/.bin/ts-node${process.platform === 'win32' ? '.CMD' : ''}`)

/** Returns the CLI invocation command and arguments, using the built binary if available, otherwise using ts-node. */
const getCliInvocation = (...args: string[]) =>
  fsSync.existsSync(bin) ? { command: 'node', args: [bin, ...args] } : { command: tsNodeBin, args: [srcBin, ...args] }

/** Creates a temp directory with nested package files for --deep testing. Returns the temp directory name (should be removed by caller).
 *
 * The file tree that is created is:
 * |- package.json
 * |- packages/
 * |  - sub1/
 * |    - package.json
 * |  - sub2/
 * |    - package.json
 */
const setupDeepTest = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  const pkgData = JSON.stringify({
    dependencies: {
      express: '1',
    },
  })

  // write root package file
  await fs.writeFile(path.join(tempDir, 'package.json'), pkgData, 'utf-8')

  // write sub-project package files
  await fs.mkdir(path.join(tempDir, 'packages/sub1'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/sub1/package.json'), pkgData, 'utf-8')
  await fs.mkdir(path.join(tempDir, 'packages/sub2'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/sub2/package.json'), pkgData, 'utf-8')

  return tempDir
}

/** Creates a temp directory with nested package files to test deep-mode status output formatting. */
const setupDeepStatusTest = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))

  await fs.writeFile(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      dependencies: {
        'ncu-test-v2': '99.9.9',
      },
    }),
    'utf-8',
  )

  await fs.mkdir(path.join(tempDir, 'packages/no-deps'), { recursive: true })
  await fs.writeFile(path.join(tempDir, 'packages/no-deps/package.json'), JSON.stringify({}), 'utf-8')

  return tempDir
}

describe('--deep', () => {
  let stub: { restore: () => void }
  beforeAll(() => (stub = stubVersions('99.9.9', { spawn: true })))
  afterAll(() => stub.restore())

  it('do not allow --packageFile and --deep together', async () => {
    await expect(ncu({ packageFile: './package.json', deep: true })).rejects.toThrow('Cannot specify both')
  })

  it('output json with --jsonAll', async () => {
    const tempDir = await setupDeepTest()
    try {
      const cli = getCliInvocation('--jsonAll', '--deep')
      const { stdout } = await spawn(cli.command, cli.args, {}, { cwd: tempDir })
      const deepJsonOut = JSON.parse(stdout)
      expect(deepJsonOut).toHaveProperty('package.json')
      expect(deepJsonOut).toHaveProperty('packages/sub1/package.json')
      expect(deepJsonOut).toHaveProperty('packages/sub2/package.json')
      expect(deepJsonOut['package.json'].dependencies).toHaveProperty('express')
      expect(deepJsonOut['packages/sub1/package.json'].dependencies).toHaveProperty('express')
      expect(deepJsonOut['packages/sub2/package.json'].dependencies).toHaveProperty('express')
    } finally {
      await removeDir(tempDir)
    }
  })

  it('ignore stdin if --packageFile glob is specified', async () => {
    const tempDir = await setupDeepTest()
    try {
      const cli = getCliInvocation('-u', '--packageFile', path.join(tempDir, '/**/package.json'))
      await spawn(
        cli.command,
        cli.args,
        { stdin: '{ "dependencies": {}}' },
        {
          cwd: tempDir,
        },
      )
      const upgradedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'))
      expect(upgradedPkg).toHaveProperty('dependencies')
      expect(upgradedPkg.dependencies).toHaveProperty('express')
      expect(upgradedPkg.dependencies.express).not.toBe('1')
    } finally {
      await removeDir(tempDir)
    }
  })

  it('update multiple packages', async () => {
    const tempDir = await setupDeepTest()
    try {
      const cli = getCliInvocation('-u', '--jsonUpgraded', '--packageFile', path.join(tempDir, '**/package.json'))
      const { stdout } = await spawn(cli.command, cli.args, { stdin: '{ "dependencies": {}}' }, { cwd: tempDir })

      const upgradedPkg1 = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/sub1/package.json'), 'utf-8'))
      expect(upgradedPkg1).toHaveProperty('dependencies')
      expect(upgradedPkg1.dependencies).toHaveProperty('express')
      expect(upgradedPkg1.dependencies.express).not.toBe('1')

      const upgradedPkg2 = JSON.parse(await fs.readFile(path.join(tempDir, 'packages/sub2/package.json'), 'utf-8'))
      expect(upgradedPkg2).toHaveProperty('dependencies')
      expect(upgradedPkg2.dependencies).toHaveProperty('express')
      expect(upgradedPkg2.dependencies.express).not.toBe('1')

      const json = JSON.parse(stdout)
      // Make sure to fix windows paths with replace
      expect(json).toHaveProperty(path.join(tempDir, 'packages/sub1/package.json').replaceAll('\\', '/'))
      expect(json).toHaveProperty(path.join(tempDir, 'packages/sub2/package.json').replaceAll('\\', '/'))
      expect(json).toHaveProperty(path.join(tempDir, 'package.json').replaceAll('\\', '/'))
    } finally {
      await removeDir(tempDir)
    }
  })

  it('--deep --errorLevel 2 should exit with code 0 when there are no upgrades', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgData = JSON.stringify({
      dependencies: {
        'ncu-test-v2': '99.9.9',
      },
    })

    // write root package file
    await fs.writeFile(path.join(tempDir, 'package.json'), pkgData, 'utf-8')

    try {
      const cli = getCliInvocation('--deep', '--errorLevel', '2')
      await spawn(
        cli.command,
        cli.args,
        {},
        {
          cwd: tempDir,
        },
      )
    } finally {
      await removeDir(tempDir)
    }
  })

  it('formats package status output without extra blank lines in deep mode', async () => {
    const tempDir = await setupDeepStatusTest()

    try {
      const cli = getCliInvocation('-u', '--deep')
      const { stdout } = await spawn(cli.command, cli.args, {}, { cwd: tempDir })
      const output = stripAnsi(stdout)

      // Use path-agnostic regexes since the absolute temp path printed by the CLI may differ from
      // os.tmpdir() (e.g. /var vs /private/var on macOS, or short 8.3 paths on Windows).
      expect(output).toMatch(/Upgrading .*package\.json\nAll dependencies match the latest package versions :\)/)
      expect(output).toMatch(
        /All dependencies match the latest package versions :\)\n\nUpgrading .*no-deps.*package\.json\nNo dependencies\./,
      )
      expect(output).not.toMatch(/Upgrading .*package\.json\n\nAll dependencies match the latest package versions :\)/)
    } finally {
      await removeDir(tempDir)
    }
  })
})

describe('--deep with nested ncurc files', () => {
  const cwd = path.join(__dirname, 'test-data/deep-ncurc')

  let stub: { restore: () => void }
  beforeAll(() => (stub = stubVersions('99.9.9', { spawn: true })))
  afterAll(() => stub.restore())

  it('use ncurc of nested packages', async () => {
    const cli = getCliInvocation('--jsonUpgraded', '--deep')
    const { stdout } = await spawn(cli.command, cli.args, {}, { cwd })
    const deepJsonOut = JSON.parse(stdout)

    // root: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('package.json')
    expect(deepJsonOut['package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['package.json']).toHaveProperty('fp-and-or')

    // pkg1: reject: ['fp-ando-or']
    expect(deepJsonOut).toHaveProperty('pkg/sub1/package.json')
    expect(deepJsonOut['pkg/sub1/package.json']).toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub1/package.json']).not.toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub1/package.json']).toHaveProperty('ncu-test-return-version')

    // pkg2: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub2/package.json')
    expect(deepJsonOut['pkg/sub2/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub2/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub2/package.json']).toHaveProperty('ncu-test-v2')

    // pkg3: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub3/package.json')
    expect(deepJsonOut['pkg/sub3/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub3/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub3/package.json']).toHaveProperty('ncu-test-v2')
  })

  it('use ncurc of nested packages with --mergeConfig option', async () => {
    const cli = getCliInvocation('--jsonUpgraded', '--deep', '--mergeConfig')
    const { stdout } = await spawn(cli.command, cli.args, {}, { cwd })
    const deepJsonOut = JSON.parse(stdout)

    // root: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('package.json')
    expect(deepJsonOut['package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['package.json']).toHaveProperty('fp-and-or')

    // pkg1: reject: ['fp-ando-or', 'cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub1/package.json')
    expect(deepJsonOut['pkg/sub1/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub1/package.json']).not.toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub1/package.json']).toHaveProperty('ncu-test-return-version')

    // pkg2: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub2/package.json')
    expect(deepJsonOut['pkg/sub2/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub2/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub2/package.json']).toHaveProperty('ncu-test-v2')

    // pkg21: explicit reject: ['fp-ando-or'] and implicit reject ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub2/sub21/package.json')
    expect(deepJsonOut['pkg/sub2/sub21/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub2/sub21/package.json']).not.toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub2/sub21/package.json']).toHaveProperty('ncu-test-return-version')

    // pkg22: implicit reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub2/sub22/package.json')
    expect(deepJsonOut['pkg/sub2/sub22/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub2/sub22/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub2/sub22/package.json']).toHaveProperty('ncu-test-v2')

    // pkg3: reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub3/package.json')
    expect(deepJsonOut['pkg/sub3/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub3/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub3/package.json']).toHaveProperty('ncu-test-v2')

    // pkg31: explicit reject: ['fp-ando-or'] and implicit reject ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub3/sub31/package.json')
    expect(deepJsonOut['pkg/sub3/sub31/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub3/sub31/package.json']).not.toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub3/sub31/package.json']).toHaveProperty('ncu-test-return-version')

    // pkg32: implicit reject: ['cute-animals']
    expect(deepJsonOut).toHaveProperty('pkg/sub3/sub32/package.json')
    expect(deepJsonOut['pkg/sub3/sub32/package.json']).not.toHaveProperty('cute-animals')
    expect(deepJsonOut['pkg/sub3/sub32/package.json']).toHaveProperty('fp-and-or')
    expect(deepJsonOut['pkg/sub3/sub32/package.json']).toHaveProperty('ncu-test-v2')
  })
})

describe('--deep cli option precedence', () => {
  /** Creates a temp directory with a root .ncurc and a single package.json. */
  const setup = async (rcContents: string) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { 'ncu-test-v2': '^1.0.0' } }),
      'utf-8',
    )
    await fs.writeFile(path.join(tempDir, '.ncurc.js'), rcContents, 'utf-8')
    return tempDir
  }

  // See: https://github.com/raineorshine/npm-check-updates/issues/1355
  it('cli option overrides .ncurc in deep mode', async () => {
    const tempDir = await setup('module.exports = { target: "minor" }')
    try {
      const cli = getCliInvocation('--jsonUpgraded', '--deep', '--target', 'latest')
      const { stdout } = await spawn(cli.command, cli.args, {}, { cwd: tempDir })
      const json = JSON.parse(stdout)
      expect(json['package.json']['ncu-test-v2']).toBe('^2.0.0')
    } finally {
      await removeDir(tempDir)
    }
  })

  // combined short options (e.g. -jt latest == -j -t latest) must still be tracked as cli options
  it('combined short cli option overrides .ncurc in deep mode', async () => {
    const tempDir = await setup('module.exports = { target: "minor" }')
    try {
      const cli = getCliInvocation('--deep', '-jt', 'latest')
      const { stdout } = await spawn(cli.command, cli.args, {}, { cwd: tempDir })
      const json = JSON.parse(stdout)
      expect(json['package.json'].dependencies['ncu-test-v2']).toBe('^2.0.0')
    } finally {
      await removeDir(tempDir)
    }
  })

  it('.ncurc still applies in deep mode when no overriding cli option is given', async () => {
    const tempDir = await setup('module.exports = { target: "minor" }')
    try {
      const cli = getCliInvocation('--jsonUpgraded', '--deep')
      const { stdout } = await spawn(cli.command, cli.args, {}, { cwd: tempDir })
      const json = JSON.parse(stdout)
      expect(json['package.json']).not.toHaveProperty('ncu-test-v2')
    } finally {
      await removeDir(tempDir)
    }
  })
})

describe('mergeOptions', () => {
  it('merge options', () => {
    /** Asserts that merging two options object deep equals the given result object. */
    const eq = (
      o1: Record<string, unknown> | null,
      o2: Record<string, unknown> | null,
      result: Record<string, unknown>,
    ) => expect(mergeOptions(o1, o2)).toStrictEqual(result)

    // trivial cases
    eq(null, null, {})
    eq({}, {}, {})

    // standard merge not broken
    eq({ a: 1 }, {}, { a: 1 })
    eq({}, { a: 1 }, { a: 1 })
    eq({ a: 1 }, { a: 2 }, { a: 2 })

    // merge arrays (non standard behavior)
    eq({ a: [1] }, { a: [2] }, { a: [1, 2] })
    eq({ a: [1, 2] }, { a: [2, 3] }, { a: [1, 2, 3] })

    // if property types different, then apply standard merge behavior
    eq({ a: 1 }, { a: [2] }, { a: [2] })

    // all together
    eq(
      { a: [1], b: true, c: 1, d1: 'd1' },
      { a: [2], b: false, c: ['1'], d2: 'd2' },
      { a: [1, 2], b: false, c: ['1'], d1: 'd1', d2: 'd2' },
    )
  })
})
