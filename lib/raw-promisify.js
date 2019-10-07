'use strict';

/**
 * For some reason, Promise.promisifyAll does not work on npm.commands :(
 *   Promise.promisifyAll(npm.commands);
 * So we have to do it manually.
 * @param {Object} obj
 * @returns {void}
 */
function rawPromisify(obj) {
    Object.entries(obj).forEach(([name, method]) => {
        obj[`${name}Async`] = (...args) => {
            return new Promise((resolve, reject) => {
                args.push((err, results) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
                return method.apply(this, args);
            });
        };
    });
}

module.exports = rawPromisify;
