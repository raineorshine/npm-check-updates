'use strict';
const packageManagers = require('../../lib/package-managers');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const path = require('path');

chai.should();
chai.use(chaiAsPromised);

// the directory with the test bower.json/package.json
const testDir = path.resolve(path.join(__dirname, '/../ncu'));

describe('package-managers', function () {
    this.timeout(30000);

    describe('npm', () => {
        it('list', () =>
            packageManagers.npm.list({prefix: testDir}).should.eventually.have.property('express')
        );

        it('latest', () =>
            packageManagers.npm.latest('express', null, {prefix: testDir}).then(parseInt).should.eventually.be.above(1)
        );

        it('greatest', () =>
            packageManagers.npm.greatest('ncu-test-greatest-not-newest', null, {prefix: testDir}).should.eventually.equal('2.0.0-beta')
        );

    });

    // skip by default in case developer does not have bower installed
    describe.skip('bower', () => {
        it('list', () =>
            packageManagers.bower.list({prefix: testDir}).should.eventually.have.property('lodash')
        );

        it('latest', () =>
            packageManagers.bower.latest('lodash', null, {prefix: testDir}).then(parseInt).should.eventually.be.above(3)
        );

        it('greatest', () =>
            packageManagers.bower.greatest('lodash', null, {prefix: testDir}).then(parseInt).should.eventually.be.above(3)
        );
    });
});
