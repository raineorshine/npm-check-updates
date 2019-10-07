'use strict';
const _ = require('lodash');
const cint = require('cint');
const semver = require('semver');
const versionUtil  = require('../version-util.js');
const spawn        = require('spawn-please');
const pacote = require('pacote');

// needed until pacote supports full npm config compatibility
// See: https://github.com/zkat/pacote/issues/156
const npmConfig = {};
require('libnpmconfig').read().forEach((value, key) => {
    // replace env ${VARS} in strings with the process.env value
    npmConfig[key] = typeof value !== 'string' ?
        value :
        value.replace(/\${([^}]+)}/, (_, envVar) =>
            process.env[envVar]
        );
});
npmConfig.cache = false;

/**
* @typedef {Object} CommandAndPackageName
* @property {string} command
* @property {string} packageName
*/

/**
 * Parse JSON and throw an informative error on failure.
 * @param result Data to be parsed
 * @param {CommandAndPackageName} data
 * @returns {Object}
*/
function parseJson(result, data) {
    let json;
    // use a try-catch instead of .catch to avoid re-catching upstream errors
    try {
        json = JSON.parse(result);
    } catch (err) {
        throw new Error(`Expected JSON from "${data.command}". This could be due to npm instability${data.packageName ? ` or problems with the ${data.packageName} package` : ''}.\n\n${result}`);
    }
    return json;
}

/**
 * @param {string} packageName   Name of the package
 * @param {string} field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.npmjs.com/package/pacote#packument)
 * @param {string} currentVersion
 * @returns {Promise}             Promised result
 */
function view(packageName, field, currentVersion) {
    if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
        return Promise.resolve();
    }

    npmConfig['full-metadata'] = field === 'time';

    return pacote.packument(packageName, npmConfig).then(result => {
        if (field.startsWith('dist-tags.')) {
            const [tagName, version] = field.split('.');
            if (result[tagName]) {
                return result[tagName][version];
            }
        } else if (field === 'versions') {
            return Object.keys(result[field]);
        } else {
            return result[field];
        }
    });
}

/**
 * @param {Array} versions  Array of all available versions
 * @returns {Array}         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions) {
    return _.filter(versions, _.negate(isPre));
}

/**
 * @param            version
 * @returns {boolean}          True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
function isPre(version) {
    return versionUtil.getPrecision(version) === 'release';
}


/**
 * Spawn npm requires a different command on Windows.
 * @param args
 * @param {Object} [npmOptions={}]
 * @param {Object} [spawnOptions={}]
 * @returns {Promise<string>}
 */
function spawnNpm(args, npmOptions={}, spawnOptions={}) {
    const cmd = process.platform === 'win32'? 'npm.cmd' : 'npm';

    const fullArgs = [].concat(
        args,
        npmOptions.global ? '--global' : [],
        npmOptions.prefix ? `--prefix=${npmOptions.prefix}` : [],
        '--depth=0',
        '--json'
    );
    return spawn(cmd, fullArgs, spawnOptions);
}

/** Get platform-specific default prefix to pass on to npm.
 * @param {Object} options
 * @param {boolean} [options.global]
 * @param [options.prefix]
 * @returns {Promise<string>}
*/
function defaultPrefix(options) {

    if (options.prefix) {
        return Promise.resolve(options.prefix);
    }

    const cmd = process.platform === 'win32'? 'npm.cmd' : 'npm';

    return spawn(cmd, ['config', 'get', 'prefix']).then(prefix => {
        // FIX: for ncu -g doesn't work on homebrew or windows #146
        // https://github.com/tjunnone/npm-check-updates/issues/146
        return options.global && prefix.match('Cellar') ? '/usr/local' :

            // Workaround: get prefix on windows for global packages
            // Only needed when using npm api directly
            process.platform === 'win32' && options.global && !process.env.prefix ?
                `${process.env.AppData}\\npm` :
                null;
    });
}

module.exports = {

    /**
     * @param [options]
     * @param [options.cwd]
     * @param [options.global]
     * @param [options.prefix]
     * @returns {Promise<Object>}
    */
    list(options={}) {

        return spawnNpm('ls', options, options.cwd ? {cwd: options.cwd, rejectOnError: false} : {rejectOnError: false})
            .then(result => {
                const json = parseJson(result, {
                    command: 'npm ls'
                });
                return cint.mapObject(json.dependencies, (name, info) =>
                    // unmet peer dependencies have a different structure
                    cint.keyValue(name, info.version || (info.required && info.required.version))
                );
            });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {boolean} pre
     * @returns {Promise}
     */
    latest(packageName, currentVersion, pre) {
        return view(packageName, 'dist-tags.latest', currentVersion)
            .then(version => {
                // if latest is not a prerelease version, return it
                // if latest is a prerelease version and --pre is specified, return it
                if (!isPre(version) || pre) {
                    return version;
                // if latest is a prerelease version and --pre is not specified, find the next
                // version that is not a prerelease
                } else {
                    return view(packageName, 'versions', currentVersion)
                        .then(filterOutPrereleaseVersions)
                        .then(_.last);
                }
            });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {boolean} pre
     * @returns {Promise}
     */
    newest(packageName, currentVersion, pre) {
        return view(packageName, 'time', currentVersion)
            .then(_.keys)
            .then(_.partialRight(_.pullAll, ['modified', 'created']))
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {boolean} pre
     * @returns {Promise}
     */
    greatest(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion)
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {boolean} pre
     * @returns {Promise}
     */
    greatestMajor(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion).then(versions => {
            const resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'major');
        });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {boolean} pre
     * @returns {Promise}
     */
    greatestMinor(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion).then(versions => {
            const resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'minor');
        });
    },

    defaultPrefix
};
