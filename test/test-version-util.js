'use strict'

const chai = require('chai')
const chalk = require('chalk')
const chaiAsPromised = require('chai-as-promised')
const versionUtil = require('../lib/version-util')

const should = chai.should()

chai.use(chaiAsPromised)

describe('version-util', () => {

  describe('numParts', () => {
    it('count the number of parts in a version', () => {
      versionUtil.numParts('1').should.equal(1)
      versionUtil.numParts('1.2').should.equal(2)
      versionUtil.numParts('1.2.3').should.equal(3)
      versionUtil.numParts('1.2.3-alpha.1').should.equal(4)
      versionUtil.numParts('1.2.3+build12345').should.equal(4)
    })
  })

  describe('getPrecision', () => {

    it('detect versions as precise as "major"', () => {
      versionUtil.getPrecision('1').should.equal('major')
    })

    it('detect versions as precise as "minor"', () => {
      versionUtil.getPrecision('1.2').should.equal('minor')
    })

    it('detect versions as precise as "patch"', () => {
      versionUtil.getPrecision('1.2.3').should.equal('patch')
    })

    it('detect versions as precise as "release"', () => {
      versionUtil.getPrecision('1.2.3-alpha.1').should.equal('release')
      versionUtil.getPrecision('1.2.3-beta.1').should.equal('release')
      versionUtil.getPrecision('1.2.3-rc.1').should.equal('release')
      versionUtil.getPrecision('1.2.3-alpha').should.equal('release')
      versionUtil.getPrecision('1.2.3-beta').should.equal('release')
      versionUtil.getPrecision('1.2.3-rc').should.equal('release')
    })

    it('detect versions as precise as "build"', () => {
      versionUtil.getPrecision('1.2.3+build12345').should.equal('build')
    })

  })

  describe('stringify', () => {

    it('build a version string of the given parts', () => {

      versionUtil.stringify({ major: '1' }).should.equal('1')

      versionUtil.stringify({
        major: '1',
        minor: '2'
      }).should.equal('1.2')

      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3'
      }).should.equal('1.2.3')

      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3',
        release: 'alpha.1'
      }).should.equal('1.2.3-alpha.1')

      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3',
        build: 'build12345'
      }).should.equal('1.2.3+build12345')

    })

    it('pad the version with an optional precison argument', () => {

      versionUtil.stringify({ major: '1' }, 'minor').should.equal('1.0')
      versionUtil.stringify({ major: '1' }, 'patch').should.equal('1.0.0')
    })

    it('truncate the version when a precision is provided', () => {
      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3',
        build: 'build12345'
      }, 'patch').should.equal('1.2.3')
      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3',
        build: 'build12345'
      }, 'minor').should.equal('1.2')
      versionUtil.stringify({
        major: '1',
        minor: '2',
        patch: '3',
        build: 'build12345'
      }, 'major').should.equal('1')
    })

  })

  describe('setPrecision', () => {

    it('set the precision of a version at "major"', () => {
      versionUtil.setPrecision('1.2.3-alpha.1', 'major').should.equal('1')
    })

    it('set the precision of a version at "minor"', () => {
      versionUtil.setPrecision('1.2.3-alpha.1', 'minor').should.equal('1.2')
    })

    it('add 0 to minor if needed', () => {
      versionUtil.setPrecision('1', 'minor').should.equal('1.0')
    })

    it('set the precision of a version at "patch"', () => {
      versionUtil.setPrecision('1.2.3-alpha.1', 'patch').should.equal('1.2.3')
    })

    it('add 0 to patch if needed', () => {
      versionUtil.setPrecision('1', 'patch').should.equal('1.0.0')
    })

    it('set the precision of a version at "release"', () => {
      versionUtil.setPrecision('1.2.3-alpha.1', 'release').should.equal('1.2.3-alpha.1')
    })

    it('set the precision of a version at "build"', () => {
      versionUtil.setPrecision('1.2.3+build12345', 'build').should.equal('1.2.3+build12345')
    })

  })

  describe('precisionAdd', () => {
    it('handle precision increase/decrease of base precisions', () => {
      versionUtil.precisionAdd('major', 0).should.equal('major')
      versionUtil.precisionAdd('major', 1).should.equal('minor')
      versionUtil.precisionAdd('major', 2).should.equal('patch')
      versionUtil.precisionAdd('minor', -1).should.equal('major')
      versionUtil.precisionAdd('minor', 0).should.equal('minor')
      versionUtil.precisionAdd('minor', 1).should.equal('patch')
      versionUtil.precisionAdd('patch', -2).should.equal('major')
      versionUtil.precisionAdd('patch', -1).should.equal('minor')
      versionUtil.precisionAdd('patch', 0).should.equal('patch')
    })

    it('handle precision decrease of added precisions (release, build)', () => {
      versionUtil.precisionAdd('build', -1).should.equal('patch')
      versionUtil.precisionAdd('build', -2).should.equal('minor')
      versionUtil.precisionAdd('build', -3).should.equal('major')
      versionUtil.precisionAdd('release', -1).should.equal('patch')
      versionUtil.precisionAdd('release', -2).should.equal('minor')
      versionUtil.precisionAdd('release', -3).should.equal('major')
    })
  })

  describe('addWildCard', () => {
    it('add ~', () => {
      versionUtil.addWildCard('1', '~').should.equal('~1')
      versionUtil.addWildCard('1.2', '~').should.equal('~1.2')
      versionUtil.addWildCard('1.2.3', '~').should.equal('~1.2.3')
      versionUtil.addWildCard('1.2.3-alpha.1', '~').should.equal('~1.2.3-alpha.1')
      versionUtil.addWildCard('1.2.3+build12345', '~').should.equal('~1.2.3+build12345')
    })
    it('add ^', () => {
      versionUtil.addWildCard('1', '^').should.equal('^1')
      versionUtil.addWildCard('1.2', '^').should.equal('^1.2')
      versionUtil.addWildCard('1.2.3', '^').should.equal('^1.2.3')
      versionUtil.addWildCard('1.2.3-alpha.1', '^').should.equal('^1.2.3-alpha.1')
      versionUtil.addWildCard('1.2.3+build12345', '^').should.equal('^1.2.3+build12345')
    })
    it('add .*', () => {
      versionUtil.addWildCard('1', '.*').should.equal('1.*')
      versionUtil.addWildCard('1.2', '.*').should.equal('1.*')
      versionUtil.addWildCard('1.2.3', '.*').should.equal('1.*')
      versionUtil.addWildCard('1.2.3-alpha.1', '.*').should.equal('1.*')
      versionUtil.addWildCard('1.2.3+build12345', '.*').should.equal('1.*')
    })
    it('add .x', () => {
      versionUtil.addWildCard('1', '.x').should.equal('1.x')
      versionUtil.addWildCard('1.2', '.x').should.equal('1.x')
      versionUtil.addWildCard('1.2.3', '.x').should.equal('1.x')
      versionUtil.addWildCard('1.2.3-alpha.1', '.x').should.equal('1.x')
      versionUtil.addWildCard('1.2.3+build12345', '.x').should.equal('1.x')
    })
  })

  describe('isWildCard', () => {
    it('return true for ~', () => {
      versionUtil.isWildCard('~').should.equal(true)
    })
    it('return true for ^', () => {
      versionUtil.isWildCard('^').should.equal(true)
    })
    it('return true for ^*', () => {
      versionUtil.isWildCard('^*').should.equal(true)
    })
    it('return true for *', () => {
      versionUtil.isWildCard('*').should.equal(true)
    })
    it('return true for x', () => {
      versionUtil.isWildCard('x').should.equal(true)
    })
    it('return true for x.x', () => {
      versionUtil.isWildCard('x.x').should.equal(true)
    })
    it('return true for x.x.x', () => {
      versionUtil.isWildCard('x.x.x').should.equal(true)
    })
    it('return false for strings that more than a wildcard', () => {
      versionUtil.isWildCard('^0.15.0').should.equal(false)
      versionUtil.isWildCard('1.*').should.equal(false)
    })
  })

  describe('isWildPart', () => {
    it('return true for *', () => {
      versionUtil.isWildPart('*').should.equal(true)
    })
    it('return true for x', () => {
      versionUtil.isWildPart('x').should.equal(true)
    })
    it('return false for anything other than * or x', () => {
      versionUtil.isWildPart('^').should.equal(false)
      versionUtil.isWildPart('~').should.equal(false)
      versionUtil.isWildPart('1.*').should.equal(false)
      versionUtil.isWildPart('1.x').should.equal(false)
      versionUtil.isWildPart('^0.15.0').should.equal(false)
    })
  })

  describe('colorizeDiff', () => {
    it('do not colorize unchanged versions', () => {
      versionUtil.colorizeDiff('1.0.0', '1.0.0').should.equal('1.0.0')
    })
    it('colorize changed patch versions', () => {
      versionUtil.colorizeDiff('1.0.0', '1.0.1').should.equal(`1.0.${chalk.green('1')}`)
    })
    it('colorize changed minor versions', () => {
      versionUtil.colorizeDiff('1.0.0', '1.1.0').should.equal(`1.${chalk.cyan('1.0')}`)
    })
    it('colorize changed major versions', () => {
      versionUtil.colorizeDiff('1.0.0', '2.0.0').should.equal(chalk.red('2.0.0'))
    })
    it('colorize whole parts', () => {
      versionUtil.colorizeDiff('1.0.10', '1.0.11').should.equal(`1.0.${chalk.green('11')}`)
    })
    it('do not include the leading ^ or ~ if the same', () => {
      versionUtil.colorizeDiff('^1.0.0', '^2.0.0').should.equal(`^${chalk.red('2.0.0')}`)
      versionUtil.colorizeDiff('~1.0.0', '~2.0.0').should.equal(`~${chalk.red('2.0.0')}`)
    })
    it('colorize changed versions before 1.0.0 as breaking', () => {
      versionUtil.colorizeDiff('0.1.0', '0.2.0').should.equal(`0.${chalk.red('2.0')}`)
      versionUtil.colorizeDiff('0.1.0', '0.1.1').should.equal(`0.1.${chalk.red('1')}`)
      versionUtil.colorizeDiff('~0.1.0', '~0.1.1').should.equal(`~0.1.${chalk.red('1')}`)
    })
  })

  describe('findGreatestByLevel', () => {

    it('find the greatest version at the given semantic versioning level', () => {
      const versions = ['0.1.0', '1.0.0', '1.0.1', '1.1.0', '2.0.1']

      versionUtil.findGreatestByLevel(versions, '1.0.0', 'major').should.equal('2.0.1')
      versionUtil.findGreatestByLevel(versions, '2.0.0', 'major').should.equal('2.0.1')
      versionUtil.findGreatestByLevel(versions, '1.0.0', 'minor').should.equal('1.1.0')
      versionUtil.findGreatestByLevel(versions, '1.1.0', 'minor').should.equal('1.1.0')
      versionUtil.findGreatestByLevel(versions, '1.0.0', 'patch').should.equal('1.0.1')
      versionUtil.findGreatestByLevel(versions, '1.0.1', 'patch').should.equal('1.0.1')
    })

    it('handle wildcards', () => {
      const versions = ['1.0.1', '1.0.2']

      should.equal(versionUtil.findGreatestByLevel(versions, '^1.0.1', 'minor'), '1.0.2')
      should.equal(versionUtil.findGreatestByLevel(versions, '1.*', 'minor'), '1.0.2')
      should.equal(versionUtil.findGreatestByLevel(versions, '1.1', 'minor'), '1.0.2')
      should.equal(versionUtil.findGreatestByLevel(versions, '1.x', 'minor'), '1.0.2')
      should.equal(versionUtil.findGreatestByLevel(versions, '>1.1', 'minor'), '1.0.2')
    })

    it('sort version list', () => {
      const versions = ['0.1.0', '0.3.0', '0.2.0']
      versionUtil.findGreatestByLevel(versions, '0.1.0', 'minor').should.equal('0.3.0')
    })

  })

  describe('isPre', () => {

    it('return false for non-prerelease versions', () => {
      versionUtil.isPre('1.0.0').should.equal(false)
    })

    it('return true for prerelease versions', () => {
      versionUtil.isPre('1.0.0-alpha').should.equal(true)
      versionUtil.isPre('1.0.0-beta').should.equal(true)
      versionUtil.isPre('1.0.0-rc').should.equal(true)
    })

  })

  describe('npm aliases', () => {

    describe('createNpmAlias', () => {

      it('create an npm alias from a name and version', () => {
        versionUtil.createNpmAlias('chalk', '1.0.0').should.equal('npm:chalk@1.0.0')
      })

    })

    describe('parseNpmAlias', () => {

      it('parse an npm alias into [name, version]', () => {
        versionUtil.parseNpmAlias('npm:chalk@1.0.0').should.eql(['chalk', '1.0.0'])
      })

      it('return null if given a non-alias', () => {
        should.equal(versionUtil.parseNpmAlias('1.0.0'), null)
      })
    })

    describe('isNpmAlias', () => {

      it('return true if an npm alias', () => {
        should.equal(versionUtil.isNpmAlias('npm:chalk@1.0.0'), true)
        should.equal(versionUtil.isNpmAlias('npm:chalk@^1.0.0'), true)
      })

      it('return false if not an npm alias', () => {
        should.equal(versionUtil.isNpmAlias('1.0.0'), false)
        should.equal(versionUtil.isNpmAlias('npm:chalk'), false)
      })

    })

    describe('upgradeNpmAlias', () => {

      it('replace embedded version', () => {
        versionUtil.upgradeNpmAlias('npm:chalk@^1.0.0', '2.0.0')
          .should.equal('npm:chalk@2.0.0')
      })

    })

  })

  describe('github urls', () => {

    describe('isGithubUrl', () => {

      it('return true if a declaration is a Github url with a semver tag and false otherwise', () => {
        should.equal(versionUtil.isGithubUrl(null), false)
        should.equal(versionUtil.isGithubUrl('https://github.com/raineorshine/ncu-test-v2'), false)
        should.equal(versionUtil.isGithubUrl('https://github.com/raineorshine/ncu-test-v2#1.0.0'), true)
        should.equal(versionUtil.isGithubUrl('https://github.com/raineorshine/ncu-test-v2#v1.0.0'), true)
      })

    })

    describe('getGithubUrlTag', () => {

      it('return an embedded tag in a Github URL, or null if not valid', () => {
        should.equal(versionUtil.getGithubUrlTag(null), null)
        should.equal(versionUtil.getGithubUrlTag('https://github.com/raineorshine/ncu-test-v2'), null)
        should.equal(versionUtil.getGithubUrlTag('https://github.com/raineorshine/ncu-test-v2#1.0.0'), '1.0.0')
        should.equal(versionUtil.getGithubUrlTag('https://github.com/raineorshine/ncu-test-v2#v1.0.0'), 'v1.0.0')
      })

    })

    describe('upgradeGithubUrl', () => {

      it('replace embedded version', () => {
        versionUtil.upgradeGithubUrl('https://github.com/raineorshine/ncu-test-v2#v1.0.0', 'v2.0.0')
          .should.equal('https://github.com/raineorshine/ncu-test-v2#v2.0.0')
        versionUtil.upgradeGithubUrl('https://github.com/raineorshine/ncu-test-v2#1.0.0', '2.0.0')
          .should.equal('https://github.com/raineorshine/ncu-test-v2#2.0.0')
      })

    })

  })

})
