var vm = require("../lib/versionmanager");
var chai = require("chai");
var should = chai.should();
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Version manager', function () {

    before(function() {
        return vm.initialize(false);
    });

    describe('upgradeDependencyDeclaration', function () {
        it('numeric upgrades', function () {
            vm.upgradeDependencyDeclaration("0", "1.0.0").should.equal("1");
            vm.upgradeDependencyDeclaration("1", "10.0.0").should.equal("10");

            vm.upgradeDependencyDeclaration("0.1", "1.0.0").should.equal("1.0");
            vm.upgradeDependencyDeclaration("1.0", "1.1.0").should.equal("1.1");

            vm.upgradeDependencyDeclaration("1.0.0", "1.0.1").should.equal("1.0.1");
            vm.upgradeDependencyDeclaration("1.0.1", "1.1.0").should.equal("1.1.0");
            vm.upgradeDependencyDeclaration("2.0.1", "2.0.11").should.equal("2.0.11");
        });

        it('wildcard upgrades', function () {
            vm.upgradeDependencyDeclaration("1.x", "1.1.0").should.equal("1.x");
            vm.upgradeDependencyDeclaration("1.x.1", "1.1.2").should.equal("1.x.2");
            vm.upgradeDependencyDeclaration("1.0.x", "1.1.1").should.equal("1.1.x");
            vm.upgradeDependencyDeclaration("1.0.x", "1.1.0").should.equal("1.1.x");
            vm.upgradeDependencyDeclaration("1.0.x", "2.0.0").should.equal("2.0.x");

            vm.upgradeDependencyDeclaration("*", "1.0.0").should.equal("*");
            vm.upgradeDependencyDeclaration("1.*", "2.0.1").should.equal("2.*");
        });

        it('should convert < to ^', function () {
            vm.upgradeDependencyDeclaration("<1.0", "1.1.0").should.equal("^1.1");
        })

        it('should preserve > and >=', function () {
            vm.upgradeDependencyDeclaration(">1.0", "2.0.0").should.equal(">2.0");
            vm.upgradeDependencyDeclaration(">=1.0", "2.0.0").should.equal(">=2.0");
        })

        it('should preserve ^ and ~', function () {
            vm.upgradeDependencyDeclaration("^1.2.3", "1.2.4").should.equal("^1.2.4");
            vm.upgradeDependencyDeclaration("~1.2.3", "1.2.4").should.equal("~1.2.4");
        });

        it('should replace closed ranges with ^', function () {
            vm.upgradeDependencyDeclaration("1.0.0 < 1.2.0", "3.1.0").should.equal("^3.1.0");
        });
        
        it('should replace multiple ranges with ^', function () {
            vm.upgradeDependencyDeclaration(">1.0 >2.0 < 3.0", "3.1.0").should.equal("^3.1");
        });

        it('should handle ||', function () {
            vm.upgradeDependencyDeclaration("~1.0 || ~1.2", "3.1.0").should.equal("~3.1");
        });
        
        it('should use the range with the fewest parts if there are multiple ranges', function () {
            vm.upgradeDependencyDeclaration("1.1 || 1.2.0", "3.1.0").should.equal("3.1");
            vm.upgradeDependencyDeclaration("1.2.0 || 1.1", "3.1.0").should.equal("3.1");
        });
        
        it('should preserve wildcards in comparisons', function () {
            vm.upgradeDependencyDeclaration("1.x < 1.2.0", "3.1.0").should.equal("3.x");
        });
        
        it('should use the first operator if a comparison has mixed operators', function () {
            vm.upgradeDependencyDeclaration("1.x < 1.*", "3.1.0").should.equal("3.x");
        });

        it('maintain "unclean" semantic versions', function () {
            vm.upgradeDependencyDeclaration("v1.0", "1.1").should.equal("v1.1");
            vm.upgradeDependencyDeclaration("=v1.0", "1.1").should.equal("=v1.1");
            vm.upgradeDependencyDeclaration(" =v1.0", "1.1").should.equal("=v1.1");
        });

        it('maintain "unclean" semantic versions', function () {
            vm.upgradeDependencyDeclaration("v1.0", "1.1").should.equal("v1.1");
            vm.upgradeDependencyDeclaration("=v1.0", "1.1").should.equal("=v1.1");
            vm.upgradeDependencyDeclaration(" =v1.0", "1.1").should.equal("=v1.1");
        });

        it('maintain existing version if new version is unknown', function () {
            vm.upgradeDependencyDeclaration("1.0", "").should.equal("1.0");
            vm.upgradeDependencyDeclaration("1.0", null).should.equal("1.0");
        });
    });

    describe('upgradeDependencies', function() {
        it('should return upgraded dependencies object', function() {
            vm.upgradeDependencies({ mongodb: '^1.4.29' }, { mongodb: '1.4.30' }).should.eql({ mongodb: '^1.4.30' });
        })
        it('should not downgrade', function() {
            vm.upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' }).should.eql({ });
        })
        it('should use the preferred wildcard when converting <, closed, or mixed ranges', function() {
            vm.upgradeDependencies({ a: '1.*', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' });
            vm.upgradeDependencies({ a: '1.x', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.x' });
            vm.upgradeDependencies({ a: '~1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '~3.0' });
            vm.upgradeDependencies({ a: '^1', mongodb: '<1.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' });

            vm.upgradeDependencies({ a: '1.*', mongodb: '>1.0 <2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' });
            vm.upgradeDependencies({ mongodb: '>1.0 <2.*' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '3.*' });
        })
        it('should convert closed ranges to caret (^) when preferred wildcard is unknown', function() {
            vm.upgradeDependencies({ mongodb: '>1.0 <2.0' }, { mongodb: '3.0.0' }).should.eql({ mongodb: '^3.0' });
        })
    });

    describe('getInstalledPackages', function () {
        it('should execute npm ls', function () {
            return vm.getInstalledPackages()
                .should.be.resolved;
        });
    });

    describe('getLatestPackageVersion', function () {
        return it('valid package info', function () {
            return vm.getLatestPackageVersion("async")
                .should.eventually.be.a('string');
        });
    });

    describe('getGreatestPackageVersion', function () {
        it('valid package info', function () {
            return vm.getGreatestPackageVersion("async")
                .should.eventually.be.a('string');
        });
    });

    describe('getLatestVersions', function () {
        it('valid single package', function () {
            var latestVersions = vm.getLatestVersions(["async"]);
            return latestVersions.should.eventually.have.property('async');
        });

        it('valid packages', function () {
            var latestVersions = vm.getLatestVersions(["async", "npm"])
            latestVersions.should.eventually.have.property('async')
            latestVersions.should.eventually.have.property('npm');
            return latestVersions;
        });

        it('unavailable packages should be ignored', function () {
            return vm.getLatestVersions(["sudoMakeMeASandwitch"])
                .should.eventually.deep.equal({})
        });

        it('set the versionTarget explicitly to latest', function () {
            return vm.getLatestVersions(["async"], { versionTarget: 'latest' })
                .should.eventually.have.property('async');
        });

        it('set the versionTarget to greatest', function () {
            return vm.getLatestVersions(["async"], { versionTarget: 'greatest' })
                .should.eventually.have.property('async');
        });

        it('should return an error for an unsupported versionTarget', function () {
            var a = vm.getLatestVersions(["async"], { versionTarget: 'foo' })
            return a.should.be.rejected;
        });

    });

    describe("isUpgradeable", function() {

        it("should upgrade versions that do not satisfy latest versions", function() {
            vm.isUpgradeable("0.1.x", "0.5.1").should.equal(true);
        });

        it("should not upgrade invalid versions", function() {
            vm.isUpgradeable("https://github.com/strongloop/express", "4.11.2").should.equal(false);
        });

        it("should not upgrade versions beyond the latest", function() {
            vm.isUpgradeable("5.0.0", "4.11.2").should.equal(false);
        });

    });

    describe('getPreferredWildcard', function() {

        it('should identify ^ when it is preferred', function() {
            var deps = {
                async: '^0.9.0',
                bluebird: '^2.9.27',
                cint: '^8.2.1',
                commander: '~2.8.1',
                lodash: '^3.2.0',
            };
            vm.getPreferredWildcard(deps).should.equal('^');
        });

        it('should identify ~ when it is preferred', function() {
            var deps = {
                async: '~0.9.0',
                bluebird: '~2.9.27',
                cint: '^8.2.1',
                commander: '~2.8.1',
                lodash: '^3.2.0',
            };
            vm.getPreferredWildcard(deps).should.equal('~');
        });

        it('should identify .x when it is preferred', function() {
            var deps = {
                async: '0.9.x',
                bluebird: '2.9.x',
                cint: '^8.2.1',
                commander: '~2.8.1',
                lodash: '3.x',
            };
            vm.getPreferredWildcard(deps).should.equal('.x');
        });

        it('should identify .* when it is preferred', function() {
            var deps = {
                async: '0.9.*',
                bluebird: '2.9.*',
                cint: '^8.2.1',
                commander: '~2.8.1',
                lodash: '3.*',
            };
            vm.getPreferredWildcard(deps).should.equal('.*');
        });

        it('should use the first wildcard if there is a tie', function() {
            var deps = {
                async: '0.9.x',
                commander: '2.8.*'
            };
            vm.getPreferredWildcard(deps).should.equal('.x');
        });

        it('should default to caret (^) when cannot be determined from other dependencies', function() {
            var deps = {
                async: '0.9.0',
                commander: '2.8.1',
                lodash: '3.2.0',
            };
            vm.getPreferredWildcard(deps).should.equal('^');
        });
    });

    describe('versionNumParts', function() {
        it('should count the number of parts in a version', function() {
            vm.versionNumParts('1').should.equal(1);
            vm.versionNumParts('1.2').should.equal(2);
            vm.versionNumParts('1.2.3').should.equal(3);
            vm.versionNumParts('1.2.3-alpha.1').should.equal(4);
            vm.versionNumParts('1.2.3+build12345').should.equal(4);
        });
    });

    describe('getVersionPrecision', function() {

        it('should detect versions as precise as "major"', function() {
            vm.getVersionPrecision('1').should.equal('major');
        });

        it('should detect versions as precise as "minor"', function() {
            vm.getVersionPrecision('1.2').should.equal('minor');
        });

        it('should detect versions as precise as "patch"', function() {
            vm.getVersionPrecision('1.2.3').should.equal('patch');
        });

        it('should detect versions as precise as "release"', function() {
            vm.getVersionPrecision('1.2.3-alpha.1').should.equal('release');
        });

        it('should detect versions as precise as "build"', function() {
            vm.getVersionPrecision('1.2.3+build12345').should.equal('build');
        });

    });

    describe('semverBuildVersionString', function() {

        it('should build a version string of the given parts', function() {

            vm.semverBuildVersionString({major: '1'}).should.equal('1');

            vm.semverBuildVersionString({
                major: '1',
                minor: '2'
            }).should.equal('1.2');

            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3'
            }).should.equal('1.2.3');

            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3',
                release: 'alpha.1'
            }).should.equal('1.2.3-alpha.1');

            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }).should.equal('1.2.3+build12345');

        });

        it('should pad the version with an optional precison argument', function() {
            
            vm.semverBuildVersionString({major: '1'}, 'minor').should.equal('1.0');
            vm.semverBuildVersionString({major: '1'}, 'patch').should.equal('1.0.0');
        });

        it('should truncate the version when a precision is provided', function() {
            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'patch').should.equal('1.2.3');
            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'minor').should.equal('1.2');
            vm.semverBuildVersionString({
                major: '1',
                minor: '2',
                patch: '3',
                build: 'build12345'
            }, 'major').should.equal('1');
        });

    });

    describe('setVersionPrecision', function() {

        it('should set the precision of a version at "major"', function() {
            vm.setVersionPrecision('1.2.3-alpha.1', 'major').should.equal('1');
        });

        it('should set the precision of a version at "minor"', function() {
            vm.setVersionPrecision('1.2.3-alpha.1', 'minor').should.equal('1.2');
        });

        it('should add 0 to minor if needed', function() {
            vm.setVersionPrecision('1', 'minor').should.equal('1.0');
        });

        it('should set the precision of a version at "patch"', function() {
            vm.setVersionPrecision('1.2.3-alpha.1', 'patch').should.equal('1.2.3');
        });

        it('should add 0 to patch if needed', function() {
            vm.setVersionPrecision('1', 'patch').should.equal('1.0.0');
        });

        it('should set the precision of a version at "release"', function() {
            vm.setVersionPrecision('1.2.3-alpha.1', 'release').should.equal('1.2.3-alpha.1');
        });

        it('should set the precision of a version at "build"', function() {
            vm.setVersionPrecision('1.2.3+build12345', 'build').should.equal('1.2.3+build12345');
        });

    });

    describe('precisionAdd', function() {
        it('should handle precision increase/decrease of base precisions', function() {
            vm.precisionAdd('major', 0).should.equal('major');
            vm.precisionAdd('major', 1).should.equal('minor');
            vm.precisionAdd('major', 2).should.equal('patch');
            vm.precisionAdd('minor', -1).should.equal('major');
            vm.precisionAdd('minor', 0).should.equal('minor');
            vm.precisionAdd('minor', 1).should.equal('patch');
            vm.precisionAdd('patch', -2).should.equal('major');
            vm.precisionAdd('patch', -1).should.equal('minor');
            vm.precisionAdd('patch', 0).should.equal('patch');
        });

        it('should handle precision decrease of added precisions (release, build)', function() {
            vm.precisionAdd('build', -1).should.equal('patch');
            vm.precisionAdd('build', -2).should.equal('minor');
            vm.precisionAdd('build', -3).should.equal('major');
            vm.precisionAdd('release', -1).should.equal('patch');
            vm.precisionAdd('release', -2).should.equal('minor');
            vm.precisionAdd('release', -3).should.equal('major');
        });
    });

    describe('changePrecision', function() {
        it('should handle precision increase/decrease of base precisions', function() {
            vm.changePrecision('1.2.3-alpha.1', 0).should.equal('1.2.3-alpha.1');
            vm.changePrecision('1.2.3-alpha.1', -1).should.equal('1.2.3');
            vm.changePrecision('1.2.3-alpha.1', -2).should.equal('1.2');
            vm.changePrecision('1.2.3-alpha.1', -3).should.equal('1');
            vm.changePrecision('1.2.3', -0).should.equal('1.2.3');
            vm.changePrecision('1.2.3', -1).should.equal('1.2');
            vm.changePrecision('1.2.3', -2).should.equal('1');
            vm.changePrecision('1.2', -0).should.equal('1.2');
            vm.changePrecision('1.2', -1).should.equal('1');
        });

        it('should pad increases in precision', function() {
            vm.changePrecision('1', 1).should.equal('1.0');
            vm.changePrecision('1', 2).should.equal('1.0.0');
            vm.changePrecision('1.2', 1).should.equal('1.2.0');
        })
    });

    describe('addWildCard', function() {
        it('should add ~', function() {
            vm.addWildCard('1', '~').should.equal('~1');
            vm.addWildCard('1.2', '~').should.equal('~1.2');
            vm.addWildCard('1.2.3', '~').should.equal('~1.2.3');
            vm.addWildCard('1.2.3-alpha.1', '~').should.equal('~1.2.3-alpha.1');
            vm.addWildCard('1.2.3+build12345', '~').should.equal('~1.2.3+build12345');
        });
        it('should add ^', function() {
            vm.addWildCard('1', '^').should.equal('^1');
            vm.addWildCard('1.2', '^').should.equal('^1.2');
            vm.addWildCard('1.2.3', '^').should.equal('^1.2.3');
            vm.addWildCard('1.2.3-alpha.1', '^').should.equal('^1.2.3-alpha.1');
            vm.addWildCard('1.2.3+build12345', '^').should.equal('^1.2.3+build12345');
        });
        it('should add .*', function() {
            vm.addWildCard('1', '.*').should.equal('1.*');
            vm.addWildCard('1.2', '.*').should.equal('1.*');
            vm.addWildCard('1.2.3', '.*').should.equal('1.*');
            vm.addWildCard('1.2.3-alpha.1', '.*').should.equal('1.*');
            vm.addWildCard('1.2.3+build12345', '.*').should.equal('1.*');
        });
        it('should add .x', function() {
            vm.addWildCard('1', '.x').should.equal('1.x');
            vm.addWildCard('1.2', '.x').should.equal('1.x');
            vm.addWildCard('1.2.3', '.x').should.equal('1.x');
            vm.addWildCard('1.2.3-alpha.1', '.x').should.equal('1.x');
            vm.addWildCard('1.2.3+build12345', '.x').should.equal('1.x');
        });
    })

});
