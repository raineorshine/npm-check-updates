import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import stubVersions from './helpers/stubVersions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bin = path.join(__dirname, '../build/cli.js')

describe('timeout', () => {
  it('throw an exception instead of printing to the console when timeout is exceeded', async () => {
    const pkgPath = path.join(__dirname, './test-data/ncu/package-large.json')
    await expect(
      ncu({
        packageData: await fs.readFile(pkgPath, 'utf-8'),
        timeout: 1,
      }),
    ).rejects.toThrow(/Exceeded global timeout of 1ms|Idle timeout reached/)
  })

  it('exit with error when timeout is exceeded', async () => {
    await expect(
      spawn('node', [bin, '--timeout', '1'], {
        stdin: '{ "dependencies": { "express": "1" } }',
      }),
    ).rejects.toThrow(/Exceeded global timeout of 1ms|Idle timeout reached/)
  })

  it('completes successfully with timeout', async () => {
    const stub = stubVersions('99.9.9', { spawn: true })
    await spawn('node', [bin, '--timeout', '100000'], { stdin: '{ "dependencies": { "express": "1" } }' })
    stub.restore()
  })
})
