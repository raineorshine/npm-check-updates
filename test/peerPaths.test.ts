import { describe, expect, it } from 'vitest'
import { mergePeerDependencies, peersOf, rootOf } from '../src/lib/peerPaths.ts'

describe('peerPaths', () => {
  it('returns the listed package a path belongs to', () => {
    expect(rootOf('plugin')).toBe('plugin')
    expect(rootOf('plugin > helper > other')).toBe('plugin')
  })

  it('returns the entries of a package and the unlisted peers it brings in', () => {
    const peerDependencies = {
      plugin: { helper: '^1.0.0' },
      'plugin > helper': { host: '^1.0.0' },
      'plugin-extra': { host: '^2.0.0' },
    }
    expect(peersOf(peerDependencies, 'plugin')).toStrictEqual([
      ['plugin', { helper: '^1.0.0' }],
      ['plugin > helper', { host: '^1.0.0' }],
    ])
  })

  it('replaces every entry of a package, so the peers of a peer it no longer requires are dropped', () => {
    const base = { plugin: { helper: '^1.0.0' }, 'plugin > helper': { host: '^1.0.0' }, host: {} }
    expect(mergePeerDependencies(base, { plugin: {} })).toStrictEqual({ host: {}, plugin: {} })
  })

  it('keeps the entries of a package that next does not mention, such as one whose upgrade was rejected', () => {
    const base = { plugin: { helper: '^1.0.0' }, 'plugin > helper': { host: '^1.0.0' } }
    expect(mergePeerDependencies(base, { host: {} })).toStrictEqual({ ...base, host: {} })
  })
})
