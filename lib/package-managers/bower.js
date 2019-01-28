'use strict';
const cint = require('cint');
const Promise = require('bluebird');
const pkg = require('../../package.json');
const spawn = require('spawn-please');
const chalk = require('chalk');
const requireg = require('requireg');

/**
 * @param args.global
 * @param args.registry
 * @param args.loglevel
 */
const bower = args => {

    args = args || {};

    // see if the bower dependency has been installed
    try {
        requireg.resolve('bower'); // throws an error if not installed
        return requireg('bower')
    } catch (e) {
        if (args.loglevel !== 'silent') {
            console.error(`Bower not installed. Please install bower using: ${chalk.cyan('npm install -g bower')}`);
        }
        process.exit(1);
    }
}

module.exports = {

    list() {
        return new Promise((resolve, reject) => {
            bower().commands.list()
                .on('end', results => {
                    resolve(cint.mapObject(results.dependencies, (key, value) => {
                        return cint.keyValue(key, value.pkgMeta.version);
                    }));
                })
                .on('error', reject);
        });
    },

    latest(packageName) {

        return new Promise((resolve, reject) => {
            bower().commands.info(packageName)
                .on('end', results => {
                    resolve(results.latest.version);
                })
                .on('error', err => {
                    // normalize 404
                    reject(/Package \S* not found/.test(err.message) ? '404 Not Found' : err);
                });
        });
    },

    greatest(packageName) {

        return new Promise((resolve, reject) => {
            bower().commands.info(packageName)
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
