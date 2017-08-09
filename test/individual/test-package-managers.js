var requireDir = require('require-dir');
var packageManagers = requireDir('../../lib/package-managers');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

chai.should();
chai.use(chaiAsPromised);

// the directory with the test bower.json/package.json
var testDir = __dirname + '/../ncu';

describe('package-managers', function () {

    // for(var name in packageManagers) {
    //     describe(name, function () {

    describe('npm', function () {
        this.timeout(30000);

        var pkgManager = packageManagers.npm;

        before(function () {
            return pkgManager.init({prefix: testDir});
        });

        it('list', function () {
            // eventual deep properties broken in chai-as-promised 7.0.0
            return pkgManager.list().should.eventually.have.deep.property('dependencies.express');
        });

        it('latest', function () {
            return pkgManager.latest('express').then(parseInt).should.eventually.be.above(1);
        });

        it('greatest', function () {
            return pkgManager.greatest('express').then(parseInt).should.eventually.be.above(1);
        });

    });

    describe('bower', function () {
        this.timeout(30000);

        var pkgManager = packageManagers.bower;

        before(function () {
            return pkgManager.init({prefix: testDir});
        });

        it('list', function () {
            return pkgManager.list().should.eventually.have.deep.property('dependencies.lodash');
        });

        it('latest', function () {
            return pkgManager.latest('lodash').then(parseInt).should.eventually.be.above(3);
        });

        it('greatest', function () {
            return pkgManager.greatest('lodash').then(parseInt).should.eventually.be.above(3);
        });
    });
});
