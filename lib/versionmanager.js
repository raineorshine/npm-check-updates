'use strict';
const semver = require('semver');
const _ = require('lodash');
const cint = require('cint');
const semverutils = require('semver-utils');
const Promise = require('bluebird');
const ProgressBar = require('progress');
const packageJson = require('package-json');
const versionUtil = require('./version-util.js');
const packageManagers = require('./package-managers');
const prompts = require('prompts');

// keep order for setPrecision
const DEFAULT_WILDCARD = '^';

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

/**
 * Upgrade an existing dependency declaration to satisfy the latest version
 * @param declaration Current version declaration (e.g. "1.2.x")
 * @param latestVersion Latest version (e.g "1.3.2")
 * @param {Object} [options={}]
 * @returns {string} The upgraded dependency declaration (e.g. "1.3.x")
 */
function upgradeDependencyDeclaration(declaration, latestVersion, options = {}) {
    options.wildcard = options.wildcard || DEFAULT_WILDCARD;

    // parse the latestVersion
    // return original declaration if latestSemver is invalid
    const latestSemver = semverutils.parseRange(latestVersion)[0];
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
    const parsedRange = _(semverutils.parseRange(declaration))
        // semver-utils includes empty entries for the || and - operators. We can remove them completely
        .reject({operator: '||'})
        .reject({operator: '-'})
        .sortBy(_.ary(_.flow(versionUtil.stringify, versionUtil.numParts), 1))
        .value();
    const declaredSemver = parsedRange[0];

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
    const newSemver = cint.toObject(versionUtil.VERSION_PARTS, part =>
        cint.keyValue(part, chooseVersion(part))
    );
    const newSemverString = versionUtil.stringify(newSemver);
    const version = v(declaredSemver.semver) + newSemverString;

    // determine the operator
    // do not compact, because [undefined, '<'] must be differentiated from ['<']
    const uniqueOperators = _(parsedRange)
        .map(range => range.operator)
        .uniq()
        .value();
    const operator = uniqueOperators[0] || '';

    const hasWildCard = versionUtil.WILDCARDS.some(_.partial(_.includes, newSemverString, _, 0));
    const isLessThan = uniqueOperators[0] === '<' || uniqueOperators[0] === '<=';
    const isMixed = uniqueOperators.length > 1;

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
 * @param {Object} [options={}]
 * @returns {{}} upgraded dependency collection object
 */
function upgradeDependencies(currentDependencies, latestVersions, options = {}) {
    // filter out dependencies with empty values
    currentDependencies = cint.filterObject(currentDependencies, (key, value) => {
        return value;
    });

    // get the preferred wildcard and bind it to upgradeDependencyDeclaration
    const wildcard = getPreferredWildcard(currentDependencies) || DEFAULT_WILDCARD;
    const upgradeDep = _.partialRight(upgradeDependencyDeclaration, {
        wildcard,
        removeRange: options.removeRange
    });

    return _(currentDependencies)
        // only include packages for which a latest version was fetched
        .pickBy((current, packageName) => {
            return packageName in latestVersions;
        })
        // combine the current and latest dependency objects into a single object keyed by packageName and containing
        // both versions in an array: [current, latest]
        .mapValues((current, packageName) => {
            const latest = latestVersions[packageName];
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

// Return true if the version satisfies the range
const isSatisfied = semver.satisfies;

// satisfy the latest, and it is not beyond the latest)
function isUpgradeable(current, latest) {

    // do not upgrade non-npm version declarations (such as git tags)
    // do not upgrade versionUtil.wildcards
    if (!semver.validRange(current) || versionUtil.isWildCard(current)) {
        return false;
    }

    // remove the constraint (e.g. ^1.0.1 -> 1.0.1) to allow upgrades that satisfy the range, but are out of date
    const range = semverutils.parseRange(current)[0];
    if (!range) {
        throw new Error(`"${current}" could not be parsed by semver-utils. This is probably a bug. Please file an issue at https://github.com/tjunnone/npm-check-updates.`);
    }
    const version = versionUtil.stringify(range);

    // make sure it is a valid range
    // not upgradeable if the latest version satisfies the current range
    // not upgradeable if the specified version is newer than the latest (indicating a prerelease version)
    return Boolean(semver.validRange(version)) &&
        !isSatisfied(latest, version) &&
        !semver.ltr(latest, version);
}

/**
 * Creates a filter function from a given filter string. Supports strings, comma-or-space-delimited lists, and regexes.
 */
function packageNameFilter(filter) {

    let filterPackages;

    // no filter
    if (!filter) {
        filterPackages = _.identity;
    } else if (typeof filter === 'string') {
        // RegExp filter
        if (filter[0] === '/' && cint.index(filter,-1) === '/') {
            const regexp = new RegExp(filter.slice(1, filter.length-1));
            filterPackages = regexp.test.bind(regexp);
        } else {
            // string filter
            const packages = filter.split(/[\s,]+/);
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

/** Returns an 2-tuple of upgradedDependencies and their latest versions */
function upgradePackageDefinitions(currentDependencies, options) {
    const versionTarget = getVersionTarget(options);

    return queryVersions(currentDependencies, {
        versionTarget,
        registry: options.registry ? options.registry : null,
        pre: options.pre,
        packageManager: options.packageManager,
        json: options.json,
        loglevel: options.loglevel
    }).then(latestVersions => {

        const upgradedDependencies = upgradeDependencies(currentDependencies, latestVersions, {
            removeRange: options.removeRange
        });

        const filteredUpgradedDependencies = _.pickBy(upgradedDependencies, (v, dep) => {
            return !options.jsonUpgraded || !options.minimal || !isSatisfied(latestVersions[dep], currentDependencies[dep]);
        });

        return [filteredUpgradedDependencies, latestVersions];
    });
}

/**
 * Upgrade the dependency declarations in the package data
 * @param pkgData The package.json data, as utf8 text
 * @param oldDependencies Object of old dependencies {package: range}
 * @param newDependencies Object of new dependencies {package: range}
 * @param newVersions Object of new versions {package: version}
 * @param {Object} [options={}]
 * @returns {string} The updated package data, as utf8 text
 * @sideeffect prompts
 */
async function upgradePackageData(pkgData, oldDependencies, newDependencies, newVersions, options = {}) {

    // copy newDependencies for mutation via interactive mode
    const selectedNewDependencies = Object.assign({}, newDependencies);
    let newPkgData = pkgData;

    for (const dependency in newDependencies) {
        if (!options.minimal || !isSatisfied(newVersions[dependency], oldDependencies[dependency])) {
            if (options.interactive) {
                const to = versionUtil.colorizeDiff(newDependencies[dependency] || '', oldDependencies[dependency]);
                const response = await prompts({
                    type: 'confirm',
                    name: 'value',
                    message: `Do you want to upgrade: ${dependency} ${oldDependencies[dependency]} → ${to}?`,
                    initial: true
                });
                if (!response.value) {
                    // continue loop to next dependency and skip updating newPkgData
                    delete selectedNewDependencies[dependency];
                    continue;
                }
            }
            const expression = `"${dependency}"\\s*:\\s*"${escapeRegexp(`${oldDependencies[dependency]}"`)}`;
            const regExp = new RegExp(expression, 'g');
            newPkgData = newPkgData.replace(regExp, `"${dependency}": "${newDependencies[dependency]}"`);

        }
    }

    return {newPkgData, selectedNewDependencies};
}

/**
 * Get the current dependencies from the package file
 * @param {Object} [pkgData={}] Object with dependencies, devDependencies, peerDependencies, optionalDependencies, and/or bundleDependencies properties
 * @param {Object} [options={}]
 * @param options.dep
 * @param options.filter
 * @param options.reject
 * @returns Promised {packageName: version} collection
 */
function getCurrentDependencies(pkgData = {}, options = {}) {

    if (options.dep) {
        const deps = (options.dep || '').split(',');
        options.prod = _.includes(deps, 'prod');
        options.dev = _.includes(deps, 'dev');
        options.peer = _.includes(deps, 'peer');
        options.optional = _.includes(deps, 'optional');
        options.bundle = _.includes(deps, 'bundle');
    } else {
        options.prod = options.dev = options.peer = options.optional = options.bundle = true;
    }

    const allDependencies = cint.filterObject(_.merge({},
        options.prod && pkgData.dependencies,
        options.dev && pkgData.devDependencies,
        options.peer && pkgData.peerDependencies,
        options.optional && pkgData.optionalDependencies,
        options.bundle && pkgData.bundleDependencies
    ), filterAndReject(options.filter, options.reject));

    return allDependencies;
}

/**
 * @options.cwd
 * @options.filter
 * @options.global
 * @options.packageManager
 * @options.prefix
 * @options.reject
 */
function getInstalledPackages(options = {}) {
    return getPackageManager(options.packageManager).list({cwd: options.cwd, prefix: options.prefix, global: options.global}).then(pkgInfoObj => {
        if (!pkgInfoObj) {
            throw new Error('Unable to retrieve NPM package list');
        }

        // filter out undefined packages or those with a wildcard
        const filterFunction = filterAndReject(options.filter, options.reject);
        return cint.filterObject(pkgInfoObj, (dep, version) =>
            version && !versionUtil.isWildPart(version) && filterFunction(dep)
        );
    });
}

/**
 * Get the latest or greatest versions from the NPM repository based on the version target
 * @param packageMap   an object whose keys are package name and values are current versions
 * @param {Object} [options={}]       Options. Default: { versionTarget: 'latest' }. You may also specify { versionTarget: 'greatest' }
 * @returns             Promised {packageName: version} collection
 */
function queryVersions(packageMap, options = {}) {
    let getPackageVersion;

    const packageList = Object.keys(packageMap);
    const packageManager = getPackageManager(options.packageManager);

    // validate options.versionTarget
    options.versionTarget = options.versionTarget || 'latest';

    let bar;
    if (!options.json && options.loglevel !== 'silent' && packageList.length > 0) {
        bar = new ProgressBar('[:bar] :current/:total :percent', {total: packageList.length, width: 20});
        bar.render();
    }

    // determine the getPackageVersion function from options.versionTarget
    switch (options.versionTarget) {
        case 'latest': {
            getPackageVersion = packageManager.latest;
            break;
        }
        case 'greatest': {
            getPackageVersion = packageManager.greatest;
            break;
        }
        case 'newest': {
            getPackageVersion = packageManager.newest;
            break;
        }
        case 'major': {
            getPackageVersion = packageManager.greatestMajor;
            break;
        }
        case 'minor': {
            getPackageVersion = packageManager.greatestMinor;
            break;
        }
        default: {
            const supportedVersionTargets = ['latest', 'newest', 'greatest', 'major', 'minor'];
            return Promise.reject(new Error(`Unsupported versionTarget: ${options.versionTarget}. Supported version targets are: ${supportedVersionTargets.join(', ')}`));
        }
    }

    // ignore 404 errors from getPackageVersion by having them return null instead of rejecting
    function getPackageVersionProtected(dep) {
        return getPackageVersion(dep, packageMap[dep], options.pre).catch(err => {
            if (err && (err.message || err).toString().match(/E404|ENOTFOUND|404 Not Found/i) ||
                err instanceof packageJson.PackageNotFoundError) {
                return null;
            } else {
                throw err;
            }
        }).then(result => {
            if (bar) {
                bar.tick();
            }
            return result;
        });
    }

    // zip up the array of versions into to a nicer object keyed by package name
    function zipVersions(versionList) {
        return cint.toObject(versionList, (version, i) => {
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
    const groups = _.groupBy(_.values(dependencies), dep =>
        _.find(versionUtil.WILDCARDS, wildcard =>
            dep && dep.indexOf(wildcard) > -1
        )
    );

    // if none of the dependencies use a wildcard, return null
    const usedWildcards = Object.keys(groups);
    if (usedWildcards.length === 1 && usedWildcards[0] === 'undefined') {
        return null;
    }

    // convert to an array of objects that can be sorted
    const arrOfGroups = cint.toArray(groups, (wildcard, instances) => ({
        wildcard,
        instances
    }));

    // reverse sort the groups so that the wildcard with the most appearances is at the head, then return it.
    const sorted = _.sortBy(arrOfGroups, wildcardObject => -wildcardObject.instances.length);

    return sorted[0].wildcard;
}

function getVersionTarget(options) {
    return options.semverLevel ? options.semverLevel :
        options.newest ? 'newest' :
            options.greatest ? 'greatest' :
                'latest';
}

/**
 * Initialize the version manager with the given package manager.
 * @param args.global
 * @param args.packageManager
 */
function getPackageManager(packageManagerNameOrObject) {

    /** Get one of the preset package managers or throw an error if there is no match. */
    function getPresetPackageManager(packageManagerName) {
        if (!(packageManagerName in packageManagers)) {
            throw new Error(`Invalid package manager: ${packageManagerName}`);
        }
        return packageManagers[packageManagerName];
    }

    return !packageManagerNameOrObject ? packageManagers.npm : // default to npm
        // use present package manager if name is specified
        typeof packageManagerNameOrObject === 'string' ? getPresetPackageManager(packageManagerNameOrObject) :
            // use provided package manager object otherwise
            packageManagerNameOrObject;
}

//
// Helper functions
//

function escapeRegexp(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'); // Thanks Stack Overflow!
}

//
// API
//

module.exports = {
    // used directly by npm-check-updates.js
    getCurrentDependencies,
    getInstalledPackages,
    getVersionTarget,
    isSatisfied,
    upgradePackageData,
    upgradePackageDefinitions,

    // exposed for testing
    getPreferredWildcard,
    isUpgradeable,
    queryVersions,
    upgradeDependencies,
    upgradeDependencyDeclaration
};
