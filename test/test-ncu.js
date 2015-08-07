var ncu             = require("../lib/npm-check-updates.js");
var chai            = require("chai");
var fs              = require('fs');
var spawn           = require('spawn-please')
var BluebirdPromise = require('bluebird')

chai.use(require("chai-as-promised"));
chai.use(require('chai-string'))

spawn.Promise = BluebirdPromise;

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

    describe('cli', function() {

        it('should accept stdin', function() {
            return spawn('ncu', [], '{ "dependencies": { "express": "1" } }')
                .then(function (output) {
                    output.trim().should.startWith('express')
                });
        });

        it('should output json with --jsonAll', function() {
            return spawn('ncu', ['--jsonAll'], '{ "dependencies": { "express": "1" } }')
                .then(function (output) {
                  var pkgData = JSON.parse(output);
                  pkgData.should.have.property('dependencies');
                  pkgData.dependencies.should.have.property('express');
                });
        });

        it('should output only upgraded with --jsonUpgraded', function() {
            return spawn('ncu', ['--jsonUpgraded'], '{ "dependencies": { "express": "1" } }')
                .then(function (output) {
                  var pkgData = JSON.parse(output);
                  pkgData.should.have.property('express');
                });
        });
    });

});
