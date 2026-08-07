import { beforeEach, describe, expect, it, vi } from 'vitest'
import spawnCommand from '../../../src/lib/spawnCommand.ts'
import * as npm from '../../../src/package-managers/npm.ts'

vi.mock('../../../src/lib/spawnCommand.ts', () => ({ default: vi.fn() }))

/** Makes the next npm view return the given stdout. */
const stubNpmView = (stdout: string) =>
  vi.mocked(spawnCommand).mockResolvedValue({ stdout, stderr: '', command: 'npm' })

describe('getPeerDependencies output shapes', () => {
  beforeEach(() => {
    vi.mocked(spawnCommand).mockReset()
  })

  // npm 11 prints the field value directly when the spec matches a single version
  it('reads a bare object', async () => {
    stubNpmView('{ "eslint": "^9.7" }')
    await expect(npm.getPeerDependencies('p', '1.0.0', {})).resolves.toStrictEqual({ eslint: '^9.7' })
  })

  // npm 12 always wraps the field value in an array
  // https://github.com/raineorshine/npm-check-updates/issues/1981
  it('reads a single element array', async () => {
    stubNpmView('[{ "eslint": "^9.7" }]')
    await expect(npm.getPeerDependencies('p', '1.0.0', {})).resolves.toStrictEqual({ eslint: '^9.7' })
  })

  // both npm 11 and 12 emit one entry per matched version, ordered by version
  it('takes the last entry when the spec matches several versions', async () => {
    stubNpmView('[{ "eslint": "^8" }, { "eslint": "^9.7" }]')
    await expect(npm.getPeerDependencies('p', '^1.0.0', {})).resolves.toStrictEqual({ eslint: '^9.7' })
  })

  it('returns {} when the package has no peer dependencies', async () => {
    stubNpmView('')
    await expect(npm.getPeerDependencies('p', '1.0.0', {})).resolves.toStrictEqual({})
  })
})
