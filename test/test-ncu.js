var ncu             = require('../lib/npm-check-updates.js');
var chai            = require('chai');
var fs              = require('fs');
var spawn           = require('spawn-please');
var BluebirdPromise = require('bluebird');
var tmp             = require('tmp');

chai.use(require('chai-as-promised'));
chai.use(require('chai-string'));

spawn.Promise = BluebirdPromise;

describe('npm-check-updates', function () {

    this.timeout(30000);

    describe('run', function () {
        it('should return promised jsonUpgraded', function () {
            return ncu.run({
                packageData: fs.readFileSync(__dirname + '/ncu/package.json', 'utf-8')
            }).should.eventually.have.property('express');
        });

        it('should filter by package name with one arg', function () {
            var upgraded = ncu.run({
                packageData: fs.readFileSync(__dirname + '/ncu/package2.json', 'utf-8'),
                args: ['lodash.map']
            });
            return BluebirdPromise.all([
                upgraded.should.eventually.have.property('lodash.map'),
                upgraded.should.eventually.not.have.property('lodash.filter')
            ]);
        });

        it('should filter by package name with multiple args', function () {
            var upgraded = ncu.run({
                packageData: fs.readFileSync(__dirname + '/ncu/package2.json', 'utf-8'),
                args: ['lodash.map', 'lodash.filter']
            });
            return BluebirdPromise.all([
                upgraded.should.eventually.have.property('lodash.map'),
                upgraded.should.eventually.have.property('lodash.filter')
            ]);
        });

        it('should suggest upgrades to versions within the specified version range if jsonUpraded is true and upgradeAll is not given (backwards compatible behavior until next version)', function () {
            var upgraded = ncu.run({
                // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
                packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
                jsonUpgraded: true
            });

            return BluebirdPromise.all([
                upgraded.should.eventually.have.property('juggernaut'),
                upgraded.then(function (data) {
                    return data.should.eql({juggernaut: '^2.1.1'});
                })
            ]);
        });

        it('should not suggest upgrades to versions within the specified version range if jsonUpraded is true and upgradeAll is explicitly set to false', function () {
            var upgraded = ncu.run({
                // juggernaut has been deprecated at v2.1.1 so it is unlikely to invalidate this test
                packageData: '{ "dependencies": { "juggernaut": "^2.1.0" } }',
                jsonUpgraded: true,
                upgradeAll: false
            });

            return upgraded.should.eventually.not.have.property('juggernaut');
        });

        it('should ignore newer packages that satisfy the declared version range if they are installed in node_modules', function () {

            var upgraded = ncu.run({
                // { "dependencies": { "escape-string-regexp": "^1.0.4" } }
                // latest is 1.0.5
                packageFile: 'test/test-modules/package.json',
                packageFileDir: true, // appears to be redundant with upgradeAll in this test case, but it's already built so I give up :(. Too much effort to satisfy an edge case (#201).
                jsonUpgraded: true,
                upgradeAll: false
            });

            return upgraded.should.eventually.not.have.property('escape-string-regexp');
        });

        it('should throw an exception instead of printing to the console when timeout is exceeded', function () {

            return ncu.run({
                packageFile: 'package.json',
                timeout: 1
            }).then(function () {
                throw new Error('False positive');
            }).catch(function (e) {
                return e.message.should.contain('Exceeded global timeout of 1ms');
            });
        });
    });

    describe('cli', function () {

        it('should accept stdin', function () {
            return spawn('node', ['bin/ncu'], '{ "dependencies": { "express": "1" } }')
                .then(function (output) {
                    output.trim().should.startWith('express');
                });
        });

        it('should fall back to package.json search when receiving empty content on stdin', function () {
            return spawn('node', ['bin/ncu']).then(function (stdout) {
                stdout.toString().trim().should.match(/^Using .+package.json/);
            });
        });

        it('should handle no package.json to analyze when receiving empty content on stdin', function () {
            // run from tmp dir to avoid ncu analyzing the project's package.json
            return spawn('node', [process.cwd() + '/bin/ncu'], {cwd: tmp.dirSync().name})
                .catch(function (stderr) {
                    stderr.toString().should.contain('No package.json');
                });
        });

        it('should output json with --jsonAll', function () {
            return spawn('node', ['bin/ncu', '--jsonAll'], '{ "dependencies": { "express": "1" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('dependencies');
                    pkgData.dependencies.should.have.property('express');
                });
        });

        it('should output only upgraded with --jsonUpgraded', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded'], '{ "dependencies": { "express": "1" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                });
        });

        it('should read --packageFile', function () {
            var tempFile = 'test/temp_package.json';
            fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8');
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '--packageFile', tempFile])
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                })
                .finally(function () {
                    fs.unlinkSync(tempFile);
                });
        });

        it('should write to --packageFile', function () {
            var tempFile = 'test/temp_package.json';
            fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8');
            return spawn('node', ['bin/npm-check-updates', '-u', '--packageFile', tempFile])
                .then(function () {
                    var upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
                    upgradedPkg.should.have.property('dependencies');
                    upgradedPkg.dependencies.should.have.property('express');
                    upgradedPkg.dependencies.express.should.not.equal('1');
                })
                .finally(function () {
                    fs.unlinkSync(tempFile);
                });
        });

        it('should not write to --packageFile if error-level=2 and upgrades', function () {
            var tempFile = 'test/temp_package.json';
            fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8');
            return spawn('node', ['bin/npm-check-updates', '-u', '--error-level', '2', '--packageFile', tempFile])
                .catch(function () {
                    var upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
                    upgradedPkg.should.have.property('dependencies');
                    upgradedPkg.dependencies.should.have.property('express');
                    upgradedPkg.dependencies.express.should.equal('1');
                })
                .finally(function () {
                    fs.unlinkSync(tempFile);
                });
        });

        it('should ignore stdin if --packageFile is specified', function () {
            var tempFile = 'test/temp_package.json';
            fs.writeFileSync(tempFile, '{ "dependencies": { "express": "1" } }', 'utf-8');
            return spawn('node', ['bin/npm-check-updates', '-u', '--packageFile', tempFile], '{ "dependencies": {}}')
                .then(function () {
                    var upgradedPkg = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
                    upgradedPkg.should.have.property('dependencies');
                    upgradedPkg.dependencies.should.have.property('express');
                    upgradedPkg.dependencies.express.should.not.equal('1');
                })
                .finally(function () {
                    fs.unlinkSync(tempFile);
                });
        });

        it('should filter by package name with --filter', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '--filter', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should filter by package name with -f', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '-f', 'express'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should reject by package name with --reject', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '--reject', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should reject by package name with -x', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '-x', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should update only packages which have new minor/patch versions', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '--semverLevel', 'major'], '{ "dependencies": { "express": "2.4.1", "chalk": "^0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.express.should.equal('2.5.11');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should update only packages which have new patch versions', function () {
            return spawn('node', ['bin/ncu', '--jsonUpgraded', '--semverLevel', 'minor'], '{ "dependencies": { "express": "2.4.1", "chalk": "^0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.express.should.equal('2.4.7');
                    pkgData.should.not.have.property('chalk');
                });
        });

        it('should suppress stdout when --silent is provided', function () {
            return spawn('node', ['bin/ncu', '--silent'], '{ "dependencies": { "express": "1" } }')
                .then(function (output) {
                    output.trim().should.equal('');
                });
        });

        it('should read --configFilePath', function () {
            var tempFilePath = './test/';
            var tempFileName = '.ncurc.json';
            fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8');
            return spawn('node', ['bin/ncu', '--configFilePath', tempFilePath], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                })
                .finally(function () {
                    fs.unlinkSync(tempFilePath + tempFileName);
                });
        });

        it('should read --configFileName', function () {
            var tempFilePath = './test/';
            var tempFileName = '.rctemp.json';
            fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8');
            return spawn('node', ['bin/ncu', '--configFilePath', tempFilePath, '--configFileName', tempFileName], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('express');
                    pkgData.should.not.have.property('chalk');
                })
                .finally(function () {
                    fs.unlinkSync(tempFilePath + tempFileName);
                });
        });

        it('should override config with arguments', function () {
            var tempFilePath = './test/';
            var tempFileName = '.ncurc.json';
            fs.writeFileSync(tempFilePath + tempFileName, '{"jsonUpgraded": true, "filter": "express"}', 'utf-8');
            return spawn('node', ['bin/ncu', '--configFilePath', tempFilePath, '--filter', 'chalk'], '{ "dependencies": { "express": "1", "chalk": "0.1.0" } }')
                .then(JSON.parse)
                .then(function (pkgData) {
                    pkgData.should.have.property('chalk');
                    pkgData.should.not.have.property('express');
                })
                .finally(function () {
                    fs.unlinkSync(tempFilePath + tempFileName);
                });
        });

        describe('with timeout option', function () {

            it('should exit with error when timeout exceeded', function (done) {
                spawn('node', ['bin/ncu', '--timeout', '1'], '{ "dependencies": { "express": "1" } }')
                    .then(function () {
                        done(new Error('should not resolve'));
                    }).catch(function (stderr) {
                        stderr.should.contain('Exceeded global timeout of 1ms');
                        done();
                    });
            });

            it('completes successfully with timeout', function () {
                return spawn('node', ['bin/ncu', '--timeout', '100000'], '{ "dependencies": { "express": "1" } }');
            });
        });
    });

});
