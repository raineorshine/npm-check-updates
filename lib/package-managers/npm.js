var _ = require('lodash');
var cint = require('cint');
var Promise = require('bluebird');
var npm = Promise.promisifyAll(require('npm'));
var rawPromisify = require('../raw-promisify.js');

var initialized = false;

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
        .catch(function (err) {
            // normalize 404 errors
            throw err.statusCode === 404 ? new Error(404) : err;
        })
        .then(function (response) {

            // rare case where npm view returns an empty response
            // https://github.com/tjunnone/npm-check-updates/issues/162
            if (_.isEmpty(response)) {
                throw new Error(404);
            }

            return _.values(response)[0][field];
        });
}

module.exports = {

    /**
     * @param args.global
     * @param args.registry
     * @param args.prefix
     */
    init: function (args) {

        args = args || {};

        // configure registry
        if (args.registry) {
            npm.config.set('registry', args.registry);
        }

        // use merge to eliminate undefined values
        return npm.loadAsync(_.merge({}, {
            silent: true,
            global: args.global || undefined,
            prefix: args.prefix || undefined
        }))
        .then(function () {
            rawPromisify(npm.commands);

            // FIX: for ncu -g doesn't work on homebrew or windows #146
            // https://github.com/tjunnone/npm-check-updates/issues/146
            if (args.global && npm.config.get('prefix').match('Cellar')) {
                npm.config.set('prefix', '/usr/local');
            }
            return initialized = true;
        });
    },

    list: function (args) {

        if (!initialized) {
            throw new Error('init must be called before using the version manager');
        }

        return npm.commands.listAsync(args || [], true); // silent:true
    },

    latest: cint.partialAt(view, 1, 'dist-tags.latest'),
    greatest: function (packageName) {
        return view(packageName, 'versions').then(_.last); // npm versions returned in lowest-to-highest order.
    }
};
