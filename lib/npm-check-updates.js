//
// Dependencies
//

'use strict';

const cint = require('cint');
const path = require('path');
const findUp = require('find-up');
const _ = require('lodash');
const getstdin = require('get-stdin');
const Table = require('cli-table');
const chalk = require('chalk');
const {promisify} = require('util');
const fs = require('fs');
const {rcFile} = require('rc-config-loader');
const vm = require('./versionmanager');
const packageManagers = require('./package-managers');
const versionUtil = require('./version-util');
const jph = require('json-parse-helpfulerror');

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
const stdinWarningMessage = `Hmmmmm... this is taking a long time. Your console is telling me to wait for input \non stdin, but maybe that is not what you want.\nTry ${chalk.cyan('winpty ncu.cmd')}, or specify a package file explicitly with ${chalk.cyan('--packageFile package.json')}. \nSee https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102`;

//
// Helper functions
//

function print(options, message, loglevel, method = 'log') {
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
            top: '',
            'top-mid': '',
            'top-left': '',
            'top-right': '',
            bottom: '',
            'bottom-mid': '',
            'bottom-left': '',
            'bottom-right': '',
            left: '',
            'left-mid': '',
            mid: '',
            'mid-mid': '',
            right: '',
            'right-mid': '',
            middle: ''
        }
    });
}

/**
 * @param {object} args
 * @param {object} args.from
 * @param {object} args.to
 * @returns {Table}
 */
function toDependencyTable(args) {
    const table = createDependencyTable();
    const rows = Object.keys(args.to).map(dep => {
        const from = args.from[dep] || '';
        const to = versionUtil.colorizeDiff(args.from[dep], args.to[dep] || '');
        return [dep, from, '→', to];
    });
    rows.forEach(row => table.push(row));
    return table;
}

const readPackageFile = cint.partialAt(promisify(fs.readFile), 1, 'utf8');
const writePackageFile = promisify(fs.writeFile);

//
// Main functions
//

function analyzeGlobalPackages(options) {

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
            print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose');

            return vm.upgradePackageDefinitions(globalPackages, options)
                .then(([upgraded, latest]) => {
                    print(options, latest, 'silly');

                    const upgradedPackageNames = Object.keys(upgraded);
                    printUpgrades(options, {
                        current: globalPackages,
                        upgraded,
                        latest,
                        // since an interactive upgrade of globals is not available, the numUpgraded is always all
                        numUpgraded: upgradedPackageNames.length,
                        total: upgradedPackageNames.length
                    });

                    let instruction = '[package]';
                    if (upgraded) {
                        instruction = upgradedPackageNames.map(pkg => pkg + '@' + upgraded[pkg]).join(' ');
                    }

                    if (options.json) {
                        // since global packages do not have a package.json, return the upgraded deps directly (no version range replacements)
                        printJson(options, upgraded);
                    } else if (instruction.length) {
                        print(options, '\n' + chalk.cyan('ncu') + ' itself cannot upgrade global packages. Run the following to upgrade all global packages: \n\n' + chalk.cyan('npm -g install ' + instruction) + '\n');
                    }
                });
        });
}

