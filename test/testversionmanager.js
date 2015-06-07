var should = require("should");
var vm = require("../lib/versionmanager");

describe('Version manager', function () {
    before(function(done){
        vm.initialize(false, done);
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

    describe('getLatestPackageVersion', function () {
        it('valid package info', function (done) {
            vm.getLatestPackageVersion("async", function (error, version) {
                should.exist(version);
                version.should.be.type('string');
                done();
            });
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

    describe('getLatestVersions', function () {
        it('valid single package', function (done) {
            vm.getLatestVersions(["async"], function (error, latestVersions) {
                should.exist(latestVersions.async);
                done();
            });
        });

        it('valid packages', function (done) {
            vm.getLatestVersions(["async", "npm"], function (error, latestVersions) {
                should.exist(latestVersions.async);
                should.exist(latestVersions["npm"]);
                done();
            });
        });

        it('unavailable packages should not blow up', function (done) {
            vm.getLatestVersions(["sudoMakeMeASandwitch"], function (error, latestVersions) {
                done();
            });
        });

        it('optional options object', function (done) {
            vm.getLatestVersions(["async"], {}, function (error, latestVersions) {
                should.exist(latestVersions.async);
                done();
            });
        });

        it('set the versionTarget explicitly to latest', function (done) {
            vm.getLatestVersions(["async"], { versionTarget: 'latest' }, function (error, latestVersions) {
                should.exist(latestVersions.async);
                done();
            });
        });

        it('set the versionTarget to greatest', function (done) {
            vm.getLatestVersions(["async"], { versionTarget: 'greatest' }, function (error, latestVersions) {
                should.exist(latestVersions.async);
                done();
            });
        });

        it('should return an error for an unsupported versionTarget', function (done) {
            vm.getLatestVersions(["async"], { versionTarget: 'foo' }, function (error, latestVersions) {
                should.exist(error);
                error.should.match(/unsupported/i);
                done();
            });
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
