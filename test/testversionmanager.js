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

        it('constrained numeric upgrades', function () {
            vm.upgradeDependencyDeclaration("<1.0", "1.1.0").should.equal("<1.1");
            vm.upgradeDependencyDeclaration("<1.0", "1.1.1").should.equal("<1.1");
            vm.upgradeDependencyDeclaration(">=1.0", "2.0.0").should.equal(">=2.0");
            vm.upgradeDependencyDeclaration("^1.2.3", "1.2.4").should.equal("^1.2.4");
        });

        it('should replace closed ranges with ^', function () {
            vm.upgradeDependencyDeclaration("1.0.0 < 1.2.0", "3.1.0").should.equal("^3.1.0");
        });
        
        it('should replace multiple ranges with ^ while preserving number of components', function () {
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
        it('return upgraded dependencies object', function() {
            vm.upgradeDependencies({ mongodb: '^1.4.29' }, { mongodb: '1.4.30' }).should.eql({ mongodb: '^1.4.30' });
        })
        it('do not downgrade', function() {
            vm.upgradeDependencies({ mongodb: '^2.0.7' }, { mongodb: '1.4.30' }).should.eql({ });
        })
    });

    // describe.only('getInstalledPackages', function () {
    //     it('should execute npm ls', function () {
    //         var packages = vm.getInstalledPackages();
    //         packages.then(function(results) {
    //             console.log(results);
    //         })
    //         return packages.should.eventually.equal('test');
    //     });
    // });

    describe('getLatestPackageVersion', function () {
        it('valid package info', function (done) {
            version = vm.getLatestPackageVersion("async");
            return version.should.eventually.be.type('string');
        });
    });

    describe('getGreatestPackageVersion', function () {
        it('valid package info', function (done) {
            vm.getGreatestPackageVersion("async", function (error, version) {
                should.exist(version);
                version.should.be.type('string');
                done();
            });
        });
    });

    describe.only('getLatestVersions', function () {
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

        it('unavailable packages should not blow up', function () {
            return vm.getLatestVersions(["sudoMakeMeASandwitch"])
                .should.be.rejected;
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

    })

});
