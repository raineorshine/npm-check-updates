import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import findPackage from '../src/lib/findPackage.ts'
import { styleInit } from '../src/lib/style.ts'
import removeDir from './helpers/removeDir.ts'

describe('findPackage', () => {
  styleInit(null)

  it('returns packageData directly when provided, with no package file', async () => {
    const result = await findPackage({ packageData: '{"name":"x"}', loglevel: 'silent' })
    expect(result).toStrictEqual({ pkgData: '{"name":"x"}', pkgFile: null, pkgPath: 'package.json' })
  })

  describe('with a package file on disk', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-fp-'))
    })

    afterEach(async () => {
      await removeDir(tempDir)
    })

    it('reads the contents of --packageFile', async () => {
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, '{"name":"y"}')

      const result = await findPackage({ packageFile: pkgFile, loglevel: 'silent' })

      expect(result.pkgData).toBe('{"name":"y"}')
      expect(result.pkgFile).toBe(pkgFile)
    })

    it('errors when the specified --packageFile does not exist', async () => {
      await expect(
        findPackage({ packageFile: path.join(tempDir, 'missing.json'), loglevel: 'silent' }),
      ).rejects.toThrow('ENOENT')
    })

    it('finds the closest package.json from cwd', async () => {
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, '{"name":"z"}')
      await fs.mkdir(path.join(tempDir, 'nested'))

      const result = await findPackage({ cwd: path.join(tempDir, 'nested'), loglevel: 'silent' })

      expect(result.pkgData).toBe('{"name":"z"}')
      expect(result.pkgFile).toBe(pkgFile)
    })

    it('prefers deno.json over package.json for the deno package manager', async () => {
      await fs.writeFile(path.join(tempDir, 'package.json'), '{"name":"z"}')
      const denoFile = path.join(tempDir, 'deno.json')
      await fs.writeFile(denoFile, '{"imports":{}}')

      const result = await findPackage({ cwd: tempDir, packageManager: 'deno', loglevel: 'silent' })

      expect(result.pkgFile).toBe(denoFile)
    })

    it('falls back to package.json for the deno package manager when there is no deno.json', async () => {
      const pkgFile = path.join(tempDir, 'package.json')
      await fs.writeFile(pkgFile, '{"name":"z"}')

      const result = await findPackage({ cwd: tempDir, packageManager: 'deno', loglevel: 'silent' })

      expect(result.pkgFile).toBe(pkgFile)
    })

    it('errors when no package file is found', async () => {
      await expect(findPackage({ cwd: tempDir, loglevel: 'silent' })).rejects.toThrow('No package.json')
    })

    describe('--stdin', () => {
      const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin')!

      /** Replaces process.stdin with a readable stream of the given content. */
      const stubStdin = (content: string) =>
        Object.defineProperty(process, 'stdin', { configurable: true, value: Readable.from([content]) })

      afterEach(() => {
        Object.defineProperty(process, 'stdin', realStdin)
      })

      it('reads the package data from stdin', async () => {
        stubStdin('{"name":"from-stdin"}')

        const result = await findPackage({ stdin: 'true', cwd: tempDir, loglevel: 'silent' })

        expect(result.pkgData).toBe('{"name":"from-stdin"}')
        expect(result.pkgFile).toBeNull()
      })

      it('falls back to a package file on disk when stdin is empty', async () => {
        stubStdin('  \n')

        const result = await findPackage({ stdin: 'true', loglevel: 'silent' })

        // the stdin fallback searches up from process.cwd(), not options.cwd
        expect(result.pkgFile).toBe(path.resolve('package.json'))
        expect(JSON.parse(result.pkgData!).name).toBe('npm-check-updates')
      })
    })
  })
})
