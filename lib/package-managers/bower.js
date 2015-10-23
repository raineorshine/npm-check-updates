var bower = require('bower');
var cint = require('cint');
var Promise = require('bluebird');

module.exports = {

    init: function () {
        return Promise.resolve(true);
    },

    list: function () {
        return new Promise(function (resolve, reject) {
            bower.commands.list()
                .on('end', function (results) {
                    // massage results (move pkgMeta up a level) to match expected interface (see ./README.md)
                    resolve({
                        dependencies: cint.mapObject(results.dependencies, function (key, value) {
                            return cint.keyValue(key, value.pkgMeta);
                        })
                    });
                })
                .on('error', reject);
        });
    },

    latest: function (packageName) {

        return new Promise(function (resolve, reject) {
            bower.commands.info(packageName)
                .on('end', function (results) {
                    resolve(results.latest.version);
                })
                .on('error', function (err) {
                    // normalize 404
                    reject(/Package \S* not found/.test(err.message) ? new Error(404) : err);
                });
        });
    },

    greatest: function (packageName) {

        return new Promise(function (resolve, reject) {
            bower.commands.info(packageName)
                .on('end', function (results) {
                    resolve(results.versions[0]); // bower versions returned in highest-to-lowest order.
                })
                .on('error', reject);
        });
    }

};
