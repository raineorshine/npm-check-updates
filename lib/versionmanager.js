var semver = require('semver');
var _ = require('lodash');
var cint = require('cint');
var semverutils = require('semver-utils');
var Promise = require('bluebird');
var npm = Promise.promisifyAll(require('npm'));
var versionUtil = require('./version-util.js');

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

var npmIsInitialized = false;

// keep order for setPrecision
var DEFAULT_WILDCARD = '^';

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
function upgradeDependencyDeclaration(declaration, latestVersion, options) {

    options = options || {};
    options.wildcard = options.wildcard || DEFAULT_WILDCARD;

    // return global versionUtil.wildcards immediately
    if (versionUtil.isWildCard(declaration)) {
        return declaration;
    }

    // parse the latestVersion
    // return original declaration if latestSemver is invalid
    var latestSemver = semverutils.parseRange(latestVersion)[0];
    if (!latestSemver) {
        return declaration;
    }

    // parse the declaration
    // if multiple ranges, use the semver with the least number of parts
    var parsedRange = _(semverutils.parseRange(declaration))
        // semver-utils includes empty entries for the || operator. We can remove them completely
        .reject({
            operator: '||'
        })
        .sortBy(function (range) {
            return versionUtil.numParts(versionUtil.stringify(range));
        })
        .value();
    var declaredSemver = parsedRange[0];

    /**
     * Chooses version parts between the declared version and the latest.
     * Base parts (major, minor, patch) are only included if they are in the original declaration.
     * Added parts (release, build) are always included. They are only present if we are checking --greatest versions
     * anyway.
    */
    function chooseVersion(part) {
        return versionUtil.isWildPart(declaredSemver[part]) ? declaredSemver[part] :
            _.contains(versionUtil.VERSION_BASE_PARTS, part) && declaredSemver[part] ? latestSemver[part] :
            _.contains(versionUtil.VERSION_ADDED_PARTS, part) ? latestSemver[part] :
            undefined;
    }

    // create a new semver object with major, minor, patch, build, and release parts
    var newSemver = cint.toObject(versionUtil.VERSION_PARTS, function (part) {
        return cint.keyValue(part, chooseVersion(part));
    });
    var newSemverString = versionUtil.stringify(newSemver);
    var version = v(declaredSemver.semver) + newSemverString;

    // determine the operator
    // do not compact, because [undefined, '<'] must be differentiated from ['<']
    var uniqueOperators = _(parsedRange)
        .pluck('operator')
        .uniq()
        .value();
    var operator = uniqueOperators[0] || '';

    var hasWildCard = versionUtil.WILDCARDS.some(_.partial(_.contains, newSemverString, _, 0));
    var isLessThan = uniqueOperators[0] === '<' || uniqueOperators[0] === '<=';
    var isMixed = uniqueOperators.length > 1;

    // convert versions with </<= or mixed operators into the preferred wildcard
    // only do so if the new version does not already contain a wildcard
    return !hasWildCard && (isLessThan || isMixed) ?
        versionUtil.addWildCard(version, options.wildcard) :
        operator + version;
}

/**
 * Upgrade a dependencies collection based on latest available versions
 * @param currentDependencies current dependencies collection object
 * @param latestVersions latest available versions collection object
 * @returns {{}} upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies, latestVersions) {

    // filter out depedencies with empty values
    currentDependencies = cint.filterObject(currentDependencies, function (key, value) {
        return value;
    });

    // get the preferred wildcard and bind it to upgradeDependencyDeclaration
    var wildcard = getPreferredWildcard(currentDependencies) || DEFAULT_WILDCARD;
    var upgradeDep = _.partialRight(upgradeDependencyDeclaration, {
        wildcard: wildcard
    });

    return _(currentDependencies)
        // only include packages for which a latest version was fetched
        .pick(function (current, packageName) {
            return packageName in latestVersions;
        })
        // combine the current and latest dependency objects into a single object keyed by packageName and containing
        // both versions in an array: [current, latest]
        .mapValues(function (current, packageName) {
            var latest = latestVersions[packageName];
            return [current, latest];
        })
        // pick the packages that are upgradeable
        // we can use spread because isUpgradeable and upgradeDependencyDeclaration both take current and latest as
        // arguments
        .pick(_.spread(isUpgradeable))
        .mapValues(_.spread(upgradeDep))
        .value();
}

// Determines if the given version (range) should be upgraded to the latest (i.e. it is valid, it does not currently
// satisfy the latest, and it is not beyond the latest)
function isUpgradeable(current, latest) {

    // do not upgrade non-npm version declarations (such as git tags)
    // do not upgrade versionUtil.wildcards
    if (!semver.validRange(current) || versionUtil.isWildCard(current)) {
        return false;
    }

    // remove the constraint (e.g. ^1.0.1 -> 1.0.1) to allow upgrades that satisfy the range, but are out of date
    var version = versionUtil.stringify(semverutils.parseRange(current)[0]);

    // make sure it is a valid range
    // not upgradeable if the latest version satisfies the current range
    // not upgradeable if the specified version is newer than the latest (indicating a prerelease version)
    return Boolean(semver.validRange(version)) &&
        !isSatisfied(latest, version) &&
        !semver.ltr(latest, version);
}

// Return true if the version satisfies the range
var isSatisfied = semver.satisfies;


/**
 * Creates a filter function from a given filter string. Supports strings, arrays of strings, or regexes.
 */
