'use strict';
const versionUtil = require('../lib/version-util');
const chai = require('chai');
const chalk = require('chalk');
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

describe('version-util', () => {

    describe('numParts', () => {
        it('should count the number of parts in a version', () => {
            versionUtil.numParts('1').should.equal(1);
            versionUtil.numParts('1.2').should.equal(2);
            versionUtil.numParts('1.2.3').should.equal(3);
            versionUtil.numParts('1.2.3-alpha.1').should.equal(4);
            versionUtil.numParts('1.2.3+build12345').should.equal(4);
        });
    });

    describe('getPrecision', () => {

        it('should detect versions as precise as "major"', () => {
            versionUtil.getPrecision('1').should.equal('major');
        });

        it('should detect versions as precise as "minor"', () => {
            versionUtil.getPrecision('1.2').should.equal('minor');
        });

        it('should detect versions as precise as "patch"', () => {
            versionUtil.getPrecision('1.2.3').should.equal('patch');
        });

        it('should detect versions as precise as "release"', () => {
            versionUtil.getPrecision('1.2.3-alpha.1').should.equal('release');
            versionUtil.getPrecision('1.2.3-beta.1').should.equal('release');
            versionUtil.getPrecision('1.2.3-rc.1').should.equal('release');
            versionUtil.getPrecision('1.2.3-alpha').should.equal('release');
            versionUtil.getPrecision('1.2.3-beta').should.equal('release');
            versionUtil.getPrecision('1.2.3-rc').should.equal('release');
        });

        it('should detect versions as precise as "build"', () => {
            versionUtil.getPrecision('1.2.3+build12345').should.equal('build');
        });

    });

    describe('stringify', () => {

        it('should build a version string of the given parts', () => {

            versionUtil.stringify({major: '1'}).should.equal('1');

            versionUtil.stringify({
                major: '1',
                minor: '2'
            }).should.equal('1.2');

            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3'
            }).should.equal('1.2.3');

            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3',
                release: 'alpha.1'
            }).should.equal('1.2.3-alpha.1');

            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }).should.equal('1.2.3+build12345');

        });

        it('should pad the version with an optional precison argument', () => {

            versionUtil.stringify({major: '1'}, 'minor').should.equal('1.0');
            versionUtil.stringify({major: '1'}, 'patch').should.equal('1.0.0');
        });

        it('should truncate the version when a precision is provided', () => {
            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'patch').should.equal('1.2.3');
            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'minor').should.equal('1.2');
            versionUtil.stringify({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'major').should.equal('1');
        });

    });

    describe('setPrecision', () => {

        it('should set the precision of a version at "major"', () => {
            versionUtil.setPrecision('1.2.3-alpha.1', 'major').should.equal('1');
        });

        it('should set the precision of a version at "minor"', () => {
            versionUtil.setPrecision('1.2.3-alpha.1', 'minor').should.equal('1.2');
        });

        it('should add 0 to minor if needed', () => {
            versionUtil.setPrecision('1', 'minor').should.equal('1.0');
        });

        it('should set the precision of a version at "patch"', () => {
            versionUtil.setPrecision('1.2.3-alpha.1', 'patch').should.equal('1.2.3');
        });

        it('should add 0 to patch if needed', () => {
            versionUtil.setPrecision('1', 'patch').should.equal('1.0.0');
        });

        it('should set the precision of a version at "release"', () => {
            versionUtil.setPrecision('1.2.3-alpha.1', 'release').should.equal('1.2.3-alpha.1');
        });

        it('should set the precision of a version at "build"', () => {
            versionUtil.setPrecision('1.2.3+build12345', 'build').should.equal('1.2.3+build12345');
        });

    });

    describe('precisionAdd', () => {
        it('should handle precision increase/decrease of base precisions', () => {
            versionUtil.precisionAdd('major', 0).should.equal('major');
            versionUtil.precisionAdd('major', 1).should.equal('minor');
            versionUtil.precisionAdd('major', 2).should.equal('patch');
            versionUtil.precisionAdd('minor', -1).should.equal('major');
            versionUtil.precisionAdd('minor', 0).should.equal('minor');
            versionUtil.precisionAdd('minor', 1).should.equal('patch');
            versionUtil.precisionAdd('patch', -2).should.equal('major');
            versionUtil.precisionAdd('patch', -1).should.equal('minor');
            versionUtil.precisionAdd('patch', 0).should.equal('patch');
        });

        it('should handle precision decrease of added precisions (release, build)', () => {
            versionUtil.precisionAdd('build', -1).should.equal('patch');
            versionUtil.precisionAdd('build', -2).should.equal('minor');
            versionUtil.precisionAdd('build', -3).should.equal('major');
            versionUtil.precisionAdd('release', -1).should.equal('patch');
            versionUtil.precisionAdd('release', -2).should.equal('minor');
            versionUtil.precisionAdd('release', -3).should.equal('major');
        });
    });

    describe('addWildCard', () => {
        it('should add ~', () => {
            versionUtil.addWildCard('1', '~').should.equal('~1');
            versionUtil.addWildCard('1.2', '~').should.equal('~1.2');
            versionUtil.addWildCard('1.2.3', '~').should.equal('~1.2.3');
            versionUtil.addWildCard('1.2.3-alpha.1', '~').should.equal('~1.2.3-alpha.1');
            versionUtil.addWildCard('1.2.3+build12345', '~').should.equal('~1.2.3+build12345');
        });
        it('should add ^', () => {
            versionUtil.addWildCard('1', '^').should.equal('^1');
            versionUtil.addWildCard('1.2', '^').should.equal('^1.2');
            versionUtil.addWildCard('1.2.3', '^').should.equal('^1.2.3');
            versionUtil.addWildCard('1.2.3-alpha.1', '^').should.equal('^1.2.3-alpha.1');
            versionUtil.addWildCard('1.2.3+build12345', '^').should.equal('^1.2.3+build12345');
        });
        it('should add .*', () => {
            versionUtil.addWildCard('1', '.*').should.equal('1.*');
            versionUtil.addWildCard('1.2', '.*').should.equal('1.*');
            versionUtil.addWildCard('1.2.3', '.*').should.equal('1.*');
            versionUtil.addWildCard('1.2.3-alpha.1', '.*').should.equal('1.*');
            versionUtil.addWildCard('1.2.3+build12345', '.*').should.equal('1.*');
        });
        it('should add .x', () => {
            versionUtil.addWildCard('1', '.x').should.equal('1.x');
            versionUtil.addWildCard('1.2', '.x').should.equal('1.x');
            versionUtil.addWildCard('1.2.3', '.x').should.equal('1.x');
            versionUtil.addWildCard('1.2.3-alpha.1', '.x').should.equal('1.x');
            versionUtil.addWildCard('1.2.3+build12345', '.x').should.equal('1.x');
        });
    });

    describe('isWildCard', () => {
        it('should return true for ~', () => {
            versionUtil.isWildCard('~').should.equal(true);
        });
        it('should return true for ^', () => {
            versionUtil.isWildCard('^').should.equal(true);
        });
        it('should return true for ^*', () => {
            versionUtil.isWildCard('^*').should.equal(true);
        });
        it('should return true for *', () => {
            versionUtil.isWildCard('*').should.equal(true);
        });
        it('should return true for x', () => {
            versionUtil.isWildCard('x').should.equal(true);
        });
        it('should return true for x.x', () => {
            versionUtil.isWildCard('x.x').should.equal(true);
        });
        it('should return true for x.x.x', () => {
            versionUtil.isWildCard('x.x.x').should.equal(true);
        });
        it('should return false for strings that more than a wildcard', () => {
            versionUtil.isWildCard('^0.15.0').should.equal(false);
            versionUtil.isWildCard('1.*').should.equal(false);
        });
    });

    describe('isWildPart', () => {
        it('should return true for *', () => {
            versionUtil.isWildPart('*').should.equal(true);
        });
        it('should return true for x', () => {
            versionUtil.isWildPart('x').should.equal(true);
        });
        it('should return false for anything other than * or x', () => {
            versionUtil.isWildPart('^').should.equal(false);
            versionUtil.isWildPart('~').should.equal(false);
            versionUtil.isWildPart('1.*').should.equal(false);
            versionUtil.isWildPart('1.x').should.equal(false);
            versionUtil.isWildPart('^0.15.0').should.equal(false);
        });
    });

    describe('colorizeDiff', () => {
        it('should not colorize unchanged versions', () => {
            versionUtil.colorizeDiff('1.0.0', '1.0.0').should.equal('1.0.0');
        });
        it('should colorize changed versions', () => {
            versionUtil.colorizeDiff('1.0.0', '1.0.1').should.equal(`1.0.${chalk.green('0')}`);
        });
        it('should colorize everything after the first difference', () => {
            versionUtil.colorizeDiff('1.0.0', '2.0.0').should.equal(chalk.green('1.0.0'));
        });
        it('should colorize whole parts', () => {
            versionUtil.colorizeDiff('1.0.10', '1.0.11').should.equal(`1.0.${chalk.green('10')}`);
        });
        it('should accept an optional color option', () => {
            versionUtil.colorizeDiff('1.0.0', '1.0.1', {color: 'blue'}).should.equal(`1.0.${chalk.blue('0')}`);
        });
        it('should not include the leading ^ or ~ if the same', () => {
            versionUtil.colorizeDiff('^1.0.0', '^2.0.0').should.equal(`^${chalk.green('1.0.0')}`);
            versionUtil.colorizeDiff('~1.0.0', '~2.0.0').should.equal(`~${chalk.green('1.0.0')}`);
        });
    });

    describe('findGreatestByLevel', () => {

        it('should find the greatest version within the given semantic versioning level', () => {
            const versions = ['0.1.0', '1.0.0', '1.0.1', '1.1.0', '2.0.1'];
            versionUtil.findGreatestByLevel(versions, '1.0.0', 'major').should.equal('1.1.0');
            versionUtil.findGreatestByLevel(versions, '1.1.0', 'major').should.equal('1.1.0');
            versionUtil.findGreatestByLevel(versions, '1.0.0', 'minor').should.equal('1.0.1');
            versionUtil.findGreatestByLevel(versions, '1.0.1', 'minor').should.equal('1.0.1');

            should.equal(versionUtil.findGreatestByLevel(['1.0.1', '1.0.2'], '^1.0.1', 'major'), null);
            should.equal(versionUtil.findGreatestByLevel(['1.0.1', '1.0.2'], '1.*', 'major'), null);
            should.equal(versionUtil.findGreatestByLevel(['1.0.1', '1.0.2'], '1.1', 'major'), null);
            should.equal(versionUtil.findGreatestByLevel(['1.0.1', '1.0.2'], '1.x', 'major'), null);
            should.equal(versionUtil.findGreatestByLevel(['1.0.1', '1.0.2'], '>1.1', 'major'), null);
        });
    });

});
