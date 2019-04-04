'use strict';
const _ = require('lodash');
const cint = require('cint');
const semver = require('semver');
const Promise = require('bluebird');
const versionUtil  = require('../version-util.js');
const spawn        = require('spawn-please');
const packageJson  = require('package-json');
const npmConf      = require('npm-conf')();
const {Agent: HttpAgent} = require('http');
const {Agent: HttpsAgent} = require('https');

const httpAgentOptions = {
    keepAlive: true,
    maxSockets: npmConf.get('maxsockets')
};
const httpsAgentOptions = Object.assign({
    ca: npmConf.get('ca'),
    key: npmConf.get('key'),
    cert: npmConf.get('cert'),
    rejectUnauthorized: npmConf.get('strict-ssl')
}, httpAgentOptions);
const httpAgent = new HttpAgent(httpAgentOptions);
const httpsAgent = new HttpsAgent(httpsAgentOptions);

const {getProxyAgent} = require('./npm-proxy');

/** Parse JSON and throw an informative error on failure.
 * @param result Data to be parsed
 * @param data { command, packageName }
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
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" are parsed from the package-json result (https://github.com/sindresorhus/package-json)
 * @Returns             Promised result
 */
function view(packageName, field, currentVersion) {
    if (currentVersion && (!semver.validRange(currentVersion) || versionUtil.isWildCard(currentVersion))) {
        return Promise.resolve();
    }
    const options = {allVersions: true};

    const scope = packageName.includes('/') && packageName.split('/')[0];
    const proxyAgent = getProxyAgent(scope);
    if (proxyAgent) {
        options.agent = proxyAgent;
    } else {
        options.agent = {
            http: httpAgent,
            https: httpsAgent
        };
    }

    if (field === 'time') {
        options.fullMetadata = true;
    }

    return packageJson(packageName, options).then(result => {
        if (field.startsWith('dist-tags.')) {
            const split = field.split('.');
            if (result[split[0]]) {
                return result[split[0]][split[1]];
            }
        } else if (field === 'versions') {
            return Object.keys(result[field]);
        } else {
            return result[field];
        }
    });
}

/**
 * @param versions  Array of all available versions
 * @Returns         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions) {
    return _.filter(versions, _.negate(isPre));
}

/**
 * @param            version
 * @Returns          True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
function isPre(version) {
    return versionUtil.getPrecision(version) === 'release';
}


/** Spawn npm requires a different command on Windows. */
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
 * @param options.global
 * @param options.prefix
*/
function defaultPrefix(options) {
    const cmd = process.platform === 'win32'? 'npm.cmd' : 'npm';

    return spawn(cmd, ['config', 'get', 'prefix']).then(prefix => {
        // FIX: for ncu -g doesn't work on homebrew or windows #146
        // https://github.com/tjunnone/npm-check-updates/issues/146
        return options.prefix || (options.global && prefix.match('Cellar') ? '/usr/local' :

            // Workaround: get prefix on windows for global packages
            // Only needed when using npm api directly
            process.platform === 'win32' && options.global && !process.env.prefix ?
                `${process.env.AppData}\\npm` :
                null);
    });
}

module.exports = {

    /**
     * @options.cwd (optional)
     * @options.global (optional)
     * @options.prefix (optional)
    */
    list(options={}) {

        return spawnNpm('ls', options, options.cwd ? {cwd: options.cwd, rejectOnError: false} : {rejectOnError: false})
            .then(result => {
                const json = parseJson(result, {
                    command: 'npm ls'
                });
                return cint.mapObject(json.dependencies, (name, info) =>
                    cint.keyValue(name, info.version)
                );
            });
    },

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

    newest(packageName, currentVersion, pre) {
        return view(packageName, 'time', currentVersion)
            .then(_.keys)
            .then(_.partialRight(_.pullAll, ['modified', 'created']))
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    greatest(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion)
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    greatestMajor(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion).then(versions => {
            const resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'major');
        });
    },

    greatestMinor(packageName, currentVersion, pre) {
        return view(packageName, 'versions', currentVersion).then(versions => {
            const resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'minor');
        });
    },

    defaultPrefix
};
