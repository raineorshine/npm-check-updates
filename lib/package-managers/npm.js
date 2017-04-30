const _ = require('lodash');
const cint = require('cint');
const Promise = require('bluebird');
const npm = Promise.promisifyAll(require('npm'));
const rawPromisify = require('../raw-promisify.js');
const versionUtil  = require('../version-util.js');
const spawn        = require('spawn-please');

let initialized = false;

/**
 * @param packageName   Name of the package
 * @param field         Field such as "versions" or "dist-tags.latest" accepted by npm.commands.view (https://docs.npmjs.com/api/view)
 * @Returns             Promised result
 */
function view(packageName, field) {
    if (!initialized) {
        throw new Error('init must be called before using the version manager');
    }

    return npm.commands.viewAsync([packageName, field], true)
        .catch(err => {
            // normalize 404 errors
            throw err.statusCode === 404 ? new Error(404) : err;
        })
        .then(response => {

            // rare case where npm view returns an empty response
            // https://github.com/tjunnone/npm-check-updates/issues/162
            if (_.isEmpty(response)) {
                throw new Error(404);
            }

            return _.values(response)[0][field];
        });
}

export default {

    /**
     * @param args.global
     * @param args.registry
     * @param args.prefix
     */
    init(args={}) {
        // use pickBy to eliminate undefined values
        return npm.loadAsync(_.pickBy({
            silent: true,
            global: args.global || undefined,
            prefix: args.prefix || undefined
        }, _.identity))
        .then(() => {

            // configure registry
            if (args.registry) {
                npm.config.set('registry', args.registry);
            }

            rawPromisify(npm.commands);

            // FIX: for ncu -g doesn't work on homebrew or windows #146
            // https://github.com/tjunnone/npm-check-updates/issues/146
            if (args.global && npm.config.get('prefix').match('Cellar')) {
                npm.config.set('prefix', '/usr/local');
            }

            // Workaround: set prefix on windows for global packages
            // Only needed when using npm api directly
            if (process.platform === 'win32' && npm.config.get('global') && !process.env.prefix) {
                npm.config.set('prefix', `${process.env.AppData}\\npm`);
            }

            return initialized = true;
        });
    },

    /**
     * @args    Arguments for npm ls
     * @options.cwd (optional)
    */
    list(args, options={}) {
        if (!initialized) {
            throw new Error('init must be called before using the version manager');
        }

        // if packageFile is specified, spawn an npm process so that installed modules can be read from the same directotry as the package file (#201)
        return options.cwd ?
            spawn(process.platform === 'win32'? 'npm.cmd' : 'npm', ['ls', '--json', '-depth=0'], {cwd: options.cwd})
                .then(JSON.parse)
                // transform results into a similar format as the API
                .then(results => ({
                dependencies: cint.mapObject(results.dependencies, (name, info) => cint.keyValue(name, {
                    name,
                    version: info.version
                }))
            })) :
            npm.commands.listAsync(args || [], true); // silent:true
    },

    latest: cint.partialAt(view, 1, 'dist-tags.latest'),

    newest(packageName) {
        return view(packageName, 'time')
            .then(_.keys)
            .then(_.last);
    },

    greatest(packageName) {
        return view(packageName, 'versions').then(_.last);
    },

    greatestMajor(packageName, currentVersion) {
        return view(packageName, 'versions').then(versions => versionUtil.findGreatestByLevel(versions, currentVersion, 'major'));
    },
    greatestMinor(packageName, currentVersion) {
        return view(packageName, 'versions').then(versions => versionUtil.findGreatestByLevel(versions, currentVersion, 'minor'));
    }
};