function packageNameFilter(filter) {

    var filterPackages;

    // no filter
    if (!filter) {
        filterPackages = _.identity;
    } else if (typeof filter === 'string') {
        // RegExp filter
        if (filter[0] === '/' && cint.index(filter,-1) === '/') {
            var regexp = new RegExp(filter.slice(1, filter.length-1));
            filterPackages = regexp.test.bind(regexp);
        } else {
            // string filter
            var packages = filter.split(/[\s,]+/);
            filterPackages = _.contains.bind(_, packages);
        }
    } else if (Array.isArray(filter)) {
        // array filter
        filterPackages = _.contains.bind(_, filter);
    } else if (filter instanceof RegExp) {
        // raw RegExp
        filterPackages = filter.test.bind(filter);
    } else {
        throw new Error('Invalid packages filter. Must be a RegExp, array, or comma-or-space-delimited list.');
    }

    // (limit the arity to 1 to avoid passing the value)
    return cint.aritize(filterPackages, 1);
}

/**
 * Upgrade the dependency declarations in the package data
 * @param pkgData The package.json data, as utf8 text
 * @param oldDependencies Object of old dependencies {package: range}
 * @param newDependencies Object of new dependencies {package: range}
 * @param newVersions Object of new versions {package: version}
 * @returns {string} The updated package data, as utf8 text
 */
function updatePackageData(pkgData, oldDependencies, newDependencies, newVersions, options) {

    options = options || {};
    var upgradeAll = options.upgradeAll;

    for (var dependency in newDependencies) {
        if (upgradeAll || !isSatisfied(newVersions[dependency], oldDependencies[dependency])) {
            var expression = '"' + dependency + '"\\s*:\\s*"' + escapeRegexp(oldDependencies[dependency] + '"');
            var regExp = new RegExp(expression, 'g');
            pkgData = pkgData.replace(regExp, '"' + dependency + '": ' + '"' + newDependencies[dependency] + '"');
        }
    }

    return pkgData;
}

/**
 * Get the current dependencies from the package file
 * @param pkg Object with dependencies, devDependencies, and/or optionalDependencies properties
 * @param options.filter List or regex of package names to search
 * @param options.prod
 * @param options.dev
 * @returns Promised {packageName: version} collection
 */
function getCurrentDependencies(pkg, options) {

    pkg = pkg || {};
    options = options || {};

    if (!options.prod && !options.dev && !options.optional) {
        options.prod = options.dev = options.optional = true;
    }

    var allDependencies = cint.filterObject(_.merge({},
        options.prod && pkg.dependencies,
        options.dev && pkg.devDependencies,
        options.optional && pkg.optionalDependencies
    ), packageNameFilter(options.filter));

    return allDependencies;
}

function getInstalledPackages() {
    return npm.commands.listAsync([], true).then(function (results) {
        if (!results || !results.dependencies) {
            throw new Error('Unable to retrieve NPM package list');
        }

        // filter out undefined packages or those with a wildcard
        var validPackages = cint.filterObject(results.dependencies, function (dep, packageInfo) {
            return packageInfo.name && packageInfo.version && !versionUtil.isWildPart(packageInfo.version);
        });

        // convert the dependency object from npm into a simple object that maps the package name to its version
        var simpleDependencies = cint.mapObject(validPackages, function (dep, packageInfo) {
            return cint.keyValue(dep, packageInfo.version);
        });

        return simpleDependencies;

    });
}

