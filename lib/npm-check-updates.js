var program = require('commander');
var async = require('async');
var cint = require('cint');
var path = require('path');
var vm = require('./versionmanager');
var closestPackage = require('closest-package');
var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var stdin = require('get-stdin-promise');

//
// Helper functions
//

var print = program.silent ? _.noop : console.log;
var readPackageFile = cint.partialAt(fs.readFileAsync, 1, 'utf8');
var writePackageFile = fs.writeFileAsync;

//
// Main functions
//

function upgradePackageDefinitions(currentDependencies) {
    var dependencyList = Object.keys(currentDependencies);
    return vm.getLatestVersions(dependencyList, {
        versionTarget: program.greatest ? 'greatest' : 'latest',
        registry: program.registry ? program.registry : null,
    }).then(function (latestVersions) {
        var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions);
        return [upgradedDependencies, latestVersions];
    });
}

function analyzeGlobalPackages() {
    return vm.getInstalledPackages()
        .then(function (globalPackages) {
            return upgradePackageDefinitions(globalPackages)
                .spread(function (upgraded, latest) {
                    printGlobalUpgrades(globalPackages, upgraded)
                });
        });
}

function analyzeProjectDependencies(pkgData, pkgFile) {
    var pkg = JSON.parse(pkgData);
    var current = vm.getCurrentDependencies(pkg, {
        prod: program.prod,
        dev: program.dev,
        filter: program.args[0]
    });

    return Promise.all([
        current,
        // only search for installed dependencies if a pkgFile is specified
        pkgFile ? vm.getInstalledPackages() : Promise.resolve(null),
        upgradePackageDefinitions(current)
    ])
    .spread(function (current, installed, upgradedAndLatest) {
        return [current, installed, upgradedAndLatest[0], upgradedAndLatest[1]];
    })
    .spread(function (current, installed, upgraded, latest) {

        if(program.json) {
            var newPkgData = vm.updatePackageData(pkgData, current, upgraded);
            print(program.jsonAll ? JSON.parse(newPkgData) :
                program.jsonDeps ? _.pick(JSON.parse(newPkgData), 'dependencies', 'devDependencies') :
                upgraded
            );
        }
        else {
            printLocalUpgrades(current, upgraded, installed, latest);

            if(pkgFile && !_.isEmpty(upgraded)) {
                if (program.upgrade) {
                    var newPkgData = vm.updatePackageData(pkgData, current, upgraded);
                    writePackageFile(pkgFile, newPkgData)
                        .then(function () {
                            print('\n' + pkgFile + " upgraded");
                        });
                } else {
                    print("Run with '-u' to upgrade your package.json");
                }
                if(program.errorLevel >= 2) {
                    throw new Error('Dependencies not up-to-date');
                }
            }
        }
    });
}

function printGlobalUpgrades(current, upgraded) {
    print('');
    if (_.isEmpty(upgraded)) {
        print("All global packages are up to date :)");
    } else {
        for (var dep in upgraded) {
            print('"' + dep + '" can be updated from ' +
                current[dep] + ' to ' + upgraded[dep]);
        }
        if(program.errorLevel >= 2) {
            throw new Error('Dependencies not up-to-date');
        }
    }
    print('');
}

function printLocalUpgrades(current, upgraded, installed, latest) {
    print('');
    var superlative = program.greatest ? "Greatest" : "Latest";
    if (_.isEmpty(upgraded)) {
        print("All dependencies match the " + superlative.toLowerCase() + " package versions :)");
    } else {
        for (var dep in upgraded) {
            var installedMessage = installed ? "Installed: " + (installed[dep] ? installed[dep] : "none") + ", " : '';
            var latestOrGreatestMessage = superlative + ": " + latest[dep];
            var message = '"' + dep + '" can be updated from ' +
                current[dep] + ' to ' + upgraded[dep] + " (" + installedMessage + latestOrGreatestMessage + ")";
            print(message);
        }
    }
    print('');
}

//
// Program
//


function programInit() {

    var execName = path.basename(process.argv[1]);
    if(execName === 'npm-check-updates') {
        print('You can now use "ncu" for less typing!');
    }

    if (program.global && program.upgrade) {
        print("npm-check-updates cannot update global packages.");
        print("Run 'npm install -g [package]' to upgrade a global package.");
        process.exit(1);
    }

    // add shortcut for any keys that start with 'json'
    program.json = _(program)
        .keys()
        .filter(_.partial(_.startsWith, _, 'json', 0))
        .some(_.propertyOf(program));
}

function programRun() {
    programInit();
    program.global ?
        programRunGlobal() :
        programRunLocal()
}

function programRunGlobal() {
    return analyzeGlobalPackages();
}

function programRunLocal() {

    var pkgFile;
    var json;

    if(!process.stdin.isTTY) {
        pkgData = stdin;
        pkgFile = null; // this signals analyzeProjectDependencies to search for installed dependencies and to not print the upgrade message
    }
    else {
        // find the closest descendant package
        pkgFile = closestPackage.sync(process.cwd());
        if (!fs.existsSync(pkgFile)) {
            throw new Error('package.json not found');
        }

        // print a message if we are using a descendant package.json
        var relPathToPackage = path.relative(process.cwd(), pkgFile);
        if(relPathToPackage !== 'package.json') {
            print('Using ' + relPathToPackage);
        }

        pkgData = readPackageFile(pkgFile, null, false);
    }

    return pkgData.then(_.partial(analyzeProjectDependencies, _, pkgFile));
}

program
    .version(require('../package').version)
    .description('[filter] is a list or regex of package names to check (all others will be ignored).')
    .usage('[options] [filter]')
    .option('-d, --dev', 'check only devDependencies')
    .option('-e, --error-level <n>', 'set the error-level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration). Default is 1.', cint.partialAt(parseInt, 1, 10), 1)
    .option('-g, --global', 'check global packages instead of in the current project')
    // program.json is set to true in programInit if any options that begin with 'json' are true
    .option('-j, --jsonAll', 'output new package.json instead of human-readable message')
    .option('--jsonUpgraded', 'output upgraded dependencies in json')
    .option('-p, --prod', 'check only dependencies (not devDependencies)')
    .option('-r, --registry <url>', 'specify third-party npm registry')
    .option('-s, --silent', "don't output anything")
    .option('-t, --greatest', "find the highest versions available instead of the latest stable versions")
    .option('-u, --upgrade', 'upgrade package.json dependencies to match latest versions (maintaining existing policy)')

program.parse(process.argv);

vm.initialize(program.global).then(programRun);