function analyzeProjectDependencies(options, pkgData, pkgFile) {

    let pkg;

    try {
        if (!pkgData) {
            throw new Error('pkgData: ' + pkgData);
        } else {
            pkg = jph.parse(pkgData);
        }
    } catch (e) {
        programError(options, chalk.red(`Invalid package file${pkgFile ? `: ${pkgFile}` : ' from stdin'}. Error details:\n${e.message}`));
    }

    const current = vm.getCurrentDependencies(pkg, options);

    print(options, `Fetching ${vm.getVersionTarget(options)} versions...`, 'verbose');

    if (options.enginesNode) {
        options.enginesNode = _.get(pkg, 'engines.node');
    }

    return vm.upgradePackageDefinitions(current, options).then(async ([upgraded, latest]) => {
        const {newPkgData, selectedNewDependencies} = await vm.upgradePackageData(pkgData, current, upgraded, latest, options);

        const output = options.jsonAll ? jph.parse(newPkgData) :
            options.jsonDeps ?
                _.pick(jph.parse(newPkgData), 'dependencies', 'devDependencies', 'optionalDependencies') :
                selectedNewDependencies;

        // split the deps into satisfied and unsatisfied to display in two separate tables
        const deps = Object.keys(selectedNewDependencies);
        const satisfied = cint.toObject(deps, dep =>
            cint.keyValue(dep, vm.isSatisfied(latest[dep], current[dep]))
        );

        const isSatisfied = _.propertyOf(satisfied);
        const filteredUpgraded = options.minimal ? cint.filterObject(selectedNewDependencies, cint.not(isSatisfied)) : selectedNewDependencies;
        const numUpgraded = Object.keys(filteredUpgraded).length;

        // print
        if (options.json) {
            // use the selectedNewDependencies dependencies data to generate new package data
            // INVARIANT: we don't need try-catch here because pkgData has already been parsed as valid JSON, and vm.upgradePackageData simply does a find-and-replace on that
            printJson(options, output);
        } else {
            printUpgrades(options, {
                current,
                upgraded: filteredUpgraded,
                latest,
                numUpgraded,
                total: Object.keys(upgraded).length
            });
        }

        if (numUpgraded > 0) {

            // if error-level is 2, immediately exit with error code
            if (options.errorLevel === 2) {
                programError(options, '\nDependencies not up-to-date');
            }

            // if there is a package file, write the new package data
            // otherwise, suggest ncu -u
            if (pkgFile) {
                if (options.upgrade) {
                    // short-circuit return in order to wait for write operation, but still return the same output
                    return writePackageFile(pkgFile, newPkgData)
                        .then(() => {
                            print(options, `\nRun ${chalk.cyan('npm install')} to install new versions.\n`);
                            return output;
                        });
                } else {
                    print(options, `\nRun ${chalk.cyan('ncu -u')} to upgrade ${getPackageFileName(options)}`);
                }
            }
        }

        return output;
    });
}

/**
 * @param {Object} options - Options from the configuration
 * @param {Object} args - The arguments passed to the function.
 * @param {Object} args.current - The current packages.
 * @param {Object} args.upgraded - The packages that should be upgraded.
 * @param {number} args.numUpgraded - The number of upgraded packages
 * @param {number} args.total - The total number of all possible upgrades
 * @returns {void}
 */
function printUpgrades(options, {current, upgraded, numUpgraded, total}) {
    print(options, '');

    // print everything is up-to-date
    const smiley = chalk.green.bold(':)');
    if (numUpgraded === 0 && total === 0) {
        if (Object.keys(current).length === 0) {
            print(options, 'No dependencies.');
        } else if (options.global) {
            print(options, `All global packages are up-to-date ${smiley}`);
        } else {
            print(options, `All dependencies match the ${vm.getVersionTarget(options)} package versions ${smiley}`);
        }
    } else if (numUpgraded === 0 && total > 0) {
        print(options, `All dependencies match the desired package versions ${smiley}`);
    }

    // print table
    if (numUpgraded > 0) {
        const table = toDependencyTable({
            from: current,
            to: upgraded
        });
        print(options, table.toString());
    }
}

//
// Program
//

/** Initializes and consolidates options from the cli. */
function initOptions(options) {

    const json = _(options)
        .keys()
        .filter(_.partial(_.startsWith, _, 'json', 0))
        .some(_.propertyOf(options));

    return Object.assign({}, options, {
        filter: options.args.join(' ') || options.filter,
        // convert silent option to loglevel silent
        loglevel: options.silent ? 'silent' : options.loglevel,
        minimal: options.minimal === undefined ? false : options.minimal,
        // default to 0, except when newest or greatest are set
        pre: options.pre != null ? Boolean(Number(options.pre)) : options.newest || options.greatest,
        // add shortcut for any keys that start with 'json'
        json,
        // imply upgrade in interactive mode when json is not specified as the output
        upgrade: options.interactive && options.upgrade === undefined ? !json : options.upgrade
    });
}

/**
* @typedef {Array} PkgInfo
* @property 0 pkgFile
* @property 1 pkgData
*/

