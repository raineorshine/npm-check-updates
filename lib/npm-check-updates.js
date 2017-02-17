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
    minimal: 2,
    warn: 3,
    info: 4,
    verbose: 5,
    silly: 6
};

// time to wait for stdin before printing a warning
var stdinWarningTime = 5000;
var stdinWarningMessage = 'Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry specifying a package file explicitly with ' + chalk.blue('--packageFile package.json') + '. \nSee https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102';

//
// Helper functions
//

function print(message, loglevel, method) {

    method = method || 'log';

    // not in json mode
    // not silent
    // not at a loglevel under minimum specified
    if (!options.json && options.loglevel !== 'silent' && (loglevel == null || logLevels[options.loglevel] >= logLevels[loglevel])) {
        console[method](message);
    }
}

function programError(message) {
    if (options.cli) {
        print(message, null, 'error');
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

function getVersionTarget(opt) {
    var o = opt || options;
    return o.semverLevel ? o.semverLevel :
        o.newest ? 'newest' :
        o.greatest ? 'greatest' :
        'latest';
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
    var versionTarget = getVersionTarget(options);
    print('Fetching ' + versionTarget + ' versions...', 'verbose');

    return vm.getLatestVersions(currentDependencies, {
        versionTarget: versionTarget,
        registry: options.registry ? options.registry : null
    }).then(function (latestVersions) {

        var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions, {
            removeRange: options.removeRange
        });

        var filteredUpgradedDependencies = _.pickBy(upgradedDependencies, function (v, dep) {
            return !options.jsonUpgraded || options.upgradeAll || !vm.isSatisfied(latestVersions[dep], currentDependencies[dep]);
        });

        return [filteredUpgradedDependencies, latestVersions];
    });
}

function analyzeGlobalPackages() {

    print('Getting installed packages...', 'verbose');

    return vm.getInstalledPackages({
        filter: options.filter,
        reject: options.reject
    })
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
        pkgFile ? vm.getInstalledPackages({cwd: options.packageFileDir ? path.dirname(path.resolve(pkgFile)) : null}) : Promise.resolve(),
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
function toDependencyTable(args) {

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
        var smiley = chalk.green.bold(':)');
        if (options.global) {
            print('All global packages are up-to-date ' + smiley);
        } else {
            print('All dependencies match the ' + getVersionTarget(options) + ' package versions ' +
                smiley);
        }
    }

    // print unsatisfied table
    if (numUnsatisfied > 0) {
        var unsatisfiedTable = toDependencyTable({
            from: args.current,
            to: unsatisfiedUpgraded
        }, {
            greatest: options.greatest,
            newest: options.newest
        });
        print(unsatisfiedTable.toString());
    }

    // print satisfied table
    if (numSatisfied > 0) {
        var satisfiedTable = toDependencyTable({
            from: args.current,
            to: satisfiedUpgraded
        }, {
            greatest: options.greatest,
            newest: options.newest
        });
        print((numUnsatisfied > 0 ? '\n' : '') + 'The following dependenc' + (numSatisfied === 1 ? 'y is' : 'ies are') + ' satisfied by ' + (numSatisfied === 1 ? 'its' : 'their') + ' declared version range, but the installed version' + (numSatisfied === 1 ? ' is' : 's are') + ' behind. You can install the latest version' + (numSatisfied === 1 ? '' : 's') + ' without modifying your package file by using ' + chalk.blue(options.packageManager + ' update') + '. If you want to update the dependenc' + (numSatisfied === 1 ? 'y' : 'ies') + ' in your package file anyway, run ' + chalk.blue('ncu -a') + '.\n', 'warn');
        print(satisfiedTable.toString(), 'warn');
    }

    var numToUpgrade = numUnsatisfied + (options.upgradeAll ? numSatisfied : 0);

    if (args.pkgFile && numToUpgrade > 0) {
        if (options.errorLevel >= 2) {
            programError('Dependencies not up-to-date');
        } else if (args.isUpgrade) {
            var newPkgData = vm.updatePackageData(args.pkgData, args.current, args.upgraded, args.latest, options);
            writePackageFile(args.pkgFile, newPkgData)
                .then(function () {
                    print('Upgraded ' + args.pkgFile + '\n');
                });
        } else {
            print('\nRun ' + chalk.blue('ncu') + ' with ' + chalk.blue(numUnsatisfied > 0 ? '-u' : '-a') + ' to upgrade ' + getPackageFileName());
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
    if (options.silent) {
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
    var stdinTimer;

    print('Running in local mode...', 'verbose');
    print('Finding package file data...', 'verbose');

    var pkgFileName = getPackageFileName();

    // get the package data from the various input possibilities
    if (options.packageData) {
        pkgData = Promise.resolve(options.packageData);
    } else if (options.packageFile) {
        pkgFile = options.packageFile;
        pkgData = getPackageDataFromFile(pkgFile, pkgFileName);
    } else if (!process.stdin.isTTY) {
        print('Waiting for package data on stdin...', 'verbose');

        // warn the user after a while if still waiting for stdin
        // this is a way to mitigate #136 where Windows unexpectedly waits for stdin
        stdinTimer = setTimeout(function () {
            console.log(stdinWarningMessage);
        }, stdinWarningTime);

        // clear the warning timer once stdin returns and fallback to scanning pwd if no content from stdin
        pkgData = getstdin().then(function (_pkgData) {
            clearTimeout(stdinTimer);

            var isEmptyStdin = _pkgData.length === 0 || (_pkgData.length === 1 && _pkgData.charCodeAt(0) === 10);
            // if no stdin content fall back to searching for package.json from pwd and up to root
            if (isEmptyStdin) {
                pkgFile = findUp.sync(pkgFileName);
                return getPackageDataFromFile(pkgFile, pkgFileName);
            } else {
                return _pkgData;
            }
        });
    } else {
        // find the closest package starting from the current working directory and going up to the root
        pkgFile = findUp.sync(pkgFileName);
        pkgData = getPackageDataFromFile(pkgFile, pkgFileName);
    }

    return pkgData.then(function (_pkgData) {
        return analyzeProjectDependencies(_pkgData, pkgFile);
    });
}

function getPackageDataFromFile(pkgFile, pkgFileName) {
    // print a message if we are using a descendant package file
    var relPathToPackage = path.resolve(pkgFile);
    if (relPathToPackage !== pkgFileName) {
        print('Using ' + relPathToPackage);
    }
    if (!fs.existsSync(pkgFile)) {
        programError(chalk.red(relPathToPackage + ' not found'));
    }

    return readPackageFile(pkgFile);
}

module.exports = _.merge({
    run: function (opts) {
        options = opts || {};

        // if not executed on the command-line (i.e. executed as a node module), set some defaults
        if (!options.cli) {
            _.defaults(options, {
                // if they want to modify the package file, we must disable jsonUpgraded
                // otherwise the write operation will not happen
                jsonUpgraded: !options.upgrade,
                // should not suggest upgrades to versions within the specified version range if upgradeAll is explicitly set to false. Will become the default in the next major version.
                upgradeAll: options.upgradeAll === undefined ? true : options.upgradeAll,
                loglevel: 'silent',
                args: []
            });
        }

        // get filter from arguments
        options.filter = options.args.join(' ') || options.filter;

        print('Initializing...', 'verbose');

        return vm.initialize({
            global: options.global,
            packageManager: options.packageManager,
            registry: options.registry
        }).then(programRun);
    }
}, vm);
