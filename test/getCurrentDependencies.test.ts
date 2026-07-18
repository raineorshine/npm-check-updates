import { type SemVer } from 'semver-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import getCurrentDependencies from '../src/lib/getCurrentDependencies.ts'
import { type PackageFile } from '../src/types/PackageFile.ts'

describe('getCurrentDependencies', () => {
  let deps: PackageFile
  beforeEach(() => {
    deps = {
      dependencies: {
        bluebird: '^1.0.0',
        mocha: '1.2',
      },
      devDependencies: {
        lodash: '^3.9.3',
        moment: '^1.0.0',
      },
      peerDependencies: {
        'ncu-test-v2': '0.1.0',
      },
      optionalDependencies: {
        chalk: '^1.1.0',
      },
    }
  })

  it('return an empty object for an empty package.json and handle default options', () => {
    expect(getCurrentDependencies()).toStrictEqual({})
    expect(getCurrentDependencies({})).toStrictEqual({})
    expect(getCurrentDependencies({}, {})).toStrictEqual({})
  })

  it('get dependencies, devDependencies, and optionalDependencies by default', () => {
    expect(getCurrentDependencies(deps)).toStrictEqual({
      bluebird: '^1.0.0',
      mocha: '1.2',
      lodash: '^3.9.3',
      chalk: '^1.1.0',
      moment: '^1.0.0',
    })
  })

  describe('dep', () => {
    it('only get dependencies with --dep prod', () => {
      expect(getCurrentDependencies(deps, { dep: 'prod' })).toStrictEqual({
        bluebird: '^1.0.0',
        mocha: '1.2',
      })
    })

    it('only get devDependencies with --dep dev', () => {
      expect(getCurrentDependencies(deps, { dep: 'dev' })).toStrictEqual({
        lodash: '^3.9.3',
        moment: '^1.0.0',
      })
    })

    it('only get optionalDependencies with --dep optional', () => {
      expect(getCurrentDependencies(deps, { dep: 'optional' })).toStrictEqual({
        chalk: '^1.1.0',
      })
    })

    it('only get peerDependencies with --dep peer', () => {
      expect(getCurrentDependencies(deps, { dep: 'peer' })).toStrictEqual({
        'ncu-test-v2': '0.1.0',
      })
    })

    it('only get devDependencies and peerDependencies with --dep dev,peer', () => {
      expect(getCurrentDependencies(deps, { dep: 'dev,peer' })).toStrictEqual({
        lodash: '^3.9.3',
        moment: '^1.0.0',
        'ncu-test-v2': '0.1.0',
      })
    })
  })

  describe('filter', () => {
    it('filter dependencies by package name', () => {
      expect(getCurrentDependencies(deps, { filter: 'mocha' })).toStrictEqual({
        mocha: '1.2',
      })
    })

    it('filter dependencies by @org/package name', () => {
      const deps = {
        dependencies: {
          '@ngrx/store': '4.0.0',
          mocha: '1.0.0',
        },
      }

      expect(getCurrentDependencies(deps, { filter: '@ngrx/store' })).toStrictEqual({
        '@ngrx/store': '4.0.0',
      })
    })

    it('do not filter out dependencies with a partial package name', () => {
      expect(getCurrentDependencies(deps, { filter: 'o' })).toStrictEqual({})
    })

    it('filter dependencies by multiple packages', () => {
      expect(getCurrentDependencies(deps, { filter: 'mocha lodash' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
      expect(getCurrentDependencies(deps, { filter: 'mocha,lodash' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
      expect(getCurrentDependencies(deps, { filter: ['mocha', 'lodash'] })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
    })

    it('filter dependencies by regex', () => {
      expect(getCurrentDependencies(deps, { filter: /o/ })).toStrictEqual({
        lodash: '^3.9.3',
        mocha: '1.2',
        moment: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { filter: '/o/' })).toStrictEqual({
        lodash: '^3.9.3',
        mocha: '1.2',
        moment: '^1.0.0',
      })
    })

    it('filter org dependencies by regex', () => {
      const deps = {
        dependencies: {
          '@ngrx/store': '4.0.0',
          mocha: '1.0.0',
        },
      }

      expect(getCurrentDependencies(deps, { filter: /store/ })).toStrictEqual({
        '@ngrx/store': '4.0.0',
      })
    })

    it('filter dependencies by name with a filter function', () => {
      expect(getCurrentDependencies(deps, { filter: (s: string) => s.startsWith('m') })).toStrictEqual({
        mocha: '1.2',
        moment: '^1.0.0',
      })
    })

    it('filter dependencies by version spec with a filter function', () => {
      expect(
        getCurrentDependencies(deps, {
          filter: (name: string, versionSpec: SemVer[]) => versionSpec[0].major === '1',
        }),
      ).toStrictEqual({
        mocha: '1.2',
        moment: '^1.0.0',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
      })
    })
  })

  describe('filterVersion', () => {
    it('filter dependency versions by pinned version', () => {
      expect(getCurrentDependencies(deps, { filterVersion: '1.2' })).toStrictEqual({
        mocha: '1.2',
      })
    })

    it('filter dependency versions by caret version', () => {
      expect(getCurrentDependencies(deps, { filterVersion: '^1.0.0' })).toStrictEqual({
        moment: '^1.0.0',
        bluebird: '^1.0.0',
      })
    })

    it('filter dependencies by multiple versions (comma-or-space-delimited)', () => {
      expect(getCurrentDependencies(deps, { filterVersion: '^1.0.0,^1.1.0' })).toStrictEqual({
        chalk: '^1.1.0',
        moment: '^1.0.0',
        bluebird: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { filterVersion: '^1.0.0 ^1.1.0' })).toStrictEqual({
        chalk: '^1.1.0',
        moment: '^1.0.0',
        bluebird: '^1.0.0',
      })
    })

    it('filter dependency versions by regex', () => {
      expect(getCurrentDependencies(deps, { filterVersion: '/^\\^1/' })).toStrictEqual({
        chalk: '^1.1.0',
        moment: '^1.0.0',
        bluebird: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { filterVersion: /^\^1/ })).toStrictEqual({
        chalk: '^1.1.0',
        moment: '^1.0.0',
        bluebird: '^1.0.0',
      })
    })

    it('throw on a filterVersion function', () => {
      expect(() =>
        getCurrentDependencies(deps, {
          filterVersion: ((name: string, versionSpec: SemVer[]) => versionSpec[0].major === '1') as never,
        }),
      ).toThrow('do not support predicate functions')
    })
  })

  describe('reject', () => {
    it('reject dependencies by package name', () => {
      expect(getCurrentDependencies(deps, { reject: 'chalk' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
        bluebird: '^1.0.0',
        moment: '^1.0.0',
      })
    })

    it('do not reject dependencies with a partial package name', () => {
      expect(getCurrentDependencies(deps, { reject: 'o' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0',
      })
    })

    it('reject dependencies by multiple packages', () => {
      expect(getCurrentDependencies(deps, { reject: 'mocha lodash' })).toStrictEqual({
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { reject: 'mocha,lodash' })).toStrictEqual({
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { reject: ['mocha', 'lodash'] })).toStrictEqual({
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
        moment: '^1.0.0',
      })
    })

    it('reject dependencies by regex', () => {
      expect(getCurrentDependencies(deps, { reject: /o/ })).toStrictEqual({
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
      })
      expect(getCurrentDependencies(deps, { reject: '/o/' })).toStrictEqual({
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
      })
    })

    it('reject dependencies by function', () => {
      expect(getCurrentDependencies(deps, { reject: (s: string) => s.startsWith('m') })).toStrictEqual({
        lodash: '^3.9.3',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
      })
    })

    it('filter and reject', () => {
      expect(getCurrentDependencies(deps, { filter: 'mocha chalk', reject: 'chalk' })).toStrictEqual({
        mocha: '1.2',
      })
    })
  })

  describe('rejectVersion', () => {
    it('reject dependency versions by pinned version', () => {
      expect(getCurrentDependencies(deps, { rejectVersion: '1.2' })).toStrictEqual({
        lodash: '^3.9.3',
        moment: '^1.0.0',
        chalk: '^1.1.0',
        bluebird: '^1.0.0',
      })
    })

    it('reject dependency versions by caret version', () => {
      expect(getCurrentDependencies(deps, { rejectVersion: '^1.0.0' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
        chalk: '^1.1.0',
      })
    })

    it('reject dependencies by multiple versions (comma-or-space-delimited)', () => {
      expect(getCurrentDependencies(deps, { rejectVersion: '^1.0.0,^1.1.0' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
      expect(getCurrentDependencies(deps, { rejectVersion: '^1.0.0 ^1.1.0' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
    })

    it('reject dependency versions by regex', () => {
      expect(getCurrentDependencies(deps, { rejectVersion: '/^\\^1/' })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
      expect(getCurrentDependencies(deps, { rejectVersion: /^\^1/ })).toStrictEqual({
        mocha: '1.2',
        lodash: '^3.9.3',
      })
    })

    it('throw on a rejectVersion function', () => {
      expect(() =>
        getCurrentDependencies(deps, { rejectVersion: ((s: string) => s.startsWith('^3')) as never }),
      ).toThrow('do not support predicate functions')
    })
  })
})
