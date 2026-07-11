import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import findPackage from '../src/lib/findPackage.ts'
import removeDir from './helpers/removeDir.ts'

describe('findPackage', () => {
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
  })
})
