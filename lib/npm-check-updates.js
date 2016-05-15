var options = {};

//
// Dependencies
//

var cint = require('cint');
var path = require('path');
var findUp = require('find-up');
var _ = require('lodash');
var Promise = require('bluebird');
var getstdin = require('get-stdin');
var Table = require('cli-table');
var chalk = require('chalk');
var fs = Promise.promisifyAll(require('fs'));
var vm = require('./versionmanager');
var versionUtil = require('./version-util');
var jph = require('json-parse-helpfulerror');

// maps package managers to package file names
var packageFileNames = {
    npm: 'package.json',
    bower: 'bower.json'
};

// maps string levels to numeric levels
var logLevels = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    verbose: 4,
    silly: 5
};

//
// Helper functions
//

function print(message, loglevel) {
    // not in json mode
    // not silent
    // not at a loglevel under minimum specified
    if (!options.json && options.loglevel !== 'silent' && (loglevel === undefined || logLevels[options.loglevel] >= logLevels[loglevel])) {
        console.log(message);
    }
}

function programError(message) {
    if (options.cli) {
        print(message);
        process.exit(1);
    } else {
        throw new Error(message);
    }
}

function printJson(message) {
    if (options.loglevel !== 'silent') {
        console.log(message);
    }
}

/**
 * Gets the name of the package file based on --packageFile or --packageManager.
 */
function getPackageFileName() {
    return options.packageFile ? options.packageFile :
        packageFileNames[options.packageManager];
}

function createDependencyTable() {
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
    var versionTarget = options.greatest ? 'greatest' : 'latest';

    print('Fetching ' + versionTarget + ' versions...', 'verbose');

    return vm.getLatestVersions(dependencyList, {
        versionTarget: versionTarget,
        registry: options.registry ? options.registry : null
    }).then(function (latestVersions) {
        var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions);
        return [upgradedDependencies, latestVersions];
    });
}

function analyzeGlobalPackages() {

    print('Getting installed packages...', 'verbose');

    return vm.getInstalledPackages({filter: options.filter})
        .then(function (globalPackages) {
            print(globalPackages, 'silly');
            print('', 'silly');

            return upgradePackageDefinitions(globalPackages)
                .spread(function (upgraded, latest) {

                    print(latest, 'silly');
                    printUpgrades({
                        current: globalPackages,
                        upgraded: upgraded,
                        latest: latest
                    });

                });
        });
}

