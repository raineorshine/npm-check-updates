var async = require('async');
var semver = require('semver');
var _ = require('lodash');
var cint = require('cint');
var semverutils = require('semver-utils');
var Promise = require('bluebird');
var readJson = Promise.promisify(require('read-package-json'));
var npm = Promise.promisifyAll(require('npm'));

/** 
 * For some reason, Promise.promisifyAll does not work on npm.commands :( 
 *   Promise.promisifyAll(npm.commands);
 * So we have to do it manually.
 */
function rawPromisify(obj) {
    for(var methodName in obj) {
        obj[methodName + 'Async'] = function() {
            var args = [].slice.call(arguments);
            var that = this;
            return new Promise(function(resolve, reject) {
                args.push(resolve, reject);
                obj[methodName].apply(that, args);
            })
        }
    }
}

rawPromisify(npm.commands);

var npmIsInitialized = false;

var VERSION_PARTS = ['major', 'minor', 'patch', 'release', 'build'];

var regex = {
    comparison: /[<>]=?/g
};

/**
 * Returns the number of components of the semver-utils object
 */
function semverNumComponents(semver) {
    return _.intersection(VERSION_PARTS, Object.keys(semver)).length;
}

/** Joins the major, minor, patch, release, and build the parts of a semver object into a dot-delimited string. */
function semverBuildVersionString(semver) {
    return versionValues = _(semver)
        .pick(semver, VERSION_PARTS)
        .values()
        .compact()
        .join('.');
}

/** Creates a new object with only the properties of the given that are not undefined. */
function pruned(obj) {
    return _.pick(obj, cint.not(_.isUndefined))
}

/** Returns 'v' if the string starts with a v, otherwise returns empty string. */
function v(str) {
    return str && (str[0] === 'v' || str[1] === 'v') ? 'v' : '';
}

/**
 * Upgrade an existing dependency declaration to satisfy the latest version
 * @param declaration Current version declaration (e.g. "1.2.x")
 * @param latestVersion Latest version (e.g "1.3.2")
 * @returns {string} The upgraded dependency declaration (e.g. "1.3.x")
 */
function upgradeDependencyDeclaration(declaration, latestVersion) {

    // return global wildcards immediately
    if(/^[*^~]$/.test(declaration)) {
        return declaration;
    }

    // parse the latestVersion
    // return original declaration if latestSemver is invalid
    var latestSemver = semverutils.parseRange(latestVersion)[0];
    if(!latestSemver) {
        return declaration;
    }

    // parse the declaration
    // if multiple ranges, use the semver with the least number of components
    var parsedRange = _(semverutils.parseRange(declaration))
        .reject({ operator: '||' }) // semver-utils includes empty entries for the || operator. We can remove them completely.
        .sortBy(semverNumComponents)
        .value();
    var declaredSemver = parsedRange[0];

    /** Chooses version parts between the declared version and the latest */
    function chooseVersion(part) {
        return isWildDigit(declaredSemver[part]) ? declaredSemver[part] :
            declaredSemver[part] ? latestSemver[part] :
            undefined;
    }

    // create a new semver object with major, minor, patch, build, and release parts
    var newSemver = cint.toObject(VERSION_PARTS, function(part) {
        return cint.keyValue(part, chooseVersion(part));
    });
    var newSemverString = semverBuildVersionString(newSemver);

    // determine the operator
    var uniqueOperators = _(parsedRange)
        .pluck('operator')
        .uniq()
        .value();
    var noOps = !uniqueOperators[0] && !uniqueOperators[1];
    var operator = noOps ? '' :
        newSemverString.split('').some(isWildDigit) ? '' : 
        uniqueOperators.length === 1 ? uniqueOperators[0] :
        '^';

    return operator + v(declaredSemver.semver) + newSemverString;
}

/**
 * Upgrade a dependencies collection based on latest available versions
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @returns {{}} upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies, latestVersions) {
    return _(currentDependencies)
        // combine the current and latest dependency objects into a single object keyed by packageName and containing both versions in an array: [current, latest]
        .mapValues(function(current, packageName) {
            var latest = latestVersions[packageName];
            return [current, latest];
        })
        // pick the packages that are upgradeable
        // we can use spread because isUpgradeable and upgradeDependencyDeclaration both take current and latest as arguments
        .pick(_.spread(isUpgradeable))
        .mapValues(_.spread(upgradeDependencyDeclaration))
        .value();
}

// Determines if the given version (range) should be upgraded to the latest (i.e. it is valid, it does not currently satisfy the latest, and it is not beyond the latest)
function isUpgradeable(current, latest) {

    if(!semver.validRange(current)) {
        return false;
    }

    // Unconstrain the dependency, to allow upgrades of the form: '>1.2.x' -> '>2.0.x'
    var unconstrainedCurrent = current.substr(getVersionConstraints(current).length, current.length);

    if (!unconstrainedCurrent) {
        return false;
    }

    var isLatest = semver.satisfies(latest, unconstrainedCurrent);
    var isBeyond = semver.ltr(latest, unconstrainedCurrent);

    return !isLatest && !isBeyond;
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
    return d === 'x' || d === '*';
}

/**
 * Get constraints (>, >=, <, <=) and empty spaces at the front of the version
 */
function getVersionConstraints(declaration) {
    var constraints = "";

    for (var i in declaration) {
        if ((isNaN(declaration[i]) || declaration[i] === ' ') && !isWildDigit(declaration[i])) {
            constraints += declaration[i];
        } else {
            break;
        }
    }

    return constraints;
}

/**
 * Creates a filter function from a given filter string. Supports strings, arrays of strings, or regexes.
 */
