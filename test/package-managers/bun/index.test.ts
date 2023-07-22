import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'
import fs from 'fs/promises'
import jph from 'json-parse-helpfulerror'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'

chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

process.env.NCU_TESTS = 'true'

const bin = path.join(__dirname, '../../../build/src/bin/cli.js')

describe('bun', async function () {
  it('handle import map', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'bun.lockb')
    const pkg = {
      imports: {
        'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
      },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      const pkgData = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--packageManager', 'bun', '--packageFile', pkgFile],
        undefined,
      )
      const pkg = jph.parse(pkgData)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('auto detect bun.lockb', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'bun.lockb')
    const pkg = {
      imports: {
        'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
      },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      const pkgData = await spawn('node', [bin, '--jsonUpgraded'], undefined, {
        cwd: tempDir,
      })
      const pkg = jph.parse(pkgData)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