/** Finds the package file and data.
    @returns Promise<PkgInfo>

Searches as follows:
 --packageData flag
 --packageFile flag
 --stdin
 --findUp
*/
async function findPackage(options) {

    let pkgData;
    let pkgFile;
    let stdinTimer;

    print(options, 'Running in local mode...', 'verbose');
    print(options, 'Finding package file data...', 'verbose');

    const pkgFileName = getPackageFileName(options);

    // returns: string
    function getPackageDataFromFile(pkgFile, pkgFileName) {
        // exit if no pkgFile to read from fs
        if (pkgFile != null) {
            // print a message if we are using a descendant package file
            const relPathToPackage = path.resolve(pkgFile);
            if (relPathToPackage !== pkgFileName) {
                print(options, `${options.upgrade ? 'Upgrading' : 'Checking'} ${relPathToPackage}`);
            }
        } else {
            programError(options, `${chalk.red(`No ${pkgFileName}`)}\n\nPlease add a ${pkgFileName} to the current directory, specify the ${chalk.cyan('--packageFile')} or ${chalk.cyan('--packageData')} options, or pipe a ${pkgFileName} to stdin.`);
        }

        return readPackageFile(pkgFile);
    }

    // get the package data from the various input possibilities
    if (options.packageData) {
        pkgFile = null;
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

        // get data from stdin
        // trim stdin to account for \r\n
        // clear the warning timer once stdin returns
        const stdinData = await getstdin();
        const data = stdinData.trim().length > 0 ? stdinData : null;
        clearTimeout(stdinTimer);

        // if no stdin content fall back to searching for package.json from pwd and up to root
        pkgFile = data || !pkgFileName ? null : findUp.sync(pkgFileName);
        pkgData = data || getPackageDataFromFile(await pkgFile, pkgFileName);
    } else {
        // find the closest package starting from the current working directory and going up to the root
        pkgFile = pkgFileName ? findUp.sync(pkgFileName) : null;
        pkgData = getPackageDataFromFile(pkgFile, pkgFileName);
    }

    return Promise.all([pkgData, pkgFile]);
}

// exit with non-zero error code when there is an unhandled promise rejection
process.on('unhandledRejection', err => {
    throw err;
});

/** main entry point */
async function run(options = {}) {
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

    print(options, 'Initializing...', 'verbose');

    if (options.packageManager === 'npm' && !options.prefix) {
        options.prefix = await packageManagers.npm.defaultPrefix(options); // eslint-disable-line require-atomic-updates
    }

    let timeout;
    let timeoutPromise = new Promise(r => r);
    if (options.timeout) {
        const timeoutMs = _.isString(options.timeout) ? parseInt(options.timeout, 10) : options.timeout;
        timeoutPromise = new Promise((resolve, reject) => {
            timeout = setTimeout(() => {
                // must catch the error and reject explicitly since we are in a setTimeout
                const error = `Exceeded global timeout of ${timeoutMs}ms`;
                reject(error);
                try {
                    programError(options, chalk.red(error));
                } catch (e) {/* noop */}
            }, timeoutMs);
        });
    }

    async function getAnalysis() {
        if (options.global) {
            const analysis = await analyzeGlobalPackages(options);
            clearTimeout(timeout);
            return analysis;
        } else {
            const [pkgData, pkgFile] = await findPackage(options);
            const analysis = await analyzeProjectDependencies(options, pkgData, pkgFile);
            clearTimeout(timeout);
            return analysis;
        }
    }

    return await Promise.race([timeoutPromise, getAnalysis()]);
}

/**
 * @param {PlainObject} [cfg]
 * @param {string} [cfg.configFileName=".ncurc"]
 * @param {string} [cfg.configFilePath]
 * @param {string} [cfg.packageFile]
 * @returns {PlainObject|undefined}
 */
function getNcurc({configFileName, configFilePath, packageFile} = {}) {
    const file = rcFile('ncurc', {
        configFileName: configFileName || '.ncurc',
        defaultExtension: ['.json', '.yml', '.js'],
        cwd: configFilePath ||
            (packageFile ? path.dirname(packageFile) : undefined)
    });
    return file && file.config;
}

module.exports = Object.assign({
    run,
    getNcurc
}, vm);
