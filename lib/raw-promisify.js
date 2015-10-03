var _ = require('lodash');
var Promise = require('bluebird');

/**
 * For some reason, Promise.promisifyAll does not work on npm.commands :(
 *   Promise.promisifyAll(npm.commands);
 * So we have to do it manually.
 */
function rawPromisify(obj) {
    _.each(obj, function (method, name) {
        obj[name + 'Async'] = function () {
            var args = [].slice.call(arguments);
            var that = this;
            return new Promise(function (resolve, reject) {
                args.push(function (err, results) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
                return method.apply(that, args);
            });
        };
    });
}

module.exports = rawPromisify;
