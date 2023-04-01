import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import stubNpmView from './helpers/stubNpmView'
import { FilterResultsFunction } from '../src/types/FilterResultsFunction'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

const bin = path.join(__dirname, '../build/src/bin/cli.js')

/**
 * Sets up and tears down the temporary directories required to run each test
 */
async function filterResultsTestScaffold(
  dependencies: Record<string, string>,
  filterResultsFn: FilterResultsFunction,
  expectedOutput: string,
  notExpectedOutput: string
): Promise<void> {
  const stub = stubNpmView(
    {
      'ncu-test-v2': '3.0.0',
      'ncu-test-tag': '2.1.0',
      'ncu-test-return-version': '1.2.0',
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
  await fs.writeFile(configFile, `module.exports = { filterResults: ${filterResultsFn.toString()} }`, 'utf-8')

  try {
    const stdout = await spawn('node', [bin, '--configFilePath', tempDir], {
      cwd: tempDir,
    })
    stripAnsi(stdout).should.containIgnoreCase(expectedOutput)
    stripAnsi(stdout).should.not.containIgnoreCase(notExpectedOutput)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
    stub.restore()
  }
}
describe('filterResults', () => {
  it('should return only major versions updated', async () => {
    await filterResultsTestScaffold(
      {'ncu-test-v2': '2.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0'},
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (packageName, {currentVersion, currentVersionSemver, upgradedVersion, upgradedVersionSemver}) => {
        const currentMajorVersion = (currentVersionSemver && currentVersionSemver[0] && currentVersionSemver[0].major)
        const upgradedMajorVersion = (upgradedVersionSemver && upgradedVersionSemver[0] && upgradedVersionSemver[0].major)
        if (currentMajorVersion && upgradedMajorVersion) {
          return currentMajorVersion < upgradedMajorVersion;
        }
        return true
      },
      `
 ncu-test-tag  1.0.0  →  2.1.0
 ncu-test-v2   2.0.0  →  3.0.0`,
      `ncu-test-return-version`
    )
  })
})
