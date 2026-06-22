import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import parseJson from '../../../src/lib/utils/parseJson'
import removeDir from '../../helpers/removeDir'
import { runNcuCli } from '../../helpers/runNcuCli'
import stubVersions from '../../helpers/stubVersions'

describe('deno', async function () {
  let versionStub: { mockRestore: () => void }
  beforeEach(() => (versionStub = stubVersions({ 'ncu-test-v2': '2.0.0' })))
  afterEach(() => versionStub.mockRestore())

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
      const { stdout } = await runNcuCli(['--jsonUpgraded', '--packageManager', 'deno', '--packageFile', pkgFile])
      const pkg = parseJson(stdout)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await removeDir(tempDir)
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
      const { stdout } = await runNcuCli(['--jsonUpgraded'], {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await removeDir(tempDir)
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
      await runNcuCli(['-u'], { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = parseJson(pkgDataNew)
      pkg.should.deep.equal({
        imports: {
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      await removeDir(tempDir)
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
      const { stdout } = await runNcuCli(['--jsonUpgraded'], {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
      pkg.should.have.property('ncu-test-v2')
    } finally {
      await removeDir(tempDir)
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
      await runNcuCli(['-u'], { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = parseJson(pkgDataNew)
      pkg.should.deep.equal({
        imports: {
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      await removeDir(tempDir)
    }
  })
})
