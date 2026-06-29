import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('import side effects', () => {
  it('importing has no side effects', async () => {
    const modulePath = path.join(__dirname, '../build/index.cjs')
    const code = `require(process.argv[1]); console.log(process.listenerCount('exit'), process.listenerCount('unhandledRejection'))`
    const { stdout } = await spawn('node', ['-e', code, modulePath])
    expect(stripAnsi(stdout).trim()).toBe('0 0')
  })
})
