import { stripVTControlCharacters as stripAnsi } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { chalkInit } from '../src/lib/chalk.ts'
import {
  printIgnoredUpdatesDueToEnginesNode,
  printIgnoredUpdatesDueToPeerDeps,
  toDependencyTable,
} from '../src/lib/logging.ts'

/** Captures everything printed to the console during fn. */
const captureOutput = (fn: () => void): string => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    fn()
    return stripAnsi(logSpy.mock.calls.flat().join('\n'))
  } finally {
    logSpy.mockRestore()
  }
}

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
})

describe('printIgnoredUpdatesDueToPeerDeps', () => {
  chalkInit(false)

  it('prints the peer dependency requirements that blocked each upgrade', () => {
    const output = captureOutput(() =>
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
})

describe('printIgnoredUpdatesDueToEnginesNode', () => {
  chalkInit(false)

  it('prints the required node version that blocked each upgrade', () => {
    const output = captureOutput(() =>
      printIgnoredUpdatesDueToEnginesNode({}, { 'ncu-test-v2': { from: '1.0.0', to: '2.0.0', enginesNode: '>=18' } }),
    )
    expect(output).toContain('Ignored incompatible updates (engines node)')
    expect(output).toContain('ncu-test-v2')
    expect(output).toContain('reason: requires node >=18')
  })
})
