import { describe, expect, it } from 'vitest'
import chalk, { chalkInit } from '../src/lib/chalk.ts'
import * as versionUtil from '../src/lib/version-util.ts'

describe('version-util', () => {
  describe('upgradeDependencyDeclaration', () => {
    it('numeric upgrades', () => {
      expect(versionUtil.upgradeDependencyDeclaration('0', '1.0.0')).toBe('1')
      expect(versionUtil.upgradeDependencyDeclaration('1', '10.0.0')).toBe('10')

      expect(versionUtil.upgradeDependencyDeclaration('0.1', '1.0.0')).toBe('1.0')
      expect(versionUtil.upgradeDependencyDeclaration('1.0', '1.1.0')).toBe('1.1')

      expect(versionUtil.upgradeDependencyDeclaration('1.0.0', '1.0.1')).toBe('1.0.1')
      expect(versionUtil.upgradeDependencyDeclaration('1.0.1', '1.1.0')).toBe('1.1.0')
      expect(versionUtil.upgradeDependencyDeclaration('2.0.1', '2.0.11')).toBe('2.0.11')
    })

    it('wildcard upgrades', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.x', '1.1.0')).toBe('1.x')
      expect(versionUtil.upgradeDependencyDeclaration('1.x.1', '1.1.2')).toBe('1.x.2')
      expect(versionUtil.upgradeDependencyDeclaration('1.0.x', '1.1.1')).toBe('1.1.x')
      expect(versionUtil.upgradeDependencyDeclaration('1.0.x', '1.1.0')).toBe('1.1.x')
      expect(versionUtil.upgradeDependencyDeclaration('1.0.x', '2.0.0')).toBe('2.0.x')

      expect(versionUtil.upgradeDependencyDeclaration('*', '1.0.0')).toBe('*')
      expect(versionUtil.upgradeDependencyDeclaration('1.*', '2.0.1')).toBe('2.*')

      expect(versionUtil.upgradeDependencyDeclaration('^*', '1.0.0')).toBe('^*')

      expect(versionUtil.upgradeDependencyDeclaration('x', '1.0.0')).toBe('x')
      expect(versionUtil.upgradeDependencyDeclaration('x.x', '1.0.0')).toBe('x.x')
      expect(versionUtil.upgradeDependencyDeclaration('x.x.x', '1.0.0')).toBe('x.x.x')
    })

    it('convert < to ^', () => {
      expect(versionUtil.upgradeDependencyDeclaration('<1', '2.1.0')).toBe('^2')
      expect(versionUtil.upgradeDependencyDeclaration('<1.0', '1.1.0')).toBe('^1.1')
    })

    it('preserve >=', () => {
      expect(versionUtil.upgradeDependencyDeclaration('>=1.0', '2.0.0')).toBe('>=2.0')
    })

    it('convert > to >=', () => {
      expect(versionUtil.upgradeDependencyDeclaration('>1.0.0', '2.0.0')).toBe('>=2.0.0')
    })

    it('preserve ^ and ~', () => {
      expect(versionUtil.upgradeDependencyDeclaration('^1.2.3', '1.2.4')).toBe('^1.2.4')
      expect(versionUtil.upgradeDependencyDeclaration('~1.2.3', '1.2.4')).toBe('~1.2.4')
    })

    it('preserve prerelease versions', () => {
      expect(versionUtil.upgradeDependencyDeclaration('^0.15.7', '0.16.0-beta.3')).toBe('^0.16.0-beta.3')
    })

    it('replace multiple ranges with ^', () => {
      expect(versionUtil.upgradeDependencyDeclaration('>1.0 >2.0 < 3.0', '3.1.0')).toBe('^3.1')
    })

    it('handle ||', () => {
      expect(versionUtil.upgradeDependencyDeclaration('~1.0 || ~1.2', '3.1.0')).toBe('~3.1')
    })

    it('hyphen (-) range', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.0 - 2.0', '3.1.0')).toBe('3.1')
    })

    it('use the range with the fewest parts if there are multiple ranges', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.1 || 1.2.0', '3.1.0')).toBe('3.1')
      expect(versionUtil.upgradeDependencyDeclaration('1.2.0 || 1.1', '3.1.0')).toBe('3.1')
    })

    it('preserve wildcards in comparisons', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.x < 1.2.0', '3.1.0')).toBe('3.x')
    })

    it('use the first operator if a comparison has mixed operators', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.x < 1.*', '3.1.0')).toBe('3.x')
    })

    it("maintain 'unclean' semantic versions", () => {
      expect(versionUtil.upgradeDependencyDeclaration('v1.0', '1.1')).toBe('v1.1')
      expect(versionUtil.upgradeDependencyDeclaration('=v1.0', '1.1')).toBe('=v1.1')
      expect(versionUtil.upgradeDependencyDeclaration(' =v1.0', '1.1')).toBe('=v1.1')
    })

    it("maintain 'unclean' semantic versions", () => {
      expect(versionUtil.upgradeDependencyDeclaration('v1.0', '1.1')).toBe('v1.1')
      expect(versionUtil.upgradeDependencyDeclaration('=v1.0', '1.1')).toBe('=v1.1')
      expect(versionUtil.upgradeDependencyDeclaration(' =v1.0', '1.1')).toBe('=v1.1')
    })

    it('maintain existing version if new version is unknown', () => {
      expect(versionUtil.upgradeDependencyDeclaration('1.0', '')).toBe('1.0')
      expect(versionUtil.upgradeDependencyDeclaration('1.0', null)).toBe('1.0')
    })

    it('remove semver range if removeRange option is specified', () => {
      expect(versionUtil.upgradeDependencyDeclaration('^1.0.0', '1.0.1', { removeRange: true })).toBe('1.0.1')
      expect(versionUtil.upgradeDependencyDeclaration('2.2.*', '3.1.1', { removeRange: true })).toBe('3.1.1')
    })
  })

  describe('numParts', () => {
    it('count the number of parts in a version', () => {
      expect(versionUtil.numParts('1')).toBe(1)
      expect(versionUtil.numParts('1.2')).toBe(2)
      expect(versionUtil.numParts('1.2.3')).toBe(3)
      expect(versionUtil.numParts('1.2.3-alpha.1')).toBe(4)
      expect(versionUtil.numParts('1.2.3+build12345')).toBe(4)
    })
  })

  describe('getPrecision', () => {
    it('detect versions as precise as "major"', () => {
      expect(versionUtil.getPrecision('1')).toBe('major')
    })

    it('detect versions as precise as "minor"', () => {
      expect(versionUtil.getPrecision('1.2')).toBe('minor')
    })

    it('detect versions as precise as "patch"', () => {
      expect(versionUtil.getPrecision('1.2.3')).toBe('patch')
    })

    it('detect versions as precise as "release"', () => {
      expect(versionUtil.getPrecision('1.2.3-alpha.1')).toBe('release')
      expect(versionUtil.getPrecision('1.2.3-beta.1')).toBe('release')
      expect(versionUtil.getPrecision('1.2.3-rc.1')).toBe('release')
      expect(versionUtil.getPrecision('1.2.3-alpha')).toBe('release')
      expect(versionUtil.getPrecision('1.2.3-beta')).toBe('release')
      expect(versionUtil.getPrecision('1.2.3-rc')).toBe('release')
    })

    it('detect versions as precise as "build"', () => {
      expect(versionUtil.getPrecision('1.2.3+build12345')).toBe('build')
    })
  })

  describe('stringify', () => {
    it('build a version string of the given parts', () => {
      expect(versionUtil.stringify({ major: '1' })).toBe('1')

      expect(
        versionUtil.stringify({
          major: '1',
          minor: '2',
        }),
      ).toBe('1.2')

      expect(
        versionUtil.stringify({
          major: '1',
          minor: '2',
          patch: '3',
        }),
      ).toBe('1.2.3')

      expect(
        versionUtil.stringify({
          major: '1',
          minor: '2',
          patch: '3',
          release: 'alpha.1',
        }),
      ).toBe('1.2.3-alpha.1')

      expect(
        versionUtil.stringify({
          major: '1',
          minor: '2',
          patch: '3',
          build: 'build12345',
        }),
      ).toBe('1.2.3+build12345')
    })

    it('pad the version with an optional precision argument', () => {
      expect(versionUtil.stringify({ major: '1' }, 'minor')).toBe('1.0')
      expect(versionUtil.stringify({ major: '1' }, 'patch')).toBe('1.0.0')
    })

    it('truncate the version when a precision is provided', () => {
      expect(
        versionUtil.stringify(
          {
            major: '1',
            minor: '2',
            patch: '3',
            build: 'build12345',
          },
          'patch',
        ),
      ).toBe('1.2.3')
      expect(
        versionUtil.stringify(
          {
            major: '1',
            minor: '2',
            patch: '3',
            build: 'build12345',
          },
          'minor',
        ),
      ).toBe('1.2')
      expect(
        versionUtil.stringify(
          {
            major: '1',
            minor: '2',
            patch: '3',
            build: 'build12345',
          },
          'major',
        ),
      ).toBe('1')
    })
  })

  describe('setPrecision', () => {
    it('set the precision of a version at "major"', () => {
      expect(versionUtil.setPrecision('1.2.3-alpha.1', 'major')).toBe('1')
    })

    it('set the precision of a version at "minor"', () => {
      expect(versionUtil.setPrecision('1.2.3-alpha.1', 'minor')).toBe('1.2')
    })

    it('add 0 to minor if needed', () => {
      expect(versionUtil.setPrecision('1', 'minor')).toBe('1.0')
    })

    it('set the precision of a version at "patch"', () => {
      expect(versionUtil.setPrecision('1.2.3-alpha.1', 'patch')).toBe('1.2.3')
    })

    it('add 0 to patch if needed', () => {
      expect(versionUtil.setPrecision('1', 'patch')).toBe('1.0.0')
    })

    it('set the precision of a version at "release"', () => {
      expect(versionUtil.setPrecision('1.2.3-alpha.1', 'release')).toBe('1.2.3-alpha.1')
    })

    it('set the precision of a version at "build"', () => {
      expect(versionUtil.setPrecision('1.2.3+build12345', 'build')).toBe('1.2.3+build12345')
    })
  })

  describe('isComparable', () => {
    it('a version without a preid is comparable to any version', () => {
      expect(versionUtil.isComparable('2.0.1', '0.0.1')).toBe(true)
      expect(versionUtil.isComparable('1.2.3-1', '1.2.3')).toBe(true)
      expect(versionUtil.isComparable('1.3.3', '1.2.3-2')).toBe(true)
      expect(versionUtil.isComparable('2.0.1-1', '0.0.1-2')).toBe(true)
      expect(versionUtil.isComparable('1.2.3-alpha.1', '1.2.3')).toBe(true)
      expect(versionUtil.isComparable('1.3.3', '1.2.3-alpha.2')).toBe(true)
      expect(versionUtil.isComparable('1.2.3-.dev.1', '1.2.3')).toBe(true)
      expect(versionUtil.isComparable('1.2.3', '1.2.3-next.dev.1')).toBe(true)
      expect(versionUtil.isComparable('1.2.3-next.dev.5', '1.2.3-next.dev.1')).toBe(true)
    })

    it('versions with non-matching preids are not comparable', () => {
      expect(versionUtil.isComparable('1.2.3-1', '1.2.3-dev.1')).toBe(false)
      expect(versionUtil.isComparable('1.3.3-next.1', '1.2.3-dev.2')).toBe(false)
      expect(versionUtil.isComparable('2.0.1-next.1', '0.0.1-task-42.2')).toBe(false)
      expect(versionUtil.isComparable('1.2.3-next.0', '1.2.3-next.dev.0')).toBe(false)
      expect(versionUtil.isComparable('1.2.3-alpha.0', '1.2.3-next.dev.0')).toBe(false)
    })

    it('versions with matching preids are comparable', () => {
      expect(versionUtil.isComparable('1.3.3-next.1', '1.2.3-next.2')).toBe(true)
    })
  })

  describe('precisionAdd', () => {
    it('handle precision increase/decrease of base precisions', () => {
      expect(versionUtil.precisionAdd('major', 0)).toBe('major')
      expect(versionUtil.precisionAdd('major', 1)).toBe('minor')
      expect(versionUtil.precisionAdd('major', 2)).toBe('patch')
      expect(versionUtil.precisionAdd('minor', -1)).toBe('major')
      expect(versionUtil.precisionAdd('minor', 0)).toBe('minor')
      expect(versionUtil.precisionAdd('minor', 1)).toBe('patch')
      expect(versionUtil.precisionAdd('patch', -2)).toBe('major')
      expect(versionUtil.precisionAdd('patch', -1)).toBe('minor')
      expect(versionUtil.precisionAdd('patch', 0)).toBe('patch')
    })

    it('handle precision decrease of added precisions (release, build)', () => {
      expect(versionUtil.precisionAdd('build', -1)).toBe('patch')
      expect(versionUtil.precisionAdd('build', -2)).toBe('minor')
      expect(versionUtil.precisionAdd('build', -3)).toBe('major')
      expect(versionUtil.precisionAdd('release', -1)).toBe('patch')
      expect(versionUtil.precisionAdd('release', -2)).toBe('minor')
      expect(versionUtil.precisionAdd('release', -3)).toBe('major')
    })

    it('throws when the resulting precision is out of range', () => {
      expect(() => versionUtil.precisionAdd('major', -1)).toThrow('Invalid precision')
      expect(() => versionUtil.precisionAdd('build', 2)).toThrow('Invalid precision')
    })
  })

  describe('addWildCard', () => {
    it('add ~', () => {
      expect(versionUtil.addWildCard('1', '~')).toBe('~1')
      expect(versionUtil.addWildCard('1.2', '~')).toBe('~1.2')
      expect(versionUtil.addWildCard('1.2.3', '~')).toBe('~1.2.3')
      expect(versionUtil.addWildCard('1.2.3-alpha.1', '~')).toBe('~1.2.3-alpha.1')
      expect(versionUtil.addWildCard('1.2.3+build12345', '~')).toBe('~1.2.3+build12345')
    })
    it('add ^', () => {
      expect(versionUtil.addWildCard('1', '^')).toBe('^1')
      expect(versionUtil.addWildCard('1.2', '^')).toBe('^1.2')
      expect(versionUtil.addWildCard('1.2.3', '^')).toBe('^1.2.3')
      expect(versionUtil.addWildCard('1.2.3-alpha.1', '^')).toBe('^1.2.3-alpha.1')
      expect(versionUtil.addWildCard('1.2.3+build12345', '^')).toBe('^1.2.3+build12345')
    })
    it('add .*', () => {
      expect(versionUtil.addWildCard('1', '.*')).toBe('1.*')
      expect(versionUtil.addWildCard('1.2', '.*')).toBe('1.*')
      expect(versionUtil.addWildCard('1.2.3', '.*')).toBe('1.*')
      expect(versionUtil.addWildCard('1.2.3-alpha.1', '.*')).toBe('1.*')
      expect(versionUtil.addWildCard('1.2.3+build12345', '.*')).toBe('1.*')
    })
    it('add .x', () => {
      expect(versionUtil.addWildCard('1', '.x')).toBe('1.x')
      expect(versionUtil.addWildCard('1.2', '.x')).toBe('1.x')
      expect(versionUtil.addWildCard('1.2.3', '.x')).toBe('1.x')
      expect(versionUtil.addWildCard('1.2.3-alpha.1', '.x')).toBe('1.x')
      expect(versionUtil.addWildCard('1.2.3+build12345', '.x')).toBe('1.x')
    })
  })

  describe('isWildCard', () => {
    it('return true for ~', () => {
      expect(versionUtil.isWildCard('~')).toBe(true)
    })
    it('return true for ^', () => {
      expect(versionUtil.isWildCard('^')).toBe(true)
    })
    it('return true for ^*', () => {
      expect(versionUtil.isWildCard('^*')).toBe(true)
    })
    it('return true for *', () => {
      expect(versionUtil.isWildCard('*')).toBe(true)
    })
    it('return true for x', () => {
      expect(versionUtil.isWildCard('x')).toBe(true)
    })
    it('return true for x.x', () => {
      expect(versionUtil.isWildCard('x.x')).toBe(true)
    })
    it('return true for x.x.x', () => {
      expect(versionUtil.isWildCard('x.x.x')).toBe(true)
    })
    it('return false for strings that more than a wildcard', () => {
      expect(versionUtil.isWildCard('^0.15.0')).toBe(false)
      expect(versionUtil.isWildCard('1.*')).toBe(false)
    })
  })

  describe('isWildPart', () => {
    it('return true for *', () => {
      expect(versionUtil.isWildPart('*')).toBe(true)
    })
    it('return true for x', () => {
      expect(versionUtil.isWildPart('x')).toBe(true)
    })
    it('return false for anything other than * or x', () => {
      expect(versionUtil.isWildPart('^')).toBe(false)
      expect(versionUtil.isWildPart('~')).toBe(false)
      expect(versionUtil.isWildPart('1.*')).toBe(false)
      expect(versionUtil.isWildPart('1.x')).toBe(false)
      expect(versionUtil.isWildPart('^0.15.0')).toBe(false)
    })
  })

  describe('partChanged', () => {
    it('nothing changed', () => {
      expect(versionUtil.partChanged('1.0.0', '1.0.0')).toBe('none')
    })
    it('patch changed', () => {
      expect(versionUtil.partChanged('1.0.0', '1.0.1')).toBe('patch')
      expect(versionUtil.partChanged('1.0.10', '1.0.11')).toBe('patch')
    })
    it('minor changed', () => {
      expect(versionUtil.partChanged('1.0.0', '1.1.0')).toBe('minor')
    })
    it('major changed', () => {
      expect(versionUtil.partChanged('1.0.0', '2.0.0')).toBe('major')
      expect(versionUtil.partChanged('^1.0.0', '^2.0.0')).toBe('major')
      expect(versionUtil.partChanged('~1.0.0', '~2.0.0')).toBe('major')
    })
    it('major version zero changed', () => {
      expect(versionUtil.partChanged('0.1.0', '0.2.0')).toBe('majorVersionZero')
      expect(versionUtil.partChanged('0.1.0', '0.1.1')).toBe('majorVersionZero')
      expect(versionUtil.partChanged('~0.1.0', '~0.1.1')).toBe('majorVersionZero')
    })
    it('handle a leading range operator that differs between from and to', () => {
      // upgradeDependencyDeclaration converts a "<" or "<=" declaration into a "^" range,
      // e.g. "<1.2.3" -> "^1.2.9". from and to no longer share the same leading character,
      // which used to prevent the operator from being stripped before comparing parts.
      expect(versionUtil.partChanged('<1.2.3', '^1.2.9')).toBe('patch')
      expect(versionUtil.partChanged('<1.2.3', '^1.3.0')).toBe('minor')
      expect(versionUtil.partChanged('<1.2.3', '^2.0.0')).toBe('major')
      expect(versionUtil.partChanged('<=1.2.3', '^1.2.9')).toBe('patch')
      // a bare "from" that gains a wildcard in "to" hits the same code path
      expect(versionUtil.partChanged('1.2.3', '^1.2.9')).toBe('patch')
      expect(versionUtil.partChanged('1.2.3', '^1.3.0')).toBe('minor')
    })
  })

  describe('colorizeDiff', () => {
    chalkInit()
    it('do not colorize unchanged versions', () => {
      expect(versionUtil.colorizeDiff('1.0.0', '1.0.0')).toBe('1.0.0')
    })
    it('colorize changed patch versions', () => {
      expect(versionUtil.colorizeDiff('1.0.0', '1.0.1')).toBe(`1.0.${chalk.green('1')}`)
    })
    it('colorize changed minor versions', () => {
      expect(versionUtil.colorizeDiff('1.0.0', '1.1.0')).toBe(`1.${chalk.cyan('1.0')}`)
    })
    it('colorize changed major versions', () => {
      expect(versionUtil.colorizeDiff('1.0.0', '2.0.0')).toBe(chalk.red('2.0.0'))
    })
    it('colorize whole parts', () => {
      expect(versionUtil.colorizeDiff('1.0.10', '1.0.11')).toBe(`1.0.${chalk.green('11')}`)
    })
    it('do not include the leading ^ or ~ if the same', () => {
      expect(versionUtil.colorizeDiff('^1.0.0', '^2.0.0')).toBe(`^${chalk.red('2.0.0')}`)
      expect(versionUtil.colorizeDiff('~1.0.0', '~2.0.0')).toBe(`~${chalk.red('2.0.0')}`)
    })
    it('colorize changed versions before 1.0.0 as breaking', () => {
      expect(versionUtil.colorizeDiff('0.1.0', '0.2.0')).toBe(`0.${chalk.red('2.0')}`)
      expect(versionUtil.colorizeDiff('0.1.0', '0.1.1')).toBe(`0.1.${chalk.red('1')}`)
      expect(versionUtil.colorizeDiff('~0.1.0', '~0.1.1')).toBe(`~0.1.${chalk.red('1')}`)
    })
    it('handle a leading range operator that differs between from and to', () => {
      // "<1.2.3" -> "^1.2.9" used to color the entire string red since the leading "<" on
      // `from` blocked the "^" from being stripped off `to` before the parts were compared.
      expect(versionUtil.colorizeDiff('<1.2.3', '^1.2.9')).toBe(`^1.2.${chalk.green('9')}`)
      expect(versionUtil.colorizeDiff('<1.2.3', '^1.3.0')).toBe(`^1.${chalk.cyan('3.0')}`)
      expect(versionUtil.colorizeDiff('1.2.3', '^1.2.9')).toBe(`^1.2.${chalk.green('9')}`)
    })
  })

  describe('getDependencyGroups', () => {
    chalkInit()

    it('groups upgrades by patch/minor/major in order', () => {
      const groups = versionUtil.getDependencyGroups(
        { a: '2.0.0', b: '1.1.0', c: '1.0.1' },
        { a: '1.0.0', b: '1.0.0', c: '1.0.0' },
        {},
      )
      expect(groups.map(g => ({ groupName: g.groupName, packages: g.packages }))).toStrictEqual([
        { groupName: 'patch', packages: { c: '1.0.1' } },
        { groupName: 'minor', packages: { b: '1.1.0' } },
        { groupName: 'major', packages: { a: '2.0.0' } },
      ])
    })

    it('honors a custom groupFunction, excluding groups named "none"', () => {
      const groups = versionUtil.getDependencyGroups(
        { a: '2.0.0', b: '1.1.0' },
        { a: '1.0.0', b: '1.0.0' },
        { groupFunction: dep => (dep === 'a' ? 'none' : 'my-group') },
      )
      expect(groups.map(g => ({ groupName: g.groupName, packages: g.packages }))).toStrictEqual([
        { groupName: 'my-group', packages: { b: '1.1.0' } },
      ])
    })
  })

  describe('filterByLevel', () => {
    it('only return true for versions at the given semantic versioning level', () => {
      const minor = versionUtil.filterByLevel('1.0.0', 'minor')
      expect(minor('1.0.0')).toBe(true)
      expect(minor('1.5.0')).toBe(true)
      expect(minor('2.0.0')).toBe(false)

      const patch = versionUtil.filterByLevel('1.0.0', 'patch')
      expect(patch('1.0.5')).toBe(true)
      expect(patch('1.1.0')).toBe(false)
    })

    it('return false for every version when current is not a valid semver range', () => {
      const catalog = versionUtil.filterByLevel('catalog:', 'minor')
      expect(catalog('1.0.0')).toBe(false)

      const workspace = versionUtil.filterByLevel('workspace:^1.0.0', 'patch')
      expect(workspace('1.0.0')).toBe(false)

      const link = versionUtil.filterByLevel('link:../local-pkg', 'minor')
      expect(link('1.0.0')).toBe(false)

      const file = versionUtil.filterByLevel('file:./local.tgz', 'patch')
      expect(file('1.0.0')).toBe(false)
    })
  })

  describe('filterBySatisfying', () => {
    it('returns true only for versions that satisfy the range', () => {
      const inRange = versionUtil.filterBySatisfying('^1.0.0')
      expect(inRange('1.5.0')).toBe(true)
      expect(inRange('2.0.0')).toBe(false)
    })
  })

  describe('findGreatestByLevel', () => {
    it('find the greatest version at the given semantic versioning level', () => {
      const versions = ['0.1.0', '1.0.0', '1.0.1', '1.1.0', '2.0.1']

      expect(versionUtil.findGreatestByLevel(versions, '1.0.0', 'major')).toBe('2.0.1')
      expect(versionUtil.findGreatestByLevel(versions, '2.0.0', 'major')).toBe('2.0.1')
      expect(versionUtil.findGreatestByLevel(versions, '1.0.0', 'minor')).toBe('1.1.0')
      expect(versionUtil.findGreatestByLevel(versions, '1.1.0', 'minor')).toBe('1.1.0')
      expect(versionUtil.findGreatestByLevel(versions, '1.0.0', 'patch')).toBe('1.0.1')
      expect(versionUtil.findGreatestByLevel(versions, '1.0.1', 'patch')).toBe('1.0.1')
    })

    it('find the greatest prerelease version', () => {
      const versions = ['0.1.0', '0.2.0-alpha.0', '0.2.0-alpha.1']
      expect(versionUtil.findGreatestByLevel(versions, '0.1.0', 'major')).toBe('0.2.0-alpha.1')
      expect(versionUtil.findGreatestByLevel(versions, '0.1.0', 'minor')).toBe('0.2.0-alpha.1')
      expect(versionUtil.findGreatestByLevel(versions, '0.1.0', 'patch')).toBe('0.1.0')
    })

    it('handle wildcards', () => {
      const versions = ['1.0.1', '1.0.2']

      expect(versionUtil.findGreatestByLevel(versions, '^1.0.1', 'minor')).toBe('1.0.2')
      expect(versionUtil.findGreatestByLevel(versions, '1.*', 'minor')).toBe('1.0.2')
      expect(versionUtil.findGreatestByLevel(versions, '1.1', 'minor')).toBe('1.0.2')
      expect(versionUtil.findGreatestByLevel(versions, '1.x', 'minor')).toBe('1.0.2')
      expect(versionUtil.findGreatestByLevel(versions, '>1.1', 'minor')).toBe('1.0.2')
    })

    it('sort version list', () => {
      const versions = ['0.1.0', '0.3.0', '0.2.0']
      expect(versionUtil.findGreatestByLevel(versions, '0.1.0', 'minor')).toBe('0.3.0')
    })
  })

  describe('isPre', () => {
    it('return false for non-prerelease versions', () => {
      expect(versionUtil.isPre('1.0.0')).toBe(false)
    })

    it('return true for prerelease versions', () => {
      expect(versionUtil.isPre('1.0.0-alpha')).toBe(true)
      expect(versionUtil.isPre('1.0.0-beta')).toBe(true)
      expect(versionUtil.isPre('1.0.0-rc')).toBe(true)
    })
  })

  describe('npm aliases', () => {
    describe('createNpmAlias', () => {
      it('create an npm alias from a name and version', () => {
        expect(versionUtil.createNpmAlias('chalk', '1.0.0')).toBe('npm:chalk@1.0.0')
      })
    })

    describe('parseNpmAlias', () => {
      it('parse an npm alias into [name, version]', () => {
        expect(versionUtil.parseNpmAlias('npm:chalk@1.0.0')).toStrictEqual(['chalk', '1.0.0'])
      })

      it('return null if given a non-alias', () => {
        expect(versionUtil.parseNpmAlias('1.0.0')).toBeNull()
      })
    })

    describe('isNpmAlias', () => {
      it('return true if an npm alias', () => {
        expect(versionUtil.isNpmAlias('npm:chalk@1.0.0')).toBe(true)
        expect(versionUtil.isNpmAlias('npm:chalk@^1.0.0')).toBe(true)
        expect(versionUtil.isNpmAlias('npm:postman-request@2.88.1-postman.33')).toBe(true)
      })

      it('return false if not an npm alias', () => {
        expect(versionUtil.isNpmAlias('1.0.0')).toBe(false)
        expect(versionUtil.isNpmAlias('npm:chalk')).toBe(false)
      })
    })

    describe('upgradeNpmAlias', () => {
      it('replace embedded version', () => {
        expect(versionUtil.upgradeNpmAlias('npm:chalk@^1.0.0', '2.0.0')).toBe('npm:chalk@2.0.0')
        expect(versionUtil.upgradeNpmAlias('npm:postman-request@2.88.1-postman.32', '2.88.1-postman.33')).toBe(
          'npm:postman-request@2.88.1-postman.33',
        )
      })
    })
  })

  describe('github urls', () => {
    describe('isGitHubUrl', () => {
      it('return true if a declaration is a GitHub url with a semver tag and false otherwise', () => {
        expect(versionUtil.isGitHubUrl(null)).toBe(false)
        expect(versionUtil.isGitHubUrl('https://github.com/raineorshine/ncu-test-v2')).toBe(false)
        expect(versionUtil.isGitHubUrl('https://github.com/raineorshine/ncu-test-v2#1.0.0')).toBe(true)
        expect(versionUtil.isGitHubUrl('https://github.com/raineorshine/ncu-test-v2#v1.0.0')).toBe(true)
      })
    })

    describe('getGitHubUrlTag', () => {
      it('return an embedded tag in a GitHub URL, or null if not valid', () => {
        expect(versionUtil.getGitHubUrlTag(null)).toBeNull()
        expect(versionUtil.getGitHubUrlTag('https://github.com/raineorshine/ncu-test-v2')).toBeNull()
        expect(versionUtil.getGitHubUrlTag('https://github.com/raineorshine/ncu-test-v2#1.0.0')).toBe('1.0.0')
        expect(versionUtil.getGitHubUrlTag('https://github.com/raineorshine/ncu-test-v2#v1.0.0')).toBe('v1.0.0')
      })
    })

    describe('upgradeGitHubUrl', () => {
      it('replace embedded version', () => {
        expect(versionUtil.upgradeGitHubUrl('https://github.com/raineorshine/ncu-test-v2#v1.0.0', 'v2.0.0')).toBe(
          'https://github.com/raineorshine/ncu-test-v2#v2.0.0',
        )
        expect(versionUtil.upgradeGitHubUrl('https://github.com/raineorshine/ncu-test-v2#1.0.0', '2.0.0')).toBe(
          'https://github.com/raineorshine/ncu-test-v2#2.0.0',
        )
      })
    })
  })
})
