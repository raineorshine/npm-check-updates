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

describe('deno', async function () {
  it('handle import map', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.json')
    const pkg = {
      imports: {
        'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
      },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      const pkgData = await spawn(
        'node',
        [bin, '--jsonUpgraded', '--packageManager', 'deno', '--packageFile', pkgFile],
        undefined,
      )
      const pkg = jph.parse(pkgData)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('auto detect deno.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.json')
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

  it('rewrite deno.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.json')
    const pkg = {
      imports: {
        'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
      },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      await spawn('node', [bin, '-u'], undefined, { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = jph.parse(pkgDataNew)
      pkg.should.deep.equal({
        imports: {
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('auto detect deno.jsonc', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.jsonc')
    const pkgString = `{
  "imports": {
    // this comment should be ignored in a jsonc file
    "ncu-test-v2": "npm:ncu-test-v2@1.0.0"
  }
}`
    await fs.writeFile(pkgFile, pkgString)
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

  it('rewrite deno.jsonc', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.jsonc')
    const pkg = {
      imports: {
        'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
      },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      await spawn('node', [bin, '-u'], undefined, { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = jph.parse(pkgDataNew)
      pkg.should.deep.equal({
        imports: {
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
