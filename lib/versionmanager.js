var semver = require('semver');
var _ = require('lodash');
var cint = require('cint');
var semverutils = require('semver-utils');
var Promise = require('bluebird');
var versionUtil = require('./version-util.js');
var requireDir = require('require-dir');
var packageManagers = requireDir('./package-managers');

// keep order for setPrecision
var DEFAULT_WILDCARD = '^';

/** Returns 'v' if the string starts with a v, otherwise returns empty string. */
function v(str) {
    return str && (str[0] === 'v' || str[1] === 'v') ? 'v' : '';
}

/** Returns a new function that AND's the two functions over the provided arguments. */
function and(f, g) {
    return function () {
        return f.apply(this, arguments) && g.apply(this, arguments);
    };
}

// set during initialize based on packageManagers[options.packageManager]
var selectedPackageManager;

/**
 * Upgrade an existing dependency declaration to satisfy the latest version
 * @param declaration Current version declaration (e.g. "1.2.x")
 * @param latestVersion Latest version (e.g "1.3.2")
 * @returns {string} The upgraded dependency declaration (e.g. "1.3.x")
 */
function upgradeDependencyDeclaration(declaration, latestVersion, options) {

    options = options || {};
    options.wildcard = options.wildcard || DEFAULT_WILDCARD;

    // parse the latestVersion
    // return original declaration if latestSemver is invalid
    var latestSemver = semverutils.parseRange(latestVersion)[0];
    if (!latestSemver) {
        return declaration;
    }

    // return global versionUtil.wildcards immediately
    if (options.removeRange) {
        return latestVersion;
    } else if (versionUtil.isWildCard(declaration)) {
        return declaration;
    }

    // parse the declaration
    // if multiple ranges, use the semver with the least number of parts
    var parsedRange = _(semverutils.parseRange(declaration))
        // semver-utils includes empty entries for the || and - operators. We can remove them completely
        .reject({operator: '||'})
        .reject({operator: '-'})
        .sortBy(_.ary(_.flow(versionUtil.stringify, versionUtil.numParts), 1))
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
            _.includes(versionUtil.VERSION_BASE_PARTS, part) && declaredSemver[part] ? latestSemver[part] :
            _.includes(versionUtil.VERSION_ADDED_PARTS, part) ? latestSemver[part] :
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
        .map(function (range) {
            return range.operator;
        })
        .uniq()
        .value();
    var operator = uniqueOperators[0] || '';

    var hasWildCard = versionUtil.WILDCARDS.some(_.partial(_.includes, newSemverString, _, 0));
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
function upgradeDependencies(currentDependencies, latestVersions, options) {

    options = options || {};

    // filter out dependencies with empty values
    currentDependencies = cint.filterObject(currentDependencies, function (key, value) {
        return value;
    });

    // get the preferred wildcard and bind it to upgradeDependencyDeclaration
    var wildcard = getPreferredWildcard(currentDependencies) || DEFAULT_WILDCARD;
    var upgradeDep = _.partialRight(upgradeDependencyDeclaration, {
        wildcard: wildcard,
        removeRange: options.removeRange
    });

    return _(currentDependencies)
        // only include packages for which a latest version was fetched
        .pickBy(function (current, packageName) {
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
        .pickBy(_.spread(isUpgradeable))
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
    var range = semverutils.parseRange(current)[0];
    if (!range) {
        throw new Error('"' + current + '" could not be parsed by semver-utils. This is probably a bug. Please file an issue at https://github.com/tjunnone/npm-check-updates.');
    }
    var version = versionUtil.stringify(range);

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
 * Creates a filter function from a given filter string. Supports strings, comma-or-space-delimited lists, and regexes.
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
            filterPackages = _.includes.bind(_, packages);
        }
    } else if (Array.isArray(filter)) {
        // array filter
        filterPackages = _.includes.bind(_, filter);
    } else if (filter instanceof RegExp) {
        // raw RegExp
        filterPackages = filter.test.bind(filter);
    } else {
        throw new Error('Invalid packages filter. Must be a RegExp, array, or comma-or-space-delimited list.');
    }

    // (limit the arity to 1 to avoid passing the value)
    return cint.aritize(filterPackages, 1);
}

/** Creates a single filter function from an optional filter and optional reject. */
function filterAndReject(filter, reject) {
    return and(
        filter ? packageNameFilter(filter) : _.identity,
        reject ? _.negate(packageNameFilter(reject)) : _.identity
    );
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

    for (var dependency in newDependencies) {
        if (options.upgradeAll || !isSatisfied(newVersions[dependency], oldDependencies[dependency])) {
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
 * @param options.dev
 * @param options.filter
 * @param options.prod
 * @param options.reject
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
    ), filterAndReject(options.filter, options.reject));

    return allDependencies;
}

/**
 * @options.cwd
 */
function getInstalledPackages(options) {

    options = options || {};

    return selectedPackageManager.list([], {cwd: options.cwd}).then(function (results) {
        if (!results || !results.dependencies) {
            throw new Error('Unable to retrieve NPM package list');
        }

        // filter out undefined packages or those with a wildcard
        var filterFunction = filterAndReject(options.filter, options.reject);
        var validPackages = cint.filterObject(results.dependencies, function (dep, pkgInfo) {
            return pkgInfo && pkgInfo.name && pkgInfo.version && !versionUtil.isWildPart(pkgInfo.version) && filterFunction(dep);
        });

        // convert the dependency object from npm into a simple object that maps the package name to its version
        var simpleDependencies = cint.mapObject(validPackages, function (dep, pkgInfo) {
            return cint.keyValue(dep, pkgInfo.version);
        });

        return simpleDependencies;
    });
}

/**
 * Get the latest or greatest versions from the NPM repository
 * @param packageMap   an object whose keys are package name and values are current versions
 * @param options       Options. Default: { versionTarget: 'latest' }. You may also specify { versionTarge: 'greatest' }
 * @returns             Promised {packageName: version} collection
 */
function getLatestVersions(packageMap, options) {

    var getPackageVersion;
    options = options || {};

    var packageList = Object.keys(packageMap);

    // validate options.versionTarget
    options.versionTarget = options.versionTarget || 'latest';

    // determine the getPackageVersion function from options.versionTarget
    switch (options.versionTarget) {
        case 'latest':
            getPackageVersion = selectedPackageManager.latest;
            break;
        case 'greatest':
            getPackageVersion = selectedPackageManager.greatest;
            break;
        case 'newest':
            getPackageVersion = selectedPackageManager.newest;
            break;
        case 'major':
            getPackageVersion = selectedPackageManager.greatestMajor;
            break;
        case 'minor':
            getPackageVersion = selectedPackageManager.greatestMinor;
            break;
        default:
            var supportedVersionTargets = ['latest', 'newest', 'greatest', 'major', 'minor'];
            return Promise.reject(new Error('Unsupported versionTarget: ' + options.versionTarget +
                '. Supported version targets are: ' + supportedVersionTargets.join(', ')));
    }

    // ignore 404 errors from getPackageVersion by having them return null instead of rejecting
    function getPackageVersionProtected(dep) {
        return getPackageVersion(dep, packageMap[dep]).catch(function (err) {
            if (err.message == 404) { // eslint-disable-line eqeqeq
                return null;
            } else {
                throw err;
            }
        });
    }

    // zip up the array of versions into to a nicer object keyed by package name
    function zipVersions(versionList) {
        return cint.toObject(versionList, function (version, i) {
            return cint.keyValue(packageList[i], version);
        });
    }

    return Promise.map(packageList, getPackageVersionProtected)
        .then(zipVersions)
        .then(_.partialRight(_.pickBy, _.identity));
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
 * Initialize the version manager with the given package manager.
 * @param args.global
 * @param args.packageManager
 */
function initialize(args) {

    args = args || {};
    args.packageManager = args.packageManager || 'npm';

    if (!(args.packageManager in packageManagers)) {
        throw new Error('Invalid package manager: ' + args.packageManager);
    }

    selectedPackageManager = packageManagers[args.packageManager];

    return selectedPackageManager.init({
        global: args.global,
        registry: args.registry
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
    getLatestVersions: getLatestVersions,
    isUpgradeable: isUpgradeable,
    isSatisfied: isSatisfied,
    getPreferredWildcard: getPreferredWildcard,
    // deprecate in next major version
    getLatestPackageVersion: function (pkg) {
        return selectedPackageManager.latest(pkg);
    },
    getGreatestPackageVersion: function (pkg) {
        return selectedPackageManager.greatest(pkg);
    }
};
