const cint = require('cint');
const Promise = require('bluebird');
const npmi = Promise.promisify(require('npmi'));
const pkg = require('../../package.json');
let bower; // installed on-demand using npmi

module.exports = {

    /**
     * @param args.global
     * @param args.registry
     * @param args.loglevel
     */
    init(args) {

        args = args || {};

        let installed; // I promise bower is installed

        // see if the bower dependency has been installed
        try {
            require.resolve('bower'); // throws an error if not installed
            installed = Promise.resolve();
        } catch (e) {
            if (args.loglevel !== 'silent') {
                console.log('Installing bower dependency... (this is a one-time operation)');
            }

            // install bower on-demand
            installed = npmi({
                name: 'bower',
                version: pkg.dynamicDependencies.bower,
                path: `${__dirname}/../../`
            });
        }

        return installed.then(function () {
            bower = require('bower');
        });
    },

    list() {
        return new Promise(function (resolve, reject) {
            bower.commands.list()
                .on('end', function (results) {
                    resolve(cint.mapObject(results.dependencies, function (key, value) {
                        return cint.keyValue(key, value.pkgMeta.version);
                    }));
                })
                .on('error', reject);
        });
    },

    latest(packageName) {

        return new Promise(function (resolve, reject) {
            bower.commands.info(packageName)
                .on('end', function (results) {
                    resolve(results.latest.version);
                })
                .on('error', function (err) {
                    // normalize 404
                    reject(/Package \S* not found/.test(err.message) ? '404 Not Found' : err);
                });
        });
    },

    greatest(packageName) {

        return new Promise(function (resolve, reject) {
            bower.commands.info(packageName)
                .on('end', function (results) {
                    resolve(results.versions[0]); // bower versions returned in highest-to-lowest order.
                })
                .on('error', reject);
        });
    },

    newest() {
        throw new Error('Semantic versioning level "newest" is not supported for Bower');
    },

    greatestMajor() {
        throw new Error('Semantic versioning level "major" is not supported for Bower');
    },

    greatestMinor() {
        throw new Error('Semantic versioning level "minor" is not supported for Bower');
    }
};
