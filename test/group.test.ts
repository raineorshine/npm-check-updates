import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import { GroupFunction } from '../src/types/GroupFunction'
import chaiSetup from './helpers/chaiSetup'
import stubNpmView from './helpers/stubNpmView'

chaiSetup()

const bin = path.join(__dirname, '../build/src/bin/cli.js')

/**
 * Sets up and tears down the temporary directories required to run each test
 */
async function groupTestScaffold(
  dependencies: Record<string, string>,
  groupFn: GroupFunction,
  expectedOutput: string,
): Promise<void> {
  const stub = stubNpmView(
    {
      'ncu-test-v2': '2.0.0',
      'ncu-test-tag': '1.1.0',
      'ncu-test-return-version': '2.0.0',
    },
    { spawn: true },
  )

  // use dynamic import for ESM module
  const { default: stripAnsi } = await import('strip-ansi')
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
  const pkgFile = path.join(tempDir, 'package.json')
  await fs.writeFile(
    pkgFile,
    JSON.stringify({
      dependencies,
    }),
    'utf-8',
  )
  const configFile = path.join(tempDir, '.ncurc.js')
  await fs.writeFile(configFile, `module.exports = { groupFunction: ${groupFn.toString()} }`, 'utf-8')
  try {
    const { stdout } = await spawn('node', [bin, '--format', 'group', '--configFilePath', tempDir], {
      cwd: tempDir,
    })
    stripAnsi(stdout).should.containIgnoreCase(expectedOutput)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
    stub.restore()
  }
}

describe('--format group', () => {
  it('group upgrades by type', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup) => defaultGroup,
      `Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0

Major   Potentially breaking API changes
 ncu-test-return-version  1.0.0  →  2.0.0
 ncu-test-v2              1.0.0  →  2.0.0`,
    )
  })

  it('preserve version ranges', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '^1.0.0' },
      (packageName, defaultGroup) => defaultGroup,
      `Major   Potentially breaking API changes
 ncu-test-v2  ^1.0.0  →  ^2.0.0`,
    )
  })

  it('moves package to major group', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup) => (packageName === 'ncu-test-tag' ? 'major' : defaultGroup),
      `Major   Potentially breaking API changes
 ncu-test-return-version  1.0.0  →  2.0.0
 ncu-test-tag             1.0.0  →  1.1.0
 ncu-test-v2              1.0.0  →  2.0.0`,
    )
  })

  it('moves package to minor group', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup) => (packageName === 'ncu-test-v2' ? 'minor' : defaultGroup),
      `Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0
 ncu-test-v2   1.0.0  →  2.0.0

Major   Potentially breaking API changes
 ncu-test-return-version  1.0.0  →  2.0.0`,
    )
  })

  it('moves package to patch group', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup) => (packageName === 'ncu-test-v2' ? 'patch' : defaultGroup),
      `Patch   Backwards-compatible bug fixes
 ncu-test-v2  1.0.0  →  2.0.0

Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0

Major   Potentially breaking API changes
 ncu-test-return-version  1.0.0  →  2.0.0`,
    )
  })

  it('moves package to majorVersionZero group', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup) => (packageName === 'ncu-test-v2' ? 'majorVersionZero' : defaultGroup),
      `Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0

Major   Potentially breaking API changes
 ncu-test-return-version  1.0.0  →  2.0.0

Major version zero   Anything may change
 ncu-test-v2  1.0.0  →  2.0.0`,
    )
  })

  it('creates custom groups', async () => {
    await groupTestScaffold(
      { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      (packageName, defaultGroup, currentVersionSpec, upgradedVersionSpec, upgradedVersion) =>
        `Custom Group for ${packageName} ${JSON.stringify(currentVersionSpec)} ${JSON.stringify(
          upgradedVersionSpec,
        )} ${JSON.stringify(upgradedVersion)}`,
      `Custom Group for ncu-test-return-version [{"semver":"1.0.0","major":"1","minor":"0","patch":"0"}] [{"semver":"2.0.0","major":"2","minor":"0","patch":"0"}] {"semver":"2.0.0","version":"2.0.0","major":"2","minor":"0","patch":"0"}
 ncu-test-return-version  1.0.0  →  2.0.0

Custom Group for ncu-test-tag [{"semver":"1.0.0","major":"1","minor":"0","patch":"0"}] [{"semver":"1.1.0","major":"1","minor":"1","patch":"0"}] {"semver":"1.1.0","version":"1.1.0","major":"1","minor":"1","patch":"0"}
 ncu-test-tag  1.0.0  →  1.1.0

Custom Group for ncu-test-v2 [{"semver":"1.0.0","major":"1","minor":"0","patch":"0"}] [{"semver":"2.0.0","major":"2","minor":"0","patch":"0"}] {"semver":"2.0.0","version":"2.0.0","major":"2","minor":"0","patch":"0"}
 ncu-test-v2  1.0.0  →  2.0.0`,
    )
  })
})
