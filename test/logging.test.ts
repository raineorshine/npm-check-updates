import fs from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters as stripAnsi } from 'node:util'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { chalkInit } from '../src/lib/chalk.ts'
import {
  printIgnoredUpdatesDueToEnginesNode,
  printIgnoredUpdatesDueToPeerDeps,
  printUpgrades,
  toDependencyTable,
} from '../src/lib/logging.ts'
import makeTempDir from './helpers/makeTempDir.ts'
import removeDir from './helpers/removeDir.ts'

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const CR = String.fromCharCode(0x0d)

// OSC sequence that sets the terminal title. Written with char codes so editors and prettier leave it alone
const OSC_TITLE = ESC + ']0;pwned' + BEL

/** Captures everything printed to the console during fn, leaving ANSI intact. */
const captureRaw = async (fn: () => unknown): Promise<string> => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await fn()
    return logSpy.mock.calls.flat().join('\n')
  } finally {
    logSpy.mockRestore()
  }
}

/** Captures everything printed to the console during fn. */
const captureOutput = async (fn: () => unknown): Promise<string> => stripAnsi(await captureRaw(fn))

describe('toDependencyTable', () => {
  chalkInit(false)

  it('renders a from → to row for each dependency', async () => {
    const table = await toDependencyTable({ from: { a: '1.0.0' }, to: { a: '2.0.0' } })
    expect(table).toContain('a')
    expect(table).toContain('1.0.0')
    expect(table).toContain('→')
    expect(table).toContain('2.0.0')
  })

  it('resolves the version from an npm alias in the target', async () => {
    const table = await toDependencyTable({ from: { a: '1.0.0' }, to: { a: 'npm:b@2.0.0' } })
    expect(table).toContain('2.0.0')
    expect(table).not.toContain('npm:b')
  })

  it('extracts the tag from a github url in the target', async () => {
    const table = await toDependencyTable({
      from: { a: 'https://github.com/r/x#v1.0.0' },
      to: { a: 'https://github.com/r/x#v2.0.0' },
    })
    expect(table).toContain('v2.0.0')
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1539
  it('truncates the build metadata that pnpm writes into packageManager', async () => {
    const table = await toDependencyTable({
      from: {
        pnpm: '10.14.0+sha512.ad27a79641b49c3e481a16a805baa71817a04bbe06a38d17e60e2eaee83f6a146c6a688125f5792e48dd5ba30e7da52a5cda4c3992b9ccf333f9ce223af84748',
      },
      to: { pnpm: '10.15.0+sha512.76e2df756d24beb1e0a58e5d4c0c1c9a5ba9c0e8b7c8e5d1a2b3c4d5e6f7a8b9' },
    })
    expect(stripAnsi(table)).toContain('10.14.0+sha512.ad27a79641b49...')
    expect(stripAnsi(table)).toContain('10.15.0+sha512.76e2df756d24b...')
  })

  it('adds a cooldown column for dependencies skipped by cooldown', async () => {
    const table = await toDependencyTable({
      from: { x: '1.0.0' },
      to: { x: '2.0.0' },
      skippedByCooldown: { x: { name: 'x', currentVersion: '1.0.0', version: '2.0.0' } },
    })
    expect(table).toContain('[cooldown]')
  })

  // https://github.com/raineorshine/npm-check-updates/issues/1988
  it('strips terminal escape sequences from homepage and repo', async () => {
    const tempDir = await makeTempDir()
    const pkgFile = path.join(tempDir, 'package.json')
    const depDir = path.join(tempDir, 'node_modules', 'ncu-test-escape')
    onTestFinished(() => removeDir(tempDir))
    await fs.writeFile(pkgFile, JSON.stringify({ dependencies: { 'ncu-test-escape': '^1.0.0' } }), 'utf-8')
    await fs.mkdir(depDir, { recursive: true })
    await fs.writeFile(
      path.join(depDir, 'package.json'),
      JSON.stringify({
        name: 'ncu-test-escape',
        version: '1.0.0',
        homepage: 'https://example.com/home' + OSC_TITLE,
        // a bare CR is not an escape sequence, but it can overwrite the rendered line
        repository: 'https://github.com/foo/bar' + CR + 'https://evil.example.com',
      }),
      'utf-8',
    )

    const table = await toDependencyTable({
      from: { 'ncu-test-escape': '1.0.0' },
      to: { 'ncu-test-escape': '2.0.0' },
      format: ['homepage', 'repo'],
      pkgFile,
    })

    expect(table).toContain('https://example.com/home')
    expect(table).toContain('https://github.com/foo/bar')
    expect(table).not.toContain('pwned')
    expect(table).not.toContain(CR)
  })
})

describe('printIgnoredUpdatesDueToPeerDeps', () => {
  chalkInit(false)

  it('prints the peer dependency requirements that blocked each upgrade', async () => {
    const output = await captureOutput(() =>
      printIgnoredUpdatesDueToPeerDeps(
        {},
        {
          'ncu-test-return-version': {
            from: '1.0.0',
            to: '2.0.0',
            reason: { 'ncu-test-peer': '1.1.x', 'ncu-test-peer-2': '1.0.x' },
          },
        },
      ),
    )
    expect(output).toContain('Ignored incompatible updates (peer dependencies)')
    expect(output).toContain('ncu-test-return-version')
    expect(output).toContain('reason: ncu-test-peer requires 1.1.x, ncu-test-peer-2 requires 1.0.x')
  })

  it('strips terminal escape sequences from the peer dependency range', async () => {
    const output = await captureRaw(() =>
      printIgnoredUpdatesDueToPeerDeps(
        {},
        {
          'ncu-test-return-version': {
            from: '1.0.0',
            to: '2.0.0',
            reason: { 'ncu-test-peer': '1.1.x' + OSC_TITLE },
          },
        },
      ),
    )
    expect(output).toContain('reason: ncu-test-peer requires 1.1.x')
    expect(output).not.toContain('pwned')
  })
})

describe('printIgnoredUpdatesDueToEnginesNode', () => {
  chalkInit(false)

  it('prints the required node version that blocked each upgrade', async () => {
    const output = await captureOutput(() =>
      printIgnoredUpdatesDueToEnginesNode({}, { 'ncu-test-v2': { from: '1.0.0', to: '2.0.0', enginesNode: '>=18' } }),
    )
    expect(output).toContain('Ignored incompatible updates (engines node)')
    expect(output).toContain('ncu-test-v2')
    expect(output).toContain('reason: requires node >=18')
  })

  it('strips terminal escape sequences from engines.node', async () => {
    const output = await captureRaw(() =>
      printIgnoredUpdatesDueToEnginesNode(
        {},
        { 'ncu-test-v2': { from: '1.0.0', to: '2.0.0', enginesNode: '>=18' + OSC_TITLE } },
      ),
    )
    expect(output).toContain('reason: requires node >=18')
    expect(output).not.toContain('pwned')
  })
})

describe('printUpgrades', () => {
  chalkInit(false)

  it('strips terminal escape sequences from registry errors', async () => {
    const output = await captureRaw(() =>
      printUpgrades(
        {},
        { current: {}, upgraded: {}, total: 0, errors: { 'ncu-test-v2': 'E404 Not Found' + OSC_TITLE } },
      ),
    )
    expect(output).toContain('E404 Not Found')
    expect(output).not.toContain('pwned')
  })
})
