import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--format group', () => {
  it('group upgrades by type', async () => {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      const stdout = await spawn('node', [bin, '--format', 'group'], {
        cwd: tempDir,
      })
      stripAnsi(stdout).should.include(
        `Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0

Major   Potentially breaking API changes
 ncu-test-v2              1.0.0  →  2.0.0
 ncu-test-return-version  1.0.0  →  2.0.0`,
      )
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
