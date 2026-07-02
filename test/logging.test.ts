import { describe, expect, it } from 'vitest'
import { chalkInit } from '../src/lib/chalk.ts'
import { toDependencyTable } from '../src/lib/logging.ts'

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

  it('adds a cooldown column for dependencies skipped by cooldown', async () => {
    const table = await toDependencyTable({
      from: { x: '1.0.0' },
      to: { x: '2.0.0' },
      skippedByCooldown: { x: { name: 'x', currentVersion: '1.0.0', version: '2.0.0' } },
    })
    expect(table).toContain('[cooldown]')
  })
})