function analyzeProjectDependencies(pkgData, pkgFile) {

    var pkg;

    try {
        pkg = jph.parse(pkgData);
    } catch (e) {
        programError(chalk.red('Invalid package file' + (pkgFile ? ': ' + pkgFile : ' from stdin') + '. Error details:\n' + e.message));
    }

    var current = vm.getCurrentDependencies(pkg, {
        prod: options.prod,
        dev: options.dev,
        optional: options.optional,
        filter: options.filter,
        reject: options.reject
    });

    print('Getting installed packages...', 'verbose');

    return Promise.all([
        current,
        // only search for installed dependencies if a pkgFile is specified
        pkgFile ? vm.getInstalledPackages() : Promise.resolve(),
        upgradePackageDefinitions(current)
    ])
    .spread(function (current, installed, upgradedAndLatest) {

        var output;
        var newPkgData;

        var upgraded = upgradedAndLatest[0];
        var latest = upgradedAndLatest[1];

        if (options.json) {
            newPkgData = vm.updatePackageData(pkgData, current, upgraded, latest, options);
            // don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.updatePackageData simply does a find-and-replace on that
            output = options.jsonAll ? jph.parse(newPkgData) :
                options.jsonDeps ?
                    _.pick(jph.parse(newPkgData), 'dependencies', 'devDependencies', 'optionalDependencies') :
                    upgraded;

            printJson(JSON.stringify(output));
            return output;
        } else {
            printUpgrades({
                installed: installed,
                current: current,
                upgraded: upgraded,
                latest: latest,
                pkgData: pkgData,
                pkgFile: pkgFile,
                isUpgrade: options.upgrade
            });
            return null;
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
    var table = createDependencyTable();
    var rows = Object.keys(args.to).map(function (dep) {
        var from = args.from[dep] || '';
        var to = versionUtil.colorizeDiff(args.to[dep] || '', args.from[dep]);
        return [dep, from, '→', to];
    });
    rows.forEach(function (row) {
        table.push(row);
    });
    return table;
}

// TODO: printUpgrades and analyzeProjectDependencies need to be refactored. They are tightly coupled and monolithic.
/**
 * @param args.current
 * @param args.upgraded
 * @param args.installed (optional)
 * @param args.latest (optional)
 * @param args.pkgData
 * @param args.pkgFile (optional)
 * @param args.isUpgrade (optional)
 */
function printUpgrades(args) {

    // split the deps into satisfied and unsatisfied to display in two separate tables
    var deps = Object.keys(args.upgraded);
    var satisfied = cint.toObject(deps, function (dep) {
        return cint.keyValue(dep, vm.isSatisfied(args.latest[dep], args.current[dep]));
    });

    var isSatisfied = _.propertyOf(satisfied);
    var satisfiedUpgraded = cint.filterObject(args.upgraded, function (dep) {
        return isSatisfied(dep) && (!args.latest || !args.installed || args.latest[dep] !== args.installed[dep]);
    });
    var unsatisfiedUpgraded = cint.filterObject(args.upgraded, cint.not(isSatisfied));
    var numSatisfied =   Object.keys(satisfiedUpgraded).length;
    var numUnsatisfied = Object.keys(unsatisfiedUpgraded).length;

    print('');

    // print everything is up-to-date
    if (numSatisfied === 0 && numUnsatisfied === 0) {
        var smiley = chalk.yellow(':)');
        if (options.global) {
            print('All global packages are up-to-date ' + smiley);
        } else {
            print('All dependencies match the ' + (options.greatest ? 'greatest' : 'latest') + ' package versions ' +
                smiley);
        }
    }

    // print unsatisfied table
    if (numUnsatisfied > 0) {
        var unsatisfiedTable = toDependencyTable({
            from: args.current,
            to: unsatisfiedUpgraded
        }, {
            greatest: options.greatest
        });
        print(unsatisfiedTable.toString());
    }

    // print satisfied table
    if (numSatisfied > 0) {
        var satisfiedTable = toDependencyTable({
            from: args.current,
            to: satisfiedUpgraded
        }, {
            greatest: options.greatest
        });
        print((numUnsatisfied > 0 ? '\n' : '') + 'The following dependenc' + (numSatisfied === 1 ? 'y is' : 'ies are') + ' satisfied by ' + (numSatisfied === 1 ? 'its' : 'their') + ' declared version range, but the installed version' + (numSatisfied === 1 ? ' is' : 's are') + ' behind. You can install the latest version' + (numSatisfied === 1 ? '' : 's') + ' without modifying your package file by using ' + chalk.blue(options.packageManager + ' update') + '. If you want to update the dependenc' + (numSatisfied === 1 ? 'y' : 'ies') + ' in your package file anyway, use ' + chalk.blue('-a/--upgradeAll') + '.\n');
        print(satisfiedTable.toString());
    }

    var numToUpgrade = numUnsatisfied + (options.upgradeAll ? numSatisfied : 0);

    if (args.pkgFile && numToUpgrade > 0) {
        if (args.isUpgrade) {
            var newPkgData = vm.updatePackageData(args.pkgData, args.current, args.upgraded, args.latest, options);
            writePackageFile(args.pkgFile, newPkgData)
                .then(function () {
                    print('Upgraded ' + args.pkgFile + '\n');
                });
        } else {
            print('\nRun with ' + chalk.blue(numUnsatisfied > 0 ? '-u' : '-a') + ' to upgrade ' + getPackageFileName());
        }
        if (options.errorLevel >= 2) {
            programError('Dependencies not up-to-date');
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
        programError(chalk.blue('ncu') + ' cannot upgrade global packages. Run ' + chalk.blue('npm install -g [package]') +
            ' to update a global package');
    }

    // add shortcut for any keys that start with 'json'
    options.json = _(options)
        .keys()
        .filter(_.partial(_.startsWith, _, 'json', 0))
        .some(_.propertyOf(options));

    // convert silent option to loglevel silent
    if (!options.loglevel && options.silent) {
        options.loglevel = 'silent';
    }
}

function programRun() {
    programInit();
    return options.global ? programRunGlobal() : programRunLocal();
}

function programRunGlobal() {

    print('Running in global mode...', 'verbose');
    return analyzeGlobalPackages();
}

function programRunLocal() {

    var pkgData;
    var pkgFile;

    print('Running in local mode...', 'verbose');
    print('Finding package file data...', 'verbose');

    var pkgFileName = getPackageFileName();

    // get the package data from the various input possibilities
    if (options.packageData) {
        pkgData = Promise.resolve(options.packageData);
    } else if (options.packageFile) {
        pkgFile = options.packageFile;
    } else if (!process.stdin.isTTY) {
        print('Waiting for package data on stdin...', 'verbose');
        pkgData = getstdin();
    } else {
        // find the closest package starting from the current working directory and going up to the root
        pkgFile = findUp.sync(pkgFileName);
    }

    // if pkgFile was set, make sure it exists and read it into pkgData
    if (pkgFile) {
        // print a message if we are using a descendant package file
        var relPathToPackage = path.relative(process.cwd(), pkgFile);
        if (relPathToPackage !== pkgFileName) {
            print('Using ' + relPathToPackage);
        }
        if (!fs.existsSync(pkgFile)) {
            programError(chalk.red(relPathToPackage + ' not found'));
        }

        pkgData = readPackageFile(pkgFile, null, false);
    }

    // no package data!
    if (!pkgData) {
        programError(chalk.red('No ' + pkgFileName) + '\n\nPlease add a ' + pkgFileName + ' to the current directory, specify the ' + chalk.blue('--packageFile') + ' or ' + chalk.blue('--packageData') + ' options, or pipe a ' + pkgFileName + ' to stdin.');
    }

    return pkgData.then(_.partial(analyzeProjectDependencies, _, pkgFile));
}

module.exports = _.merge({
    run: function (opts) {
        options = opts || {};

        // if not executed on the command-line (i.e. executed as a node module), set some defaults
        if (!options.cli) {
            _.defaults(options, {
                jsonUpgraded: true,
                loglevel: 'silent',
                args: []
            });
        }

        print('Initializing...', 'verbose');

        return vm.initialize({
            global: options.global,
            packageManager: options.packageManager
        }).then(programRun);
    }
}, vm);
