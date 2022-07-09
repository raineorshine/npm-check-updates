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
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.promises.writeFile(
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
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('show suggested install command when declining autoinstall', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.promises.writeFile(
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
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('with --format group', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.promises.writeFile(
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
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('prompt for autoinstall once at the end if there are multiple package files', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    await fs.promises.mkdir(path.join(tempDir, 'packages/a'), { recursive: true })
    await fs.promises.mkdir(path.join(tempDir, 'packages/b'), { recursive: true })
    const pkgFileA = path.join(tempDir, 'packages/a/package.json')
    const pkgFileB = path.join(tempDir, 'packages/b/package.json')
    await fs.promises.writeFile(pkgFileA, JSON.stringify({ dependencies: { 'ncu-test-v2': '1.0.0' } }), 'utf-8')
    await fs.promises.writeFile(pkgFileB, JSON.stringify({ dependencies: { 'ncu-test-tag': '1.0.0' } }), 'utf-8')

    try {
      const stdout = await spawn(
        'node',
        // verbose to output stdout from npm install
        [bin, '--loglevel', 'verbose', '--interactive', '--packageFile', 'packages/*/package.json'],
        {
          cwd: tempDir,
          env: {
            ...process.env,
            // autoinstall is prompted once at the end
            INJECT_PROMPTS: JSON.stringify([['ncu-test-v2'], ['ncu-test-tag'], false]),
          },
        },
      )

      stripAnsi(stdout).should.include('Run npm install in each project directory to install new versions')

      // npm install outupt
      // e.g. added 1 package, and audited 2 packages in 386ms
      stripAnsi(stdout).should.not.include('added')
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })
})
