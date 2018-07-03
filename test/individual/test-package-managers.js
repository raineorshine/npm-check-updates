var packageManagers = require('../../lib/package-managers');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var path = require('path');

chai.should();
chai.use(chaiAsPromised);

// the directory with the test package.json
var testDir = path.resolve(__dirname, '../ncu');

describe('package-managers', function () {

    describe('npm', function () {
        this.timeout(30000);

        it('list', function () {
            return packageManagers.npm.list({ prefix: testDir }).should.eventually.have.property('express');
        });

        it('latest', function () {
            return packageManagers.npm.latest('express', null, {prefix: testDir}).then(parseInt).should.eventually.be.above(1);
        });

        it('greatest', function () {
            return packageManagers.npm.greatest('express', null, {prefix: testDir}).then(parseInt).should.eventually.be.above(1);
        });

    });

});
