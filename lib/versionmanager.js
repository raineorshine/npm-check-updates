var npm = require('npm');
var readJson = require('read-package-json');
var async = require('async');
var semver = require('semver');

var npmIsInitialized = false;

/**
 * Upgrade an existing dependency declaration to satisfy the latest version
 * @param declaration Current version declaration (e.g. "1.2.x")
 * @param latestVersion Latest version (e.g "1.3.2")
 * @returns {string} The upgraded dependency declaration (e.g. "1.3.x")
 */
function upgradeDependencyDeclaration(declaration, latestVersion) {
    var newDeclaration = "";
    var versionBumped = false;

    // Maintain constraints
    newDeclaration += getVersionConstraints(declaration);
    declaration = declaration.substr(newDeclaration.length, declaration.length);

    var currentComponents = declaration.split('.');
    var latestComponents = latestVersion.split('.');
    var proposedComponents = [];

    for (var i in currentComponents) {
        var currentDigit = currentComponents[i];
        var newDigit = latestComponents[i];

        if (isWildDigit(currentDigit)) { // Maintain existing policy
            proposedComponents.push(currentDigit);
            continue;
        }

        var comparison = versionDigitComparison(currentDigit, newDigit);
        if (comparison < 0) { // Bump digit to match latest version
            proposedComponents.push(newDigit);
            versionBumped = true;
        } else if (comparison > 0 && !versionBumped) {
            // Unusual, but the version dependend on is larger than the currently latest version
            proposedComponents.push(newDigit);
        } else {
            if (versionBumped) { // A bump causes subsequent non-wild version digits to revert to the latest version's
                proposedComponents.push(newDigit);
            } else { // Maintain existing declaration digit, as greater than or equal to new version
                proposedComponents.push(currentDigit);
            }
        }
    }

    newDeclaration += proposedComponents.join('.');
    return newDeclaration;
}

/**
 * Upgrade a dependencies collection based on latest available versions
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @returns {{}} upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies, latestVersions) {
    var upgradedDependencies = {};
    for (var dependency in currentDependencies) {
        if (currentDependencies.hasOwnProperty(dependency)) {
            var latestVersion = latestVersions[dependency];
            var currentVersion = currentDependencies[dependency];

            // Unconstrain the dependency, to allow upgrades of the form: '>1.2.x' -> '>2.0.x'
            var unconstrainedCurrentVersion = currentVersion.substr(getVersionConstraints(currentVersion).length, currentVersion.length);
            var isLatestVersion = semver.satisfies(latestVersion, unconstrainedCurrentVersion);

            if (!isLatestVersion) {
                var upgradedDependencyString = upgradeDependencyDeclaration(currentVersion, latestVersion);
                upgradedDependencies[dependency] = upgradedDependencyString;
            }
        }
    }

    return upgradedDependencies;
}

/**
 * Compare two version digits (e.g. the x from x.y.z)
 * @param d1 First component
 * @param d2 Second component
 * @returns {number} 1 if d1 is greater, 0 if equal (or either is a wildcard), -1 if lesser
 */
function versionDigitComparison(d1, d2) {
    if (parseInt(d1, 10) > parseInt(d2, 10)) {
        return 1;
    } else if (d1 === d2 || isWildDigit(d1) || isWildDigit(d2)) {
        return 0;
    } else {
        return -1;
    }
}

// Convenience function to match a "wild" version digit
function isWildDigit(d) {
    return (d === 'x' ||
        d === '*');
}

function getVersionConstraints(declaration) {
    var constraints = "";

    for (var i in declaration) {
        if (isNaN(declaration[i])) {
            constraints += declaration[i];
        } else {
            break;
        }
    }

    return constraints;
}

/**
 * Upgrade the dependency declarations in the package data
 * @param data The package.json data, as utf8 text
 * @param oldDependencies Object of old dependencies {package: version}
 * @param newDependencies Object of old dependencies {package: version}
 * @returns {string} The updated package data, as utf8 text
 */
function updatePackageData(data, oldDependencies, newDependencies) {
    for (var dependency in newDependencies) {
        var expression = '".*' + dependency + '.*:.*"' + escapeRegexp(oldDependencies[dependency] + '"');
        var regExp = new RegExp(expression, "g");
        data = data.replace(regExp, '"' + dependency + '": ' + '"' + newDependencies[dependency] + '"');
    }

    return data;
}

/**
 * Get the current dependencies from the package file
 * @param packageFile path to package.json
 * @param callback Called with (error, {dependencyName: version} collection)
 */
function getCurrentDependencies(packageFile, callback) {
    readJson(packageFile, null, false, function (error, json) {

        var allDependencies = json ? mergeObjects(json.dependencies, json.devDependencies) : null;
        callback(error, allDependencies);
    });
}

function getInstalledPackages(callback) {
    npm.commands.list([], true, function (error, results) {
        if (error) {
            return callback(error);
        }

        var packageList = results.dependencies;
        if (!packageList) {
            return callback(new Error("Unable to retrieve NPM package list"));
        }

        var globalPackages = {};
        for (var package in packageList) {
            globalPackages[packageList[package].name] = packageList[package].version;
        }

        callback(error, globalPackages);
    });
}

/**
 * Query the latest version info of a package
 * @param packageName The name of the package to query
 * @param callback Returns a {package: version} object
 */
function getLatestPackageVersion(packageName, callback) {
    if (!npmIsInitialized) {
        throw new Error("initialize must be called before using the version manager");
    }

    npm.commands.view([packageName, "dist-tags.latest"], true, function (error, response) {
        if (error) {
            return callback(error);
        }

        var versionInfo = {};
        versionInfo[packageName] = Object.keys(response)[0];
        callback(error, versionInfo);
    });
}

/**
 * Get the latest versions from the NPM repository
 * @param packageList A list of package names to query
 * @param callback Called with (error, {packageName: version} collection)
 */
function getLatestVersions(packageList, callback) {
    async.map(packageList, getLatestPackageVersion, function (error, latestVersions) {
        if (error) {
            return callback(error);
        }

        // Merge the array of versions into one object, for easier lookups
        var latestDependencies = arrayToObject(latestVersions);
        callback(error, latestDependencies);
    });
}

/**
 * Initialize the version manager
 * @param callback Called when done
 */
function initialize(global, callback) {
    npm.load({silent: true, global: global}, function () {
        npmIsInitialized = true;
        callback();
    });
}

//
// Helper functions
//

function escapeRegexp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Thanks Stack Overflow!
}

function arrayToObject(a) {
    var o = {};
    for (var i in a) {
        if (a.hasOwnProperty(i)) {
            for (var key in a[i]) {
                if (a[i].hasOwnProperty(key)) {
                    o[key] = a[i][key];
                }
            }
        }
    }
    return o;
}

function startsWith(string, prefix) {
    return(string.indexOf(prefix) === 0);
}

function mergeObjects(o1, o2) {
    var newObject = {};

    for (var property in o1) {
        if (o1.hasOwnProperty(property))
            newObject[property] = o1[property];
    }
    for (var property in o2) {
        if (o2.hasOwnProperty(property))
            newObject[property] = o2[property];
    }

    return newObject;
}

//
// API
//

exports.initialize = initialize;
exports.getCurrentDependencies = getCurrentDependencies;
exports.getLatestVersions = getLatestVersions;
exports.upgradeDependencies = upgradeDependencies;
exports.updatePackageData = updatePackageData;
exports.getInstalledPackages = getInstalledPackages;
