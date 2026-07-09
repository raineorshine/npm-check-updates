import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'
import parseJson from '../../../src/lib/utils/parseJson.ts'
import removeDir from '../../helpers/removeDir.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../../../build/cli.js')

describe('deno', () => {
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
      expect(pkg).toHaveProperty('ncu-test-v2')
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
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], undefined, {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
      expect(pkg).toHaveProperty('ncu-test-v2')
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
      await spawn('node', [bin, '-u'], undefined, { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = parseJson(pkgDataNew)
      expect(pkg).toStrictEqual({
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
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded'], undefined, {
        cwd: tempDir,
      })
      const pkg = parseJson(stdout)
      expect(pkg).toHaveProperty('ncu-test-v2')
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
      await spawn('node', [bin, '-u'], undefined, { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      const pkg = parseJson(pkgDataNew)
      expect(pkg).toStrictEqual({
        imports: {
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      await removeDir(tempDir)
    }
  })

  // Deno 2.0 can manage dependencies in package.json
  it('fall back to package.json when no deno.json is found', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    const pkg = {
      dependencies: { 'ncu-test-v2': '1.0.0' },
      devDependencies: { 'ncu-test-tag': '0.1.0' },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--packageManager', 'deno'], undefined, {
        cwd: tempDir,
      })
      const upgraded = parseJson(stdout)
      expect(upgraded).toHaveProperty('ncu-test-v2')
      expect(upgraded).toHaveProperty('ncu-test-tag')
    } finally {
      await removeDir(tempDir)
    }
  })

  it('rewrite package.json fallback', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    const pkg = {
      dependencies: { 'ncu-test-v2': '1.0.0' },
    }
    await fs.writeFile(pkgFile, JSON.stringify(pkg))
    try {
      await spawn('node', [bin, '-u', '--packageManager', 'deno'], undefined, { cwd: tempDir })
      const pkgDataNew = await fs.readFile(pkgFile, 'utf-8')
      expect(parseJson(pkgDataNew)).toStrictEqual({
        dependencies: { 'ncu-test-v2': '2.0.0' },
      })
    } finally {
      await removeDir(tempDir)
    }
  })

  it('prefer deno.json over package.json when both exist', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    await fs.writeFile(
      path.join(tempDir, 'deno.json'),
      JSON.stringify({ imports: { 'ncu-test-v2': 'npm:ncu-test-v2@1.0.0' } }),
    )
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { 'ncu-test-tag': '0.1.0' } }),
    )
    try {
      const { stdout } = await spawn('node', [bin, '--jsonUpgraded', '--packageManager', 'deno'], undefined, {
        cwd: tempDir,
      })
      const upgraded = parseJson(stdout)
      expect(upgraded).toHaveProperty('ncu-test-v2')
      expect(upgraded).not.toHaveProperty('ncu-test-tag')
    } finally {
      await removeDir(tempDir)
    }
  })
})
