var ncu            = require("../lib/npm-check-updates.js");
var chai           = require("chai");
var chaiAsPromised = require("chai-as-promised");
var fs             = require('fs');

chai.use(chaiAsPromised);

describe('npm-check-updates', function () {

    this.timeout(30000);

    describe('run', function () {
        it('should return promised jsonUpgraded', function () {
            return ncu.run({
                    packageData: fs.readFileSync(__dirname + '/ncu/package.json', 'utf-8')
                })
                .should.eventually.have.property('express');
        });
    });

});
