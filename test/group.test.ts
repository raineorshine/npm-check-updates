import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import path from 'path'
import spawn from 'spawn-please'
import { dir } from 'tmp-promise'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

const bin = path.join(__dirname, '../build/src/bin/cli.js')

// use dynamic import for ESM module

describe('--format group', () => {
  it('group upgrades by type', async () => {
    // use dynamic import for ESM module
    const { default: stripAnsi } = await import('strip-ansi')
    const tempDir = await dir({ unsafeCleanup: true })
    const pkgFile = path.join(tempDir.path, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      const stdout = await spawn('node', [bin, '--format', 'group'], {
        cwd: tempDir.path,
      })
      // TODO: trimEnd
      stripAnsi(stdout).should.include(
        `Minor   Backwards-compatible features
 ncu-test-tag  1.0.0  →  1.1.0     ${''}

Major   Potentially breaking API changes
 ncu-test-v2              1.0.0  →  2.0.0     ${''}
 ncu-test-return-version  1.0.0  →  2.0.0`,
      )
    } finally {
      await tempDir.cleanup()
    }
  })
})
