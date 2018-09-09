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
var stdinWarningMessage = 'Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry specifying a package file explicitly with ' + chalk.cyan('--packageFile package.json') + '. \nSee https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102';

//
// Helper functions
//

function print(options, message, loglevel, method) {

    method = method || 'log';

    // not in json mode
    // not silent
    // not at a loglevel under minimum specified
    if (!options.json && options.loglevel !== 'silent' && (loglevel == null || logLevels[options.loglevel] >= logLevels[loglevel])) {
        console[method](message);
    }
}

function programError(options, message) {
    if (options.cli) {
        print(options, message, null, 'error');
        process.exit(1);
    } else {
        throw new Error(message);
    }
}

function printJson(options, object) {
    if (options.loglevel !== 'silent') {
        console.log(JSON.stringify(object, null, 2));
    }
}

/**
 * Gets the name of the package file based on --packageFile or --packageManager.
 */
function getPackageFileName(options) {
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

/**
 * @param args.from
 * @param args.to
 * @param options.greatest
 */
function toDependencyTable(options, args) {

    options = options || {};
    var table = createDependencyTable();
    var rows = Object.keys(args.to).map(dep => {
        var from = args.from[dep] || '';
        var to = versionUtil.colorizeDiff(args.to[dep] || '', args.from[dep]);
        return [dep, from, '→', to];
    });
    rows.forEach(row => {
        table.push(row);
    });
    return table;
}

var readPackageFile = cint.partialAt(fs.readFileAsync, 1, 'utf8');
var writePackageFile = fs.writeFileAsync;

//
// Main functions
//

function analyzeGlobalPackages(options) {

    if (options.global && options.upgrade) {
        programError(options, chalk.cyan('ncu') + ' cannot upgrade global packages. Run ' + chalk.cyan('npm install -g [package]') +
            ' to update a global package');
    }

    print(options, 'Getting installed packages...', 'verbose');

    return vm.getInstalledPackages({
        cwd: options.cwd,
        filter: options.filter,
        global: options.global,
        packageManager: options.packageManager,
        prefix: options.prefix,
        reject: options.reject
    })
        .then(globalPackages => {
            print(options, 'globalPackages', 'silly');
            print(options, globalPackages, 'silly');
            print(options, '', 'silly');
            print(options, 'Fetching ' + vm.getVersionTarget(options) + ' versions...', 'verbose');

            return vm.upgradePackageDefinitions(globalPackages, options)
                .spread((upgraded, latest) => {

                    print(options, latest, 'silly');

                    if (options.json) {
                        // since global packages do not have a package.json, return the upgraded deps directly (no version range replacements)
                        printJson(options, upgraded);
                    } else {
                        printUpgrades(options, {
                            current: globalPackages,
                            upgraded: upgraded,
                            latest: latest
                        });
                        print(options, '');
                    }
                    return upgraded;
                });
        });
}

function analyzeProjectDependencies(options, pkgData, pkgFile) {

    var pkg;

    try {
        pkg = jph.parse(pkgData);
    } catch (e) {
        programError(options, chalk.red('Invalid package file' + (pkgFile ? ': ' + pkgFile : ' from stdin') + '. Error details:\n' + e.message));
    }

    var current = vm.getCurrentDependencies(pkg, {
        prod: options.prod,
        dev: options.dev,
        optional: options.optional,
        peer: options.peer,
        filter: options.filter,
        reject: options.reject
    });

    print(options, 'Fetching ' + vm.getVersionTarget(options) + ' versions...', 'verbose');

    return vm.upgradePackageDefinitions(current, options).spread((upgraded, latest) => {

        var newPkgData = vm.upgradePackageData(pkgData, current, upgraded, latest, options);

        // print
        if (options.json) {

            // use the upgraded dependencies data to generate new package data
            // INVARIANT: we don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
            var output = options.jsonAll ? jph.parse(newPkgData) :
                options.jsonDeps ?
                    _.pick(jph.parse(newPkgData), 'dependencies', 'devDependencies', 'optionalDependencies') :
                    upgraded;

            printJson(options, output);
        } else {
            printUpgrades(options, {
                current: current,
                upgraded: upgraded,
                latest: latest,
                pkgData: pkgData,
                pkgFile: pkgFile,
                isUpgrade: options.upgrade
            });
        }

        // write

        // TODO: All this is just to get numUpgraded here. This is repeated in printUpgrades.
        var deps = Object.keys(upgraded);
        var satisfied = cint.toObject(deps, dep => {
            return cint.keyValue(dep, vm.isSatisfied(latest[dep], current[dep]));
        });
        var isSatisfied = _.propertyOf(satisfied);
        var filteredUpgraded = options.minimal ? cint.filterObject(upgraded, cint.not(isSatisfied)) : upgraded;
        var numUpgraded = Object.keys(filteredUpgraded).length;

        if (pkgFile && numUpgraded > 0) {
            if (options.errorLevel >= 2) {
                programError(options, 'Dependencies not up-to-date');
            } else if (options.upgrade) {
                // short-circuit return in order to wait for write operation, but still return the same output
                return writePackageFile(pkgFile, newPkgData)
                    .then(() => {
                        print(options, '\nUpgraded ' + pkgFile + '\n');
                        return output;
                    });
            } else {
                print(options, '\nRun ' + chalk.cyan('ncu') + ' with ' + chalk.cyan('-u') + ' to upgrade ' + getPackageFileName(options));
            }
        }

        return output;
    });
}

/**
 * @param args.current
 * @param args.upgraded
 * @param args.latest (optional)
 */
function printUpgrades(options, args) {

    // split the deps into satisfied and unsatisfied to display in two separate tables
    var deps = Object.keys(args.upgraded);
    var satisfied = cint.toObject(deps, dep => {
        return cint.keyValue(dep, vm.isSatisfied(args.latest[dep], args.current[dep]));
    });

    var isSatisfied = _.propertyOf(satisfied);
    var upgraded = options.minimal ? cint.filterObject(args.upgraded, cint.not(isSatisfied)) : args.upgraded;
    var numUpgraded = Object.keys(upgraded).length;

    print(options, '');

    // print everything is up-to-date
    if (numUpgraded === 0) {
        var smiley = chalk.green.bold(':)');
        if (options.global) {
            print(options, 'All global packages are up-to-date ' + smiley);
        } else {
            print(options, 'All dependencies match the ' + vm.getVersionTarget(options) + ' package versions ' +
                smiley);
        }
    }

    // print table
    if (numUpgraded > 0) {
        var table = toDependencyTable(options, {
            from: args.current,
            to: upgraded
        }, {
            greatest: options.greatest,
            newest: options.newest
        });
        print(options, table.toString());
    }
}

//
// Program
//


/** Initializes and consolidates options from the cli. */
function initOptions(options) {

    return _.assign({}, options, {
        filter: options.args.join(' ') || options.filter,
        // convert silent option to loglevel silent
        loglevel: options.silent ? 'silent' : options.loglevel,
        minimal: options.minimal === undefined ? false : options.loglevel,
        // add shortcut for any keys that start with 'json'
        json: _(options)
            .keys()
            .filter(_.partial(_.startsWith, _, 'json', 0))
            .some(_.propertyOf(options))
    });
}

/** Finds the package file and data.
    @returns Promise [pkgFile, pkgData]

Searches as follows:
 --packageData flag
 --packageFile flag
 --stdin
 --findUp
*/
function findPackage(options) {

    var pkgData;
    var pkgFile;
    var stdinTimer;

    print(options, 'Running in local mode...', 'verbose');
    print(options, 'Finding package file data...', 'verbose');

    var pkgFileName = getPackageFileName(options);

    function getPackageDataFromFile(pkgFile, pkgFileName) {
        // exit if no pkgFile to read from fs
        if (pkgFile !== null) {
            // print a message if we are using a descendant package file
            var relPathToPackage = path.resolve(pkgFile);
            if (relPathToPackage !== pkgFileName) {
                print(options, 'Using ' + relPathToPackage);
            }
        } else {
            programError(options, chalk.red('No ' + pkgFileName) + '\n\nPlease add a ' + pkgFileName + ' to the current directory, specify the ' + chalk.cyan('--packageFile') + ' or ' + chalk.cyan('--packageData') + ' options, or pipe a ' + pkgFileName + ' to stdin.');
        }

        return readPackageFile(pkgFile);
    }

    // get the package data from the various input possibilities
    if (options.packageData) {
        pkgData = Promise.resolve(options.packageData);
    } else if (options.packageFile) {
        pkgFile = options.packageFile;
        pkgData = getPackageDataFromFile(pkgFile, pkgFileName);
    } else if (!process.stdin.isTTY) {
        print(options, 'Waiting for package data on stdin...', 'verbose');

        // warn the user after a while if still waiting for stdin
        // this is a way to mitigate #136 where Windows unexpectedly waits for stdin
        stdinTimer = setTimeout(() => {
            console.log(stdinWarningMessage);
        }, stdinWarningTime);

        // clear the warning timer once stdin returns and fallback to scanning pwd if no content from stdin
        pkgData = getstdin().then(_pkgData => {
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

    return Promise.all([pkgData, pkgFile]);
}

/** main entry point */
function run(opts) {
    var options = opts || {};

    // if not executed on the command-line (i.e. executed as a node module), set some defaults
    if (!options.cli) {
        options = _.defaults({}, options, {
            jsonUpgraded: true,
            loglevel: 'silent',
            packageManager: 'npm',
            args: []
        });
    }

    options = initOptions(options);

    if (options.timeout) {
        var timeoutMs = _.isString(options.timeout) ? parseInt(options.timeout, 10) : options.timeout;
        var timeout = setTimeout(() => {
            programError(options, chalk.red('Exceeded global timeout of ' + timeoutMs + 'ms'));
        }, timeoutMs);
    }

    var pendingAnalysis = options.global ?
        analyzeGlobalPackages(options) :
        findPackage(options).spread(_.partial(analyzeProjectDependencies, options));

    if (timeout) {
        pendingAnalysis = pendingAnalysis.then(() => {
            clearTimeout(timeout);
        });
    }

    return pendingAnalysis;
}

module.exports = _.assign({
    run: run
}, vm);
