'use strict';
const cint = require('cint');
const chalk = require('chalk');
const requireg = require('requireg');

/**
 * @param args
 * @param args.global
 * @param args.registry
 * @param args.loglevel
 */

// see if the bower dependency has been installed
const bower = ({loglevel}) => {
    try {
        requireg.resolve('bower'); // throws an error if not installed
        return requireg('bower');
    } catch (e) {
        if (loglevel !== 'silent') {
            console.error(`Bower not installed. Please install bower using: ${chalk.cyan('npm install -g bower')}`);
        }
        process.exit(1);
    }
};

module.exports = {

    /**
     * @param {Object} [info]
     * @param {string} info.prefix
     * @param {string} info.loglevel
     * @returns {Promise<Object>}
     */
    list({prefix, loglevel} = {}) {

        return new Promise((resolve, reject) => {
            bower({loglevel}).commands.list(null, {cwd: prefix})
                .on('end', results => {
                    resolve(cint.mapObject(results.dependencies, (key, value) => {
                        return cint.keyValue(key, value.pkgMeta);
                    }));
                })
                .on('error', reject);
        });
    },

    /**
     * @param {string} packageName
     * @param _
     * @param {Object} [info]
     * @param {string} info.prefix
     * @param {string} info.loglevel
     * @returns {Promise}
     */
    latest(packageName, _, {prefix, loglevel} = {}) {

        return new Promise((resolve, reject) => {
            bower({loglevel}).commands.info(packageName, null, {cwd: prefix})
                .on('end', results => {
                    resolve(results.latest.version);
                })
                .on('error', err => {
                    // normalize 404
                    reject(/Package \S* not found|Repository not found/.test(err.message) ? '404 Not Found' : err);
                });
        });
    },

    /**
     * @param {string} packageName
     * @param _
     * @param {Object} [info]
     * @param {string} info.prefix
     * @param {string} info.loglevel
     * @returns {Promise}
     */
    greatest(packageName, _, {prefix, loglevel} = {}) {

        return new Promise((resolve, reject) => {
            bower({loglevel}).commands.info(packageName, null, {cwd: prefix})
                .on('end', results => {
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
