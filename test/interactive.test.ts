import fs from 'fs'
import os from 'os'
import path from 'path'
import spawn from 'spawn-please'
import stripAnsi from 'strip-ansi'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiString from 'chai-string'

const should = chai.should()
chai.use(chaiAsPromised)
chai.use(chaiString)

const bin = path.join(__dirname, '../build/src/bin/cli.js')

describe('--interactive', () => {
  it('prompt for each upgraded dependency', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    fs.writeFileSync(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      const stdout = await spawn('node', [bin, '--interactive'], {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      })

      should.equal(/^Upgrading/m.test(stdout), true)

      // do not show install hint when choosing autoinstall
      should.equal(/^Run npm install to install new versions.$/m.test(stdout), false)

      const upgradedPkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })
    } finally {
      fs.unlinkSync(pkgFile)
    }
  })

  it('show suggested install command when declining autoinstall', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    fs.writeFileSync(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      const stdout = await spawn('node', [bin, '--interactive'], {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], false]),
        },
      })

      // show install hint when autoinstall is declined
      should.equal(/^Run npm install to install new versions.$/m.test(stripAnsi(stdout)), true)
    } finally {
      fs.unlinkSync(pkgFile)
    }
  })

  it('with --format group', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.resolve(tempDir, 'package.json')
    fs.writeFileSync(
      pkgFile,
      JSON.stringify({
        dependencies: { 'ncu-test-v2': '1.0.0', 'ncu-test-return-version': '1.0.0', 'ncu-test-tag': '1.0.0' },
      }),
      'utf-8',
    )
    try {
      await spawn('node', [bin, '--interactive', '--format', 'group'], {
        cwd: tempDir,
        env: {
          ...process.env,
          INJECT_PROMPTS: JSON.stringify([['ncu-test-v2', 'ncu-test-return-version'], true]),
        },
      })

      const upgradedPkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'))
      upgradedPkg.dependencies.should.deep.equal({
        // upgraded
        'ncu-test-v2': '2.0.0',
        'ncu-test-return-version': '2.0.0',
        // no upgraded
        'ncu-test-tag': '1.0.0',
      })

      // prompts does not print during injection, so we cannot assert the output in interactive mode
    } finally {
      await fs.promises.unlink(pkgFile)
    }
  })
})
