var should = require("should");
var vm = require("../lib/versionmanager");

describe('Version manager', function () {
    before(function(done){
        vm.initialize(false, done);
    });

    describe('upgradeDependencyDeclaration', function () {
        it('numeric upgrades', function () {
            vm.upgradeDependencyDeclaration("0", "1").should.equal("1");
            vm.upgradeDependencyDeclaration("1", "10").should.equal("10");
            vm.upgradeDependencyDeclaration("10", "1").should.equal("1"); // Downgrade

            vm.upgradeDependencyDeclaration("0.1", "1.0").should.equal("1.0");
            vm.upgradeDependencyDeclaration("1.0", "1.1").should.equal("1.1");
            vm.upgradeDependencyDeclaration("2.0", "1.1").should.equal("1.1"); // Downgrade

            vm.upgradeDependencyDeclaration("1.0.0", "1.0.1").should.equal("1.0.1");
            vm.upgradeDependencyDeclaration("1.0.1", "1.1.0").should.equal("1.1.0");
            vm.upgradeDependencyDeclaration("2.0.1", "2.0.11").should.equal("2.0.11");
            vm.upgradeDependencyDeclaration("2.0.0", "1.0.0").should.equal("1.0.0"); // Downgrade

            vm.upgradeDependencyDeclaration("1.0.0", "1.1").should.equal("1.1");
            vm.upgradeDependencyDeclaration("1.0.0", "2").should.equal("2");
            vm.upgradeDependencyDeclaration("22.0.1", "22").should.equal("22"); // Downgrade
        });

        it('wildcard upgrades', function () {
            vm.upgradeDependencyDeclaration("1.x", "1.1").should.equal("1.x");
            vm.upgradeDependencyDeclaration("1.x.1", "1.1.2").should.equal("1.x.2");
            vm.upgradeDependencyDeclaration("1.0.x", "1.1.1").should.equal("1.1.x");
            vm.upgradeDependencyDeclaration("1.0.x", "1.1").should.equal("1.1");
            vm.upgradeDependencyDeclaration("1.0.x", "2").should.equal("2");
            vm.upgradeDependencyDeclaration("2.0.x", "1.0.0").should.equal("1.0.x"); // Downgrade

            vm.upgradeDependencyDeclaration("*", "1").should.equal("*");
            vm.upgradeDependencyDeclaration("*", "1.1").should.equal("*");
            vm.upgradeDependencyDeclaration("*.1", "2.0.1").should.equal("*.0");
        });

        it('constrained numeric upgrades', function () {
            vm.upgradeDependencyDeclaration("<1.0", "1.1").should.equal("<1.1");
            vm.upgradeDependencyDeclaration("<1.0", "1.1.1").should.equal("<1.1");
            vm.upgradeDependencyDeclaration(">=1.0", "2.0").should.equal(">=2.0");
            vm.upgradeDependencyDeclaration(">= 1.0", "2.0").should.equal(">= 2.0");
            vm.upgradeDependencyDeclaration("^1.2.3", "1.2.4").should.equal("^1.2.4");
        });

        it('combined constraints and ranges', function () {
            vm.upgradeDependencyDeclaration("^1.0.0 < 1.2.0", "3.1.0").should.equal("^3.1.0");
            vm.upgradeDependencyDeclaration("~1.0 < 1.2.0", "3.1.0").should.equal("~3.0");
            vm.upgradeDependencyDeclaration("1.x < 1.2.0", "3.1.0").should.equal("3.x");
            vm.upgradeDependencyDeclaration("1.2.0 < 1.x", "3.1.0").should.equal("3.x");
        });

        it('maintain "unclean" semantic versions', function () {
            vm.upgradeDependencyDeclaration("v1.0", "1.1").should.equal("v1.1");
            vm.upgradeDependencyDeclaration("=v1.0", "1.1").should.equal("=v1.1");
            vm.upgradeDependencyDeclaration(" =v1.0", "1.1").should.equal(" =v1.1");
        });

        it('maintain "unclean" semantic versions', function () {
            vm.upgradeDependencyDeclaration("v1.0", "1.1").should.equal("v1.1");
            vm.upgradeDependencyDeclaration("=v1.0", "1.1").should.equal("=v1.1");
            vm.upgradeDependencyDeclaration(" =v1.0", "1.1").should.equal(" =v1.1");
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
