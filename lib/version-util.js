var semverutils = require('semver-utils');
var _ = require('lodash');
var chalk = require('chalk');
var util = require('util');

var VERSION_BASE_PARTS = ['major', 'minor', 'patch'];
var VERSION_ADDED_PARTS = ['release', 'build'];
var VERSION_PARTS = [].concat(VERSION_BASE_PARTS, VERSION_ADDED_PARTS);
var VERSION_PART_DELIM = {
    major: '',
    minor: '.',
    patch: '.',
    release: '-',
    build: '+'
};
var WILDCARDS = ['^', '~', '.*', '.x'];
var WILDCARDS_PURE = ['^', '~', '^*', '*', 'x', 'x.x', 'x.x.x'];
var WILDCARD_PURE_REGEX = new RegExp('^(' + WILDCARDS_PURE.join('|')
    .replace(/\^/g, '\\^')
    .replace(/\*/g, '\\*') + ')$');
var SEMANTIC_DIRECT = new RegExp('^\\d+\\.\\d+\\.\\d+([-|+].*)*$');

/**
 * Returns the number of parts in the version
 */
function numParts(version) {

    var semver = semverutils.parseRange(version)[0];

    if (!semver) {
        throw new Error(util.format('semverutils.parseRange returned null when trying to parse "%s". This is probably a problem with the "semver-utils" dependency. Please report an issue at https://github.com/tjunnone/npm-check-updates/issues.', version));
    }

    return _.intersection(VERSION_PARTS, Object.keys(semver)).length;
}

/**
 * Increases or decreases the given precision by the given amount, e.g. major+1 -> minor
 */
function precisionAdd(precision, n) {

    if (n === 0) {
        return precision;
    }

    var index = n === 0 ? precision :
        _.includes(VERSION_BASE_PARTS, precision) ? VERSION_BASE_PARTS.indexOf(precision) + n :
            _.includes(VERSION_ADDED_PARTS, precision) ? VERSION_BASE_PARTS.length + n :
                null;

    if (index === null) {
        throw new Error('Invalid precision: ' + precision);
    } else if (!VERSION_PARTS[index]) {
        throw new Error('Invalid precision math' + arguments);
    }

    return VERSION_PARTS[index];
}

/** Joins the major, minor, patch, release, and build parts (controlled by an optional precision arg) of a semver object
 * into a dot-delimited string. */
function stringify(semver, precision) {

    // get a list of the parts up until (and including) the given precision
    // or all of them, if no precision is specified
    var parts = precision ? VERSION_PARTS.slice(0, VERSION_PARTS.indexOf(precision)+1) : VERSION_PARTS;

    // pair each part with its delimiter and join together
    return parts
        .filter(function (part) {
            return _.includes(VERSION_BASE_PARTS, precision) || semver[part];
        })
        .map(function (part) {
            return VERSION_PART_DELIM[part] + (semver[part] || '0');
        })
        .join('');
}

/**
 * Gets how precise this version number is (major, minor, patch, release, or build)
 */
function getPrecision(version) {
    var semver = semverutils.parseRange(version)[0];
    // expects VERSION_PARTS to be in correct order
    return _.find(VERSION_PARTS.slice().reverse(), _.propertyOf(semver));
}

/**
 * Sets the precision of a (loose) semver to the specified level: major, minor, etc.
 */
function setPrecision(version, precision) {
    var semver = semverutils.parseRange(version)[0];
    return stringify(semver, precision);
}

/** Adds a given wildcard (^,~,.*,.x) to a version number. Adds ^ and ~ to the beginning. Replaces everything after the
 * major version number with .* or .x */
function addWildCard(version, wildcard) {
    return wildcard === '^' || wildcard === '~' ?
        wildcard + version :
        setPrecision(version, 'major') + wildcard;
}

/** Returns true if the given string is one of the wild cards. */
function isWildCard(version) {
    return WILDCARD_PURE_REGEX.test(version);
}

/** Returns true if the given digit is a wildcard for a part of a version. */
function isWildPart(versionPart) {
    return versionPart === '*' || versionPart === 'x';
}

/**
 * Colorize the parts of a version string that are different than a given string to compare to. Assumes that the two
 * verson strings are in the same format.
 */
function colorizeDiff(strToColor, strToCompare, options) {

    options = options || {};
    options.color = options.color || 'green';
    var leadingWildcard = '';

    // separate out leading ^ or ~
    if (/^[~^]/.test(strToColor) && strToColor[0] === strToCompare[0]) {
        leadingWildcard = strToColor[0];
        strToColor = strToColor.slice(1);
        strToCompare = strToCompare.slice(1);
    }

    // split into parts
    var partsToColor = strToColor.split('.');
    var partsToCompare = strToCompare.split('.');

    var i = _.findIndex(partsToColor, function (part, i) {
        return part !== partsToCompare[i];
    });
    i = i >= 0 ? i : partsToColor.length;

    // if we are colorizing only part of the word, add a dot in the middle
    var middot = i > 0 && i < partsToColor.length ? '.' : '';

    return leadingWildcard +
        partsToColor.slice(0,i).join('.') +
        middot +
        chalk[options.color](partsToColor.slice(i).join('.'));
}

/**
 * @param versions  Array of all available versions
 * @param current   Current version
 * @param level     major/minor
 * @Returns         String representation of the suggested version. If the current version
 * is not direct then returns null
 */
function findGreatestByLevel(versions, current, level) {
    if (!SEMANTIC_DIRECT.test(current)) {
        return null;
    }

    var cur = semverutils.parse(current);
    return _.chain(versions)
        .map(function (v) {
            return {
                string: v,
                parsed: semverutils.parse(v)
            };
        })
        .filter(function (o) {
            if (level === 'minor' && o.parsed.major !== cur.major) {
                return false;
            }
            return o.parsed[level] === cur[level];
        })
        .map(function (o) {
            return o.string;
        })
        .last()
        .value();
}

module.exports = {
    numParts: numParts,
    stringify: stringify,
    precisionAdd: precisionAdd,
    getPrecision: getPrecision,
    setPrecision: setPrecision,
    addWildCard: addWildCard,
    isWildCard: isWildCard,
    isWildPart: isWildPart,
    colorizeDiff: colorizeDiff,
    findGreatestByLevel: findGreatestByLevel,
    VERSION_BASE_PARTS: VERSION_BASE_PARTS,
    VERSION_ADDED_PARTS: VERSION_ADDED_PARTS,
    VERSION_PARTS: VERSION_PARTS,
    WILDCARDS: WILDCARDS
};