function packageNameFilter(filter) {

    var filterPackages;

    // no filter
    if(!filter) {
        filterPackages = _.identity;
    }
    // RegExp filter
    else if(typeof filter === 'string' && filter[0] === '/' && cint.index(filter,-1) === '/') {
        var regexp = new RegExp(filter.slice(1, filter.length-1));
        filterPackages = regexp.test.bind(regexp);
    }
    // string filter
    else if(typeof filter === 'string') {
        var packages = filter.split(/[\s,]+/);
        filterPackages = _.contains.bind(_, packages);
    }
    // array filter
    else if(Array.isArray(filter)) {
        filterPackages = _.contains.bind(_, filter);
    }
    else {
        throw new Error('Invalid packages filter. Must be a RegExp, array, or comma-or-space-delimited list.');
    }

    // (limit the arity to 1 to avoid passing the value)
    return cint.aritize(filterPackages, 1);
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
        var expression = '"' + dependency + '"\\s*:\\s*"' + escapeRegexp(oldDependencies[dependency] + '"');
        var regExp = new RegExp(expression, "g");
        data = data.replace(regExp, '"' + dependency + '": ' + '"' + newDependencies[dependency] + '"');
    }

    return data;
}

/**
 * Get the current dependencies from the package file
 * @param packageFile path to package.json
 * @param options.filter List or regex of package names to search
 * @param options.prod
 * @param options.dev
 * @returns Promised {dependencyName: version} collection
 */
function getCurrentDependencies(packageFile, options) {
    return readJson(packageFile, null, false)
        .then(function (json) {

            if(!json) {
                throw new Error('package.json does not contain valid json');
            }

            if(!options.prod && !options.dev) {
                options.prod = options.dev = true;
            }

            var allDependencies = cint.filterObject(_.merge({}, 
                options.prod && json.dependencies,
                options.dev && json.devDependencies
            ), packageNameFilter(options.filter));

            return allDependencies;
        });
}

function getInstalledPackages() {
    return npm.commands.listAsync([], true)
        .then(function (results) {
            var packageList = results.dependencies;
            if (!packageList) {
                throw new Error("Unable to retrieve NPM package list");
            }

            var globalPackages = {};
            for (var package in packageList) {
                if(packageList[package] !== "*") {
                    globalPackages[packageList[package].name] = packageList[package].version;
                }
            }

            return globalPackages;
        });
}

/**
 * Wraps npm.commands.view with some error handling and a nicer output.
 * @param packageName   Name of the package to jquery
 * @param field         Field such as "versions" or "dist-tags.latest" accepted by npm.commands.view (https://docs.npmjs.com/api/view)
 * @Returns info
 */
function npmView(packageName, field) {
    if (!npmIsInitialized) {
        throw new Error("initialize must be called before using the version manager");
    }

    return npm.commands.view([packageName, field], true)
        .then(function (response) {
            return _.values(response)[0][field];
        });
}

/**
 * Query the latest version of a package
 * @param packageName The name of the package to query
 * @returns version
 */
var getLatestPackageVersion = cint.partialAt(npmView, 1, 'dist-tags.latest');
var getPackageVersions = cint.partialAt(npmView, 1, 'versions');
var getGreatestPackageVersion = async.seq(getPackageVersions, cint.toAsync(_.last));

/**
 * Get the latest versions from the NPM repository
 * @param packageList   A list of package names to query
 * @param options       Options. Default: { versionTarget: 'latest' }. You may also specify { versionTarge: 'greatest' }
 * @returns      {packageName: version} collection
 */
function getLatestVersions(packageList, options) {

    options = options || {};

    // configure registry
    if (options.registry) {
        npm.config.set('registry', options.registry);
    }

    // validate options.versionTarget
    options.versionTarget = options.versionTarget || 'latest';

    // determine the getPackageVersions function from options.versionTarget
    switch(options.versionTarget) {
        case('latest'):
            getPackageVersion = getLatestPackageVersion;
            break;
        case('greatest'):
            getPackageVersion = getGreatestPackageVersion;
            break;
        default:
            var supportedVersionTargets = ['latest', 'greatest'];
            throw new Error('Unsupported versionTarget: ' + options.versionTarget + '. Supported version targets are: ' + supportedVersionTargets);
    }

    var failedDependencies = {};

    // By default async.map stops on the first error.
    // This wrapper suppresses and gathers all errors, to allow us
    // to iterate over every item in the package list.
    var errorCollectorWrapper = function (packageName, cb) {
        getPackageVersion(packageName, function (error, version) {
            if (error) failedDependencies[error.pkgid] = error;
            cb(null, cint.keyValue(packageName, version));
        })
    };

    // What to do with errorCollectionWrapper now???

    return Promise.map(packageList, function (latestVersions) {
        // remove empty objects left from errorCollectorWrapper
        // merge the array of versions into one object, for easier lookups
        latestDependencies = latestVersions
            .filter(cint.not(_.isEmpty))
            .reduce(_.assign, {});

        return [latestDependencies, failedDependencies];
    });
}

/**
 * Initialize the version manager
 * @returns 
 */
function initialize(global) {
    return npm.loadAsync({silent: true, global: global})
        .then(function () { return npmIsInitialized = true; })
}

//
// Helper functions
//

function escapeRegexp(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Thanks Stack Overflow!
}

//
// API
//

exports.initialize = initialize;
exports.upgradeDependencyDeclaration = upgradeDependencyDeclaration;
exports.getCurrentDependencies = getCurrentDependencies;
exports.getLatestVersions = getLatestVersions;
exports.getLatestPackageVersion = getLatestPackageVersion;
exports.getGreatestPackageVersion = getGreatestPackageVersion;
exports.isUpgradeable = isUpgradeable;
exports.upgradeDependencies = upgradeDependencies;
exports.updatePackageData = updatePackageData;
exports.getInstalledPackages = getInstalledPackages;
