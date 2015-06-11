var semverutils = require('semver-utils');
var _ = require('lodash');

var VERSION_BASE_PARTS = ['major', 'minor', 'patch'];
var VERSION_ADDED_PARTS = ['release', 'build'];
var VERSION_PARTS = [].concat(VERSION_BASE_PARTS, VERSION_ADDED_PARTS);
var VERSION_PART_DELIM = {
    major : '',
    minor : '.',
    patch : '.',
    release : '-',
    build : '+'
};

/**
 * Returns the number of parts in the version
 */
function numParts(version) {
    var semver = semverutils.parseRange(version)[0];
    return _.intersection(VERSION_PARTS, Object.keys(semver)).length;
}

/** 
 * Increases or decreases the given precision by the given amount, e.g. major+1 -> minor
 */
function precisionAdd(precision, n) {

    if(n === 0) { return precision; }

    var index = n === 0 ? precision :
        _.contains(VERSION_BASE_PARTS, precision) ? VERSION_BASE_PARTS.indexOf(precision) + n :
        _.contains(VERSION_ADDED_PARTS, precision) ? VERSION_BASE_PARTS.length + n :
        null;

    if(index === null) {
        throw new Error('Invalid precision: ' + precision);
    }
    else if(!VERSION_PARTS[index]) {
        throw new Error('Invalid precision math' + arguments);
    }

    return VERSION_PARTS[index];
}

/** Joins the major, minor, patch, release, and build parts (controlled by an optional precision arg) of a semver object into a dot-delimited string. */
function stringify(semver, precision) {

    // get a list of the parts up until (and including) the given precision
    // or all of them, if no precision is specified
    var parts = precision ? VERSION_PARTS.slice(0, VERSION_PARTS.indexOf(precision)+1) : VERSION_PARTS;

    // pair each part with its delimiter and join together
    return parts
        .filter(function(part) {
            return _.contains(VERSION_BASE_PARTS, precision) || semver[part];
        })
        .map(function(part) {
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

/** Adds a given wildcard (^,~,.*,.x) to a version number. Adds ^ and ~ to the beginning. Replaces everything after the major version number with .* or .x */
function addWildCard(version, wildcard) {
    return wildcard === '^' || wildcard === '~' ?
        wildcard + version :
        setPrecision(version, 'major') + wildcard;
}

exports.numParts = numParts;
exports.stringify = stringify;
exports.precisionAdd = precisionAdd;
exports.getPrecision = getPrecision;
exports.setPrecision = setPrecision;
exports.addWildCard = addWildCard;
exports.VERSION_PARTS = VERSION_PARTS;
