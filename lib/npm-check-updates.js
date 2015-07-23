var options = {};

//
// Dependencies
//

var async          = require('async');
var cint           = require('cint');
var path           = require('path');
var util           = require('util');
var closestPackage = require('closest-package');
var _              = require('lodash');
var Promise        = require('bluebird');
var Table          = require('cli-table');
var chalk          = require('chalk');
var fs             = Promise.promisifyAll(require('fs'));
var vm             = require('./versionmanager');
var versionUtil    = require('./version-util');

//
// Helper functions
//

function print(message) {
    if (!options.silent) {
       console.log(message);
    }
}

function createDependencyTable(options) {
    options = options || {};
    return new Table({
        colAligns: ['left', 'right', 'right', 'right'],
        chars: {
            'top': '',
            'top-mid': '',
            'top-left': '',
            'top-right': '',
            'bottom': '',
            'bottom-mid': '',
            'bottom-left': '',
            'bottom-right': '',
            'left': '',
            'left-mid': '',
            'mid': '',
            'mid-mid': '',
            'right': '',
            'right-mid': '',
            'middle': ''
        }
    });
}

var readPackageFile = cint.partialAt(fs.readFileAsync, 1, 'utf8');
var writePackageFile = fs.writeFileAsync;

//
// Main functions
//

function upgradePackageDefinitions(currentDependencies) {
    var dependencyList = Object.keys(currentDependencies);
    return vm.getLatestVersions(dependencyList, {
        versionTarget: options.greatest ? 'greatest' : 'latest',
        registry: options.registry ? options.registry : null
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
                    printUpgrades({
                        current: globalPackages,
                        upgraded: upgraded,
                        latest: latest
                    });

                });
        });
}

function analyzeProjectDependencies(pkgData, pkgFile) {
    var pkg = JSON.parse(pkgData);
    var current = vm.getCurrentDependencies(pkg, {
        prod: options.prod,
        dev: options.dev,
        filter: options.args[0]
    });

    return Promise.all([
        current,
        // only search for installed dependencies if a pkgFile is specified
        pkgFile ? vm.getInstalledPackages() : Promise.resolve(),
        upgradePackageDefinitions(current)
    ])
    .spread(function (current, installed, upgradedAndLatest) {
        return [current, installed, upgradedAndLatest[0], upgradedAndLatest[1]];
    })
    .spread(function (current, installed, upgraded, latest) {

        if(options.json) {
            var newPkgData = vm.updatePackageData(pkgData, current, upgraded, latest, options);
            print(options.jsonAll ? JSON.parse(newPkgData) :
                options.jsonDeps ? _.pick(JSON.parse(newPkgData), 'dependencies', 'devDependencies') :
                upgraded
            );
        }
        else {
            printUpgrades({
                installed: installed,
                current: current,
                upgraded: upgraded,
                latest: latest
            });

            if(pkgFile && !_.isEmpty(upgraded)) {
                if (options.upgrade) {
                    var newPkgData = vm.updatePackageData(pkgData, current, upgraded, latest, options);
                    writePackageFile(pkgFile, newPkgData)
                        .then(function () {
                            print('\n' + pkgFile + " upgraded");
                        });
                } else {
                    print('Run with ' + chalk.blue('-u') + ' to upgrade your package.json\n');
                }
                if(options.errorLevel >= 2) {
                    throw new Error('Dependencies not up-to-date');
                }
            }
        }
    });
}

/**
 * @param args.from
 * @param args.to
 * @param options.greatest
 */
function toDependencyTable(args, options) {

    options = options || {};
    var table = createDependencyTable(options);
    var rows = Object.keys(args.to).map(function (dep) {
        var from = args.from[dep] || '';
        var to = versionUtil.colorizeDiff(args.to[dep] || '', args.from[dep]);
        return [dep, from, '→', to];
    });
    rows.forEach(function (row) { table.push(row); })
    return table;
}

/**
 * @param current
 * @param upgraded
 * @param installed (optional)
 * @param latest (optional)
 */
function printUpgrades(args) {
    print('');
    if (_.isEmpty(args.upgraded)) {
        if(options.global) {
            print("All global packages are up-to-date :)");
        }
        else {
            print("All dependencies match the " + (options.greatest ? 'greatest' : 'latest') + " package versions :)");
        }
    } else {

        // split the deps into satisfied and unsatisfied to display in two separate tables
        var deps = Object.keys(args.upgraded);
        var satisfied = cint.toObject(deps, function (dep) {
          return cint.keyValue(dep, vm.isSatisfied(args.latest[dep], args.current[dep]));
        })
        var isSatisfied = _.propertyOf(satisfied);
        var unsatisfiedUpgraded = cint.filterObject(args.upgraded, cint.not(isSatisfied));
        var satisfiedUpgraded = cint.filterObject(args.upgraded, isSatisfied);

        // print unsatisfied table
        var unsatisfiedTable = toDependencyTable({
            from: args.current,
            to: unsatisfiedUpgraded
        }, { greatest: options.greatest });
        print(unsatisfiedTable.toString());

        // filter out installed packages that match the latest
        satisfiedUpgraded = cint.filterObject(satisfiedUpgraded, function (dep) {
          return !args.latest || args.latest[dep] !== args.installed[dep];
        });

        // print satisfied table (if any exist)
        if(Object.keys(satisfiedUpgraded).length > 0) {
            var count = Object.keys(satisfiedUpgraded).length;
            var satisfiedTable = toDependencyTable({
                from: args.current,
                to: satisfiedUpgraded
            }, { greatest: options.greatest });
            print('\nThe following ' + (count === 1 ? 'dependency is' : 'depencencies are') + ' satisfied by ' + (count === 1 ? 'its' : 'their') + ' declared version range, but the installed version' + (count === 1 ? ' is' : 's are') + ' behind. Update without modifying your package.json by running ' + chalk.blue('npm update') + '. Upgrade your package.json by running ' + chalk.blue('ncu -ua') + '.\n')
            print(satisfiedTable.toString());
        }
    }
    print('');
}

//
// Program
//


function programInit() {

    // 'upgradeAll' is a type of an upgrade so if it's set, we set 'upgrade' as well
    options.upgrade = options.upgrade || options.upgradeAll;

    if (options.global && options.upgrade) {
        print("npm-check-updates cannot update global packages.");
        print("Run 'npm install -g [package]' to upgrade a global package.");
        process.exit(1);
    }

    // add shortcut for any keys that start with 'json'
    options.json = _(options)
        .keys()
        .filter(_.partial(_.startsWith, _, 'json', 0))
        .some(_.propertyOf(options));
}

function programRun() {
    programInit();
    return options.global ?  programRunGlobal() : programRunLocal();
}

function programRunGlobal() {
    return analyzeGlobalPackages();
}

function programRunLocal() {

    var pkgFile;
    var json;

    if(!process.stdin.isTTY) {
        pkgData = require('get-stdin-promise');
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

module.exports = _.merge({
    run: function(opts) {
        options = opts || {};
        options.args = options.args || [];

        return vm.initialize(options.global).then(programRun);
    }
}, vm);
