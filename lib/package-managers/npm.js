var _ = require('lodash');
var cint = require('cint');
var Promise = require('bluebird');
var versionUtil  = require('../version-util.js');
var spawn        = require('spawn-please');

/** Parse JSON and throw an informative error on failure.
 * @param data { command, packageName }
*/
function parseJson(result, data) {
    var json;
    // use a try-catch instead of .catch to avoid re-catching upstream errors
    try {
        json = JSON.parse(result);
    } catch (err) {
        throw new Error('Expected JSON from "' + data.command + '". This could be due to npm instability' + (data.packageName ? ' or problems with the ' + data.packageName + ' package' : '') + '.\n\n' + result);
    }
    return json;
}

/**
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" accepted by npm view (https://docs.npmjs.com/api/view)
 * @Returns             Promised result
 */
function view(packageName, field, options) {
    var args = ['view', packageName, field];
    return spawnNpm(args, options)
        .then(result => {
            return parseJson(result, {
                command: 'npm ' + args.join(' '),
                packageName: packageName
            });
        });
}

/**
 * @param versions  Array of all available versions
 * @Returns         An array of versions with the release versions filtered out
 */
function filterOutPrereleaseVersions(versions) {
    return _.filter(versions, version => {
        return versionUtil.getPrecision(version) !== 'release';
    });
}


/** Spawn npm requires a different command on Windows. */
function spawnNpm(args, npmOptions, spawnOptions) {
    npmOptions = npmOptions || {};
    spawnOptions = spawnOptions || {};
    var cmd = process.platform === 'win32'? 'npm.cmd' : 'npm';

    // get the npm prefix (async)
    return Promise.resolve(npmOptions.prefix || defaultPrefix(npmOptions)).then(prefix => {
        var fullArgs = [].concat(
            args,
            npmOptions.global ? '--global' : [],
            prefix ? '--prefix=' + prefix : [],
            '--depth=0',
            '--json'
        );
        return spawn(cmd, fullArgs, spawnOptions);
    });
}

/** Get platform-specific default prefix to pass on to npm.
 * @param options.global
 * @param options.prefix
*/
function defaultPrefix(options) {
    return spawn('npm', ['config', 'get', 'prefix']).then(prefix => {
        // FIX: for ncu -g doesn't work on homebrew or windows #146
        // https://github.com/tjunnone/npm-check-updates/issues/146
        return options.prefix || (options.global && prefix.match('Cellar') ? '/usr/local' :

            // Workaround: get prefix on windows for global packages
            // Only needed when using npm api directly
            process.platform === 'win32' && options.global && !process.env.prefix ?
                process.env.AppData + '\\npm' :
                null);
    });
}

module.exports = {

    /**
     * @options.cwd (optional)
     * @options.global (optional)
     * @options.prefix (optional)
    */
    list: function (options) {

        options = options || {};

        return spawnNpm('ls', options, options.cwd ? {cwd: options.cwd, rejectOnError: false} : {rejectOnError: false})
            .then(result => {
                var json = parseJson(result, {
                    command: 'npm ls'
                });
                return cint.mapObject(json.dependencies, (name, info) => {
                    return cint.keyValue(name, info.version);
                });
            });
    },

    latest: function (packageName, currentVersion, pre) {
        return view(packageName, 'dist-tags.latest')
            .then(version => {
                if (versionUtil.getPrecision(version) !== 'release' || pre) {
                    return version;
                } else {
                    return view(packageName, 'versions')
                        .then(filterOutPrereleaseVersions)
                        .then(_.last);
                }
            });
    },

    newest: function (packageName, currentVersion, pre) {
        return view(packageName, 'time')
            .then(_.keys)
            .then(_.partialRight(_.pullAll, ['modified', 'created']))
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    greatest: function (packageName, currentVersion, pre) {
        return view(packageName, 'versions')
            .then(versions => {
                return _.last(pre ? versions : filterOutPrereleaseVersions(versions));
            });
    },

    greatestMajor: function (packageName, currentVersion, pre) {
        return view(packageName, 'versions').then(versions => {
            var resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'major');
        });
    },

    greatestMinor: function (packageName, currentVersion, pre) {
        return view(packageName, 'versions').then(versions => {
            var resultVersions = pre ? versions : filterOutPrereleaseVersions(versions);
            return versionUtil.findGreatestByLevel(resultVersions, currentVersion, 'minor');
        });
    }
};