/**
 * Wraps npm.commands.view with some error handling and a nicer output.
 * @param packageName Name of the package to jquery
 * @param field Field such as "versions" or "dist-tags.latest" accepted by npm.commands.view (https://docs.npmjs.com/api/view)
 * @Returns info
 */
function npmView(packageName, field) {
    if (!npmIsInitialized) {
        throw new Error('initialize must be called before using the version manager');
    }

    return npm.commands.viewAsync([packageName, field], true)
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

function getGreatestPackageVersion(packages) {
    return getPackageVersions(packages).then(_.last);
}

/**
 * Get the latest versions from the NPM repository
 * @param packageList   A list of package names to query
 * @param options       Options. Default: { versionTarget: 'latest' }. You may also specify { versionTarge: 'greatest' }
 * @returns             Promised {packageName: version} collection
 */
function getLatestVersions(packageList, options) {

    var getPackageVersion;
    options = options || {};

    // configure registry
    if (options.registry) {
        npm.config.set('registry', options.registry);
    }

    // validate options.versionTarget
    options.versionTarget = options.versionTarget || 'latest';

    // determine the getPackageVersions function from options.versionTarget
    switch (options.versionTarget) {
        case('latest'):
            getPackageVersion = getLatestPackageVersion;
            break;
        case('greatest'):
            getPackageVersion = getGreatestPackageVersion;
            break;
        default:
            var supportedVersionTargets = ['latest', 'greatest'];
            return Promise.reject('Unsupported versionTarget: ' + options.versionTarget +
                '. Supported version targets are: ' + supportedVersionTargets);
    }

    // TODO: It would be better here to create an object of promised versions, keyed by the package name, instead of an
    // array. This should make the final _.pick unnecessary and subsequently allow the whole PromiseInspection logic to
    // be generalized

    return Promise.settle(packageList.map(getPackageVersion))
        // convert the array of versions to a nicer object keyed by package name
        .then(function (versions) {
            return Promise.map(versions, function (version) {
                if (version.isRejected()) {
                    var reason = version.reason();
                    if (reason.statusCode === 404 || reason === '404' || reason === '404 Not Found') {
                        return null;
                    } else {
                        throw new Error(reason);
                    }
                } else {
                    return version.value();
                }
            });
        })
        .then(function (versions) {
            return cint.toObject(versions, function (version, i) {
                return cint.keyValue(packageList[i], version);
            });
        })
        .then(_.partialRight(_.pick, _.identity));
}

/**
 * Given a dependencies collection, returns whether the user prefers ^, ~, .*, or .x (simply counts the greatest number
 * of occurrences). Returns null if given no dependencies.
 */
function getPreferredWildcard(dependencies) {

    // if there are no dependencies, return null.
    if (Object.keys(dependencies).length === 0) {
        return null;
    }

    // group the dependencies by wildcard
    var groups = _.groupBy(_.values(dependencies), function (dep) {
        return _.find(versionUtil.WILDCARDS, function (wildcard) {
            return dep && dep.indexOf(wildcard) > -1;
        });
    });

    // if none of the dependencies use a wildcard, return null
    var usedWildcards = Object.keys(groups);
    if (usedWildcards.length === 1 && usedWildcards[0] === 'undefined') {
        return null;
    }

    // convert to an array of objects that can be sorted
    var arrOfGroups = cint.toArray(groups, function (wildcard, instances) {
        return {
            wildcard: wildcard,
            instances: instances
        };
    });

    // reverse sort the groups so that the wildcard with the most appearances is at the head, then return it.
    var sorted = _.sortBy(arrOfGroups, function (wildcardObject) {
        return -wildcardObject.instances.length;
    });

    return sorted[0].wildcard;
}

/**
 * Initialize the version manager
 * @returns
 */
function initialize(global) {

    return npm.loadAsync({silent: true, global: global})
        .then(function () {
            rawPromisify(npm.commands);
            return npmIsInitialized = true;
        });
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

module.exports = {
    initialize: initialize,
    upgradeDependencyDeclaration: upgradeDependencyDeclaration,
    updatePackageData: updatePackageData,
    getCurrentDependencies: getCurrentDependencies,
    upgradeDependencies: upgradeDependencies,
    getInstalledPackages: getInstalledPackages,
    getLatestPackageVersion: getLatestPackageVersion,
    getGreatestPackageVersion: getGreatestPackageVersion,
    getLatestVersions: getLatestVersions,
    isUpgradeable: isUpgradeable,
    isSatisfied: isSatisfied,
    getPreferredWildcard: getPreferredWildcard
};
