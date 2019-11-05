'use strict';
const _ = require('lodash');
const cint = require('cint');
const semver = require('semver');
const versionUtil = require('../version-util.js');
const spawn = require('spawn-please');
const packageJson = require('package-json');

const TIME_FIELDS = ['modified', 'created'];

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
 * Returns the value of one of the properties retrieved by npm view.
 * @param {string} packageName   Name of the package
 * @param {string} field         Field such as "versions" or "dist-tags.latest" are parsed from the pacote result (https://www.npmjs.com/package/pacote#packument)
 * @param {string} currentVersion
 * @returns {Promise}            Promised result
 */
function viewOne(packageName, field, currentVersion) {
    return viewMany(packageName, [field], currentVersion)
        .then(result => result && result[field]);
}

/**
 * Returns an object of specified values retrieved by npm view.
 * @param {string} packageName   Name of the package
 * @param {string[]} fields      Array of fields like versions, time, version
 * @param {string} currentVersion
 * @returns {Promise}            Promised result
 */
function viewMany(packageName, fields, currentVersion) {
    if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
        return Promise.resolve();
    }

    return packageJson(packageName, {
        allVersions: true,
        fullMetadata: _.includes(fields, 'time'),
    }).then(result => fields.reduce((accum, field) => Object.assign(
        accum,
        {
            [field]: field.startsWith('dist-tags.') ?
                result.versions[_.get(result, field)] :
                result[field]
        }
    ), {})).catch((e) => {
        if (e instanceof packageJson.PackageNotFoundError) {
            return {};
        }
        throw e;
    });
}

/**
 * @param {Array} versions  Array of all available versions
 * @param {Boolean} pre     Enabled prerelease?
 * @returns {Array}         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions, pre) {
    return _.filter(versions, version => pre || !isPre(version));
}

/**
 * @param {String} version
 * @returns {boolean} True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
function isPre(version) {
    return versionUtil.getPrecision(version) === 'release';
}

/**
 * @param {{}}     versions    Object with all versions
 * @param {String} enginesNode Package engines.node range
 * @returns {Array} An array of versions which satisfies engines.node range
 */
function doesSatisfyEnginesNode(versions, enginesNode) {
    if (!enginesNode) {
        return _.keys(versions);
    }
    const minVersion = _.get(semver.minVersion(enginesNode), 'version');
    if (!minVersion) {
        return _.keys(versions);
    }
    return _.keys(versions).filter(version => {
        let versionEnginesNode = _.get(versions[version], 'engines.node');
        return versionEnginesNode && semver.satisfies(minVersion, versionEnginesNode);
    });
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
     * @param {{}} options
     * @returns {Promise}
     */
    latest(packageName, currentVersion, options) {
        return viewOne(packageName, 'dist-tags.latest', currentVersion)
            .then(latest => {
                // if latest exists and latest is not a prerelease version, return it
                // if latest exists and latest is a prerelease version and --pre is specified, return it
                // if latest exists and latest not satisfies min version of engines.node
                if (latest && (!isPre(latest.version) || options.pre) && doesSatisfyEnginesNode({[latest.version]: latest}, options.enginesNode).length) {
                    return latest.version;
                // if latest is a prerelease version and --pre is not specified, find the next
                // version that is not a prerelease
                } else {
                    return viewOne(packageName, 'versions', currentVersion)
                        .then(versions => {
                            versions = doesSatisfyEnginesNode(versions, options.enginesNode);
                            return _.last(filterOutPrereleaseVersions(versions, options.pre));
                        });
                }
            });
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {{}} options
     * @returns {Promise}
     */
    newest(packageName, currentVersion, options) {
        return viewMany(packageName, ['time', 'versions'], currentVersion)
            .then(result => {
                const versions = doesSatisfyEnginesNode(result.versions, options.enginesNode);
                return Object.keys(result.time).reduce((accum, key) =>
                    accum.concat(_.includes(TIME_FIELDS, key) || _.includes(versions, key) ? key : []), []
                );
            })
            .then(_.partialRight(_.pullAll, TIME_FIELDS))
            .then(versions =>
                _.last(filterOutPrereleaseVersions(versions, options.pre))
            );
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {{}} options
     * @returns {Promise}
     */
    greatest(packageName, currentVersion, options) {
        return viewOne(packageName, 'versions', currentVersion)
            .then(versions =>
                _.last(filterOutPrereleaseVersions(
                    doesSatisfyEnginesNode(versions, options.enginesNode),
                    options.pre
                ))
            );
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {{}} options
     * @returns {Promise}
     */
    greatestMajor(packageName, currentVersion, options) {
        return viewOne(packageName, 'versions', currentVersion)
            .then(versions =>
                versionUtil.findGreatestByLevel(
                    filterOutPrereleaseVersions(
                        doesSatisfyEnginesNode(versions, options.enginesNode),
                        options.pre
                    ),
                    currentVersion,
                    'major'
                )
            );
    },

    /**
     * @param {string} packageName
     * @param {string} currentVersion
     * @param {{}} options
     * @returns {Promise}
     */
    greatestMinor(packageName, currentVersion, options) {
        return viewOne(packageName, 'versions', currentVersion)
            .then(versions =>
                versionUtil.findGreatestByLevel(
                    filterOutPrereleaseVersions(
                        doesSatisfyEnginesNode(versions, options.enginesNode),
                        options.pre
                    ),
                    currentVersion,
                    'minor'
                )
            );
    },

    defaultPrefix
};
