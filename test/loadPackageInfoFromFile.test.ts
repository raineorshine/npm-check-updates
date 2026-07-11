import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import loadPackageInfoFromFile from '../src/lib/loadPackageInfoFromFile.ts'
import removeDir from './helpers/removeDir.ts'

describe('loadPackageInfoFromFile', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-test-lpi-'))
  })

  afterEach(async () => {
    await removeDir(tempDir)
  })

  it('loads and parses a package file', async () => {
    const filepath = path.join(tempDir, 'package.json')
    await fs.writeFile(filepath, '{"name":"z","version":"1.0.0"}')

    const info = await loadPackageInfoFromFile({}, filepath)

    expect(info.pkg).toStrictEqual({ name: 'z', version: '1.0.0' })
    expect(info.pkgFile).toBe('{"name":"z","version":"1.0.0"}')
    expect(info.filepath).toBe(filepath)
    expect(info.name).toBeUndefined()
  })

  it('errors on a missing or invalid file', async () => {
    await expect(loadPackageInfoFromFile({}, path.join(tempDir, 'missing.json'))).rejects.toThrow('Missing or invalid')
  })
})
