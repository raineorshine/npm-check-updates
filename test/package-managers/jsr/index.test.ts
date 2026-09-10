import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'
import parseJson from '../../../src/lib/utils/parseJson.ts'
import removeDir from '../../helpers/removeDir.ts'
import stubVersions from '../../helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../../../build/cli.js')

describe('jsr', () => {
  it('upgrade jsr: and npm: imports in deno.json', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'deno.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({
        imports: {
          '@scope/name': 'jsr:@scope/name@^1.0.0',
          'ncu-test-v2': 'npm:ncu-test-v2@1.0.0',
        },
      }),
    )
    const stub = stubVersions({ '@jsr/scope__name': '1.2.0', 'ncu-test-v2': '2.0.0' }, { spawn: true })
    try {
      await spawn('node', [bin, '-u', '--packageManager', 'deno'], undefined, { cwd: tempDir })
      expect(parseJson(await fs.readFile(pkgFile, 'utf-8'))).toStrictEqual({
        imports: {
          '@scope/name': 'jsr:@scope/name@^1.2.0',
          'ncu-test-v2': 'npm:ncu-test-v2@2.0.0',
        },
      })
    } finally {
      stub.restore()
      await removeDir(tempDir)
    }
  })

  // jsr's registry serves no version manifests and no npm user metadata, so these paths must not be
  // attempted for a jsr: spec. Only the version lookup is stubbed, so an attempt really would 404.
  it.each([['--enginesNode'], ['--format', 'ownerChanged']])('completes with a jsr: spec and %s', async (...args) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({ dependencies: { '@scope/name': 'jsr:@scope/name@^1.0.0' }, engines: { node: '>=18' } }),
    )
    const stub = stubVersions({ '@jsr/scope__name': '1.2.0' }, { spawn: true })
    try {
      const { stdout, stderr } = await spawn('node', [bin, ...args], undefined, { cwd: tempDir })
      expect(stdout + stderr).not.toContain('Unhandled Rejection')
      expect(stdout).toContain('@scope/name')
    } finally {
      stub.restore()
      await removeDir(tempDir)
    }
  })

  // a static registry replaces all registry lookups, so jsr: specs resolve from it by unmangled name
  it('resolve jsr: specs from a static registry', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    const registryFile = path.join(tempDir, 'registry.json')
    await fs.writeFile(
      pkgFile,
      JSON.stringify({ dependencies: { '@scope/name': 'jsr:@scope/name@^1.0.0', '@bare/pkg': 'jsr:^1.0.0' } }),
    )
    await fs.writeFile(registryFile, JSON.stringify({ '@scope/name': '1.5.0', '@bare/pkg': '2.5.0' }))
    try {
      await spawn('node', [bin, '-u', '--registryType', 'json', '--registry', registryFile], undefined, {
        cwd: tempDir,
      })
      expect(parseJson(await fs.readFile(pkgFile, 'utf-8'))).toStrictEqual({
        dependencies: { '@scope/name': 'jsr:@scope/name@^1.5.0', '@bare/pkg': 'jsr:^2.5.0' },
      })
    } finally {
      await removeDir(tempDir)
    }
  })

  it('keep the bare jsr form bare', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-check-updates-'))
    const pkgFile = path.join(tempDir, 'package.json')
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { '@scope/name': 'jsr:^1.0.0' } }))
    const stub = stubVersions({ '@jsr/scope__name': '1.2.0' }, { spawn: true })
    try {
      await spawn('node', [bin, '-u'], undefined, { cwd: tempDir })
      expect(parseJson(await fs.readFile(pkgFile, 'utf-8'))).toStrictEqual({
        dependencies: { '@scope/name': 'jsr:^1.2.0' },
      })
    } finally {
      stub.restore()
      await removeDir(tempDir)
    }
  })
})
