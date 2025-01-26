import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import spawn from 'spawn-please'
import parseJson from '../../../src/lib/utils/parseJson'
import chaiSetup from '../../helpers/chaiSetup'

chaiSetup()

const bin = path.join(__dirname, '../../../build/cli.js')

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
      const { stdout } = await spawn('node', [
        bin,
        '--jsonUpgraded',
        '--packageManager',
        'deno',
        '--packageFile',
        pkgFile,
      ])
      const pkg = parseJson(stdout)
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
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], undefined, {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
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
      const pkg = parseJson(pkgDataNew)
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
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], undefined, {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
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
      const pkg = parseJson(pkgDataNew)
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
