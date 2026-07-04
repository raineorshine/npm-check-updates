import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import spawn from 'spawn-please'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('import side effects', () => {
  it('importing has no side effects', async () => {
    // file URL so dynamic import() resolves the absolute path on Windows too
    const moduleUrl = pathToFileURL(path.join(__dirname, '../build/index.js')).href
    const code = `import(process.argv[1]).then(() => console.log(process.listenerCount('exit'), process.listenerCount('unhandledRejection')))`
    const { stdout } = await spawn('node', ['-e', code, moduleUrl])
    expect(stripAnsi(stdout).trim()).toBe('0 0')
  })
})
