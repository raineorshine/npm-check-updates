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
const packageFileNames = {
    npm: 'package.json',
    bower: 'bower.json'
};

// maps string levels to numeric levels
const logLevels = {
    silent: 0,
    error: 1,
    minimal: 2,
    warn: 3,
    info: 4,
    verbose: 5,
    silly: 6
};

// time to wait for stdin before printing a warning
const stdinWarningTime = 5000;
const stdinWarningMessage = `Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry specifying a package file explicitly with ${chalk.blue('--packageFile package.json')}. \nSee https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102`;

//
// Helper functions
//

function print(options, message, loglevel, method='log') {
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

function printJson(options, message) {
    if (options.loglevel !== 'silent') {
        console.log(message);
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
function toDependencyTable(options={}, args) {
    const table = createDependencyTable();
    const rows = Object.keys(args.to).map(dep => {
        const from = args.from[dep] || '';
        const to = versionUtil.colorizeDiff(args.to[dep] || '', args.from[dep]);
        return [dep, from, '→', to];
    });
    rows.forEach(row => {
        table.push(row);
    });
    return table;
}

const readPackageFile = cint.partialAt(fs.readFileAsync, 1, 'utf8');
const writePackageFile = fs.writeFileAsync;

//
// Main functions
//

function analyzeGlobalPackages(options) {

    if (options.global && options.upgrade) {
        programError(options, `${chalk.blue('ncu')} cannot upgrade global packages. Run ${chalk.blue('npm install -g [package]')} to update a global package`);
    }

    print(options, 'Getting installed packages...', 'verbose');

    return vm.getInstalledPackages({
        filter: options.filter,
        reject: options.reject
    })
        .then(globalPackages => {
            print(options, globalPackages, 'silly');
            print(options, '', 'silly');
            print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose');

            return vm.upgradePackageDefinitions(globalPackages, options)
                .spread((upgraded, latest) => {

                    print(options, latest, 'silly');
                    printUpgrades(options, {
                        current: globalPackages,
                        upgraded,
                        latest
                    });

                });
        });
}

function analyzeProjectDependencies(options, pkgData, pkgFile) {

    let pkg;

    try {
        pkg = jph.parse(pkgData);
    } catch (e) {
        programError(options, chalk.red(`Invalid package file${pkgFile ? ': ' + pkgFile : ' from stdin'}. Error details:\n${e.message}`));
    }

    const current = vm.getCurrentDependencies(pkg, {
        prod: options.prod,
        dev: options.dev,
        optional: options.optional,
        filter: options.filter,
        reject: options.reject
    });

    print(options, 'Getting installed packages...', 'verbose');
    print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose');

    return Promise.all([
        current,
        // only search for installed dependencies if a pkgFile is specified
        pkgFile ? vm.getInstalledPackages({
            cwd: options.packageFileDir ? path.dirname(path.resolve(pkgFile)) : null
        }) : Promise.resolve(),
        vm.upgradePackageDefinitions(current, options)
    ])
    .spread((current, installed, upgradedAndLatest) => {

        let output;
        let newPkgData;

        const upgraded = upgradedAndLatest[0];
        const latest = upgradedAndLatest[1];

        if (options.json) {
            newPkgData = vm.upgradePackageData(pkgData, current, upgraded, latest, options);
            // don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
            output = options.jsonAll ? jph.parse(newPkgData) :
                options.jsonDeps ?
                    _.pick(jph.parse(newPkgData), 'dependencies', 'devDependencies', 'optionalDependencies') :
                    upgraded;

            printJson(options, JSON.stringify(output));
            return output;
        } else {
            printUpgrades(options, {
                installed,
                current,
                upgraded,
                latest,
                pkgData,
                pkgFile,
                isUpgrade: options.upgrade
            });
            return null;
        }
    });
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
function printUpgrades(options, args) {

    // split the deps into satisfied and unsatisfied to display in two separate tables
    const deps = Object.keys(args.upgraded);
    const satisfied = cint.toObject(deps, dep => cint.keyValue(dep, vm.isSatisfied(args.latest[dep], args.current[dep])));

    const isSatisfied = _.propertyOf(satisfied);
    const satisfiedUpgraded = cint.filterObject(args.upgraded, dep => isSatisfied(dep) && (!args.latest || !args.installed || args.latest[dep] !== args.installed[dep]));
    const unsatisfiedUpgraded = cint.filterObject(args.upgraded, cint.not(isSatisfied));
    const numSatisfied =   Object.keys(satisfiedUpgraded).length;
    const numUnsatisfied = Object.keys(unsatisfiedUpgraded).length;

    print(options, '');

    // print everything is up-to-date
    if (numSatisfied === 0 && numUnsatisfied === 0) {
        const smiley = chalk.green.bold(':)');
        if (options.global) {
            print(options, `All global packages are up-to-date ${smiley}`);
        } else {
            print(options, `All dependencies match the ${vm.getVersionTarget(options)} package versions ${smiley}`);
        }
    }

    // print unsatisfied table
    if (numUnsatisfied > 0) {
        const unsatisfiedTable = toDependencyTable(options, {
            from: args.current,
            to: unsatisfiedUpgraded
        }, {
            greatest: options.greatest,
            newest: options.newest
        });
        print(options, unsatisfiedTable.toString());
    }

    // print satisfied table
    if (numSatisfied > 0) {
        const satisfiedTable = toDependencyTable(options, {
            from: args.current,
            to: satisfiedUpgraded
        }, {
            greatest: options.greatest,
            newest: options.newest
        });
        print(options, `${numUnsatisfied > 0 ? '\n' : ''}The following dependenc${numSatisfied === 1 ? 'y is' : 'ies are'} satisfied by ${numSatisfied === 1 ? 'its' : 'their'} declared version range, but the installed version${numSatisfied === 1 ? ' is' : 's are'} behind. You can install the latest version${numSatisfied === 1 ? '' : 's'} without modifying your package file by using ${chalk.blue(options.packageManager + ' update')}. If you want to update the dependenc${numSatisfied === 1 ? 'y' : 'ies'} in your package file anyway, run ${chalk.blue('ncu -a')}.\n`, 'warn');
        print(options, satisfiedTable.toString(), 'warn');
    }

    const numToUpgrade = numUnsatisfied + (options.upgradeAll ? numSatisfied : 0);

    if (args.pkgFile && numToUpgrade > 0) {
        if (options.errorLevel >= 2) {
            programError(options, 'Dependencies not up-to-date');
        } else if (args.isUpgrade) {
            const newPkgData = vm.upgradePackageData(args.pkgData, args.current, args.upgraded, args.latest, options);
            writePackageFile(args.pkgFile, newPkgData)
                .then(() => {
                    print(options, `Upgraded ${args.pkgFile}\n`);
                });
        } else {
            print(options, `\nRun ${chalk.blue('ncu')} with ${chalk.blue(numUnsatisfied > 0 ? '-u' : '-a')} to upgrade ${getPackageFileName(options)}`);
        }
    }

    print(options, '');
}

//
// Program
//


/** Initializes and consolidates options from the cli. */
function initOptions(options) {

    return Object.assign({}, options, {
        // 'upgradeAll' is a type of an upgrade so if it's set, we set 'upgrade' as well
        upgrade: options.upgrade || options.upgradeAll,
        // convert silent option to loglevel silent
        loglevel: options.silent ? 'silent' : options.loglevel,
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

    let pkgData;
    let pkgFile;
    let stdinTimer;

    print(options, 'Running in local mode...', 'verbose');
    print(options, 'Finding package file data...', 'verbose');

    const pkgFileName = getPackageFileName(options);

    /*

     // if pkgFile was set, make sure it exists and read it into pkgData
     if (pkgFile) {
     // print a message if we are using a descendant package file
     var relPathToPackage = path.resolve(pkgFile);
     if (relPathToPackage !== pkgFileName) {
     print(options, 'Using ' + relPathToPackage);
     }
     if (!fs.existsSync(pkgFile)) {
     programError(options, chalk.red(relPathToPackage + ' not found'));
     }

     pkgData = readPackageFile(pkgFile, null, false);
     }

     // no package data!
     if (!pkgData) {
     }

     return pkgData.then(_.partial(analyzeProjectDependencies, options, _, pkgFile));

     */

    function getPackageDataFromFile(pkgFile, pkgFileName) {
        // exit if no pkgFile to read from fs
        if (pkgFile !== null) {
            // print a message if we are using a descendant package file
            const relPathToPackage = path.resolve(pkgFile);
            if (relPathToPackage !== pkgFileName) {
                print(options, `Using ${relPathToPackage}`);
            }
        } else {
            programError(options, `${chalk.red('No ' + pkgFileName)}\n\nPlease add a ${pkgFileName} to the current directory, specify the ${chalk.blue('--packageFile')} or ${chalk.blue('--packageData')} options, or pipe a ${pkgFileName} to stdin.`);
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

            const isEmptyStdin = _pkgData.length === 0 || (_pkgData.length === 1 && _pkgData.charCodeAt(0) === 10);
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
    let options = opts || {};

    // if not executed on the command-line (i.e. executed as a node module), set some defaults
    if (!options.cli) {
        options = _.defaults({}, options, {
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

    print(options, 'Initializing...', 'verbose');

    return vm.initialize({
        global: options.global,
        packageManager: options.packageManager,
        registry: options.registry
    })
    .then(() => {

        options = initOptions(options);

        if (options.timeout) {
            const timeoutMs = _.isString(options.timeout) ? parseInt(options.timeout, 10) : options.timeout;
            var timeout = setTimeout(() => {
                programError(options, chalk.red(`Exceeded global timeout of ${timeoutMs}ms`));
            }, timeoutMs);
        }

        let pendingAnalysis = options.global ?
            analyzeGlobalPackages(options) :
            findPackage(options).spread(_.partial(analyzeProjectDependencies, options));

        if (timeout) {
            pendingAnalysis = pendingAnalysis.then(() => {
                clearTimeout(timeout);
            });
        }

        return pendingAnalysis;
    });
}

export default Object.assign({
    run
}, vm);
