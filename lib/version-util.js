'use strict';
const semverutils = require('semver-utils');
const _ = require('lodash');
const chalk = require('chalk');
const util = require('util');
const semver = require('semver');

const VERSION_BASE_PARTS = ['major', 'minor', 'patch'];
const VERSION_ADDED_PARTS = ['release', 'build'];
const VERSION_PARTS = [].concat(VERSION_BASE_PARTS, VERSION_ADDED_PARTS);
const VERSION_PART_DELIM = {
    major: '',
    minor: '.',
    patch: '.',
    release: '-',
    build: '+'
};
const WILDCARDS = ['^', '~', '.*', '.x'];
const WILDCARDS_PURE = ['^', '~', '^*', '*', 'x', 'x.x', 'x.x.x'];
const WILDCARD_PURE_REGEX = new RegExp(`^(${WILDCARDS_PURE.join('|')
    .replace(/\^/g, '\\^')
    .replace(/\*/g, '\\*')})$`);
const SEMANTIC_DIRECT = new RegExp('^\\d+\\.\\d+\\.\\d+([-|+].*)*$');

/**
 * @param {string} version
 * @returns {number} The number of parts in the version
 */
function numParts(version) {

    const [semver] = semverutils.parseRange(version);

    if (!semver) {
        throw new Error(util.format('semverutils.parseRange returned null when trying to parse "%s". This is probably a problem with the "semver-utils" dependency. Please report an issue at https://github.com/tjunnone/npm-check-updates/issues.', version));
    }

    return _.intersection(VERSION_PARTS, Object.keys(semver)).length;
}

/**
 * Increases or decreases the given precision by the given amount, e.g. major+1 -> minor
 * @param {string} precision
 * @param {number} n
 * @returns {string}
 */
function precisionAdd(precision, n) {

    if (n === 0) {
        return precision;
    }

    const index = n === 0 ? precision :
        VERSION_BASE_PARTS.includes(precision) ? VERSION_BASE_PARTS.indexOf(precision) + n :
            VERSION_ADDED_PARTS.includes(precision) ? VERSION_BASE_PARTS.length + n :
                null;

    if (index === null) {
        throw new Error(`Invalid precision: ${precision}`);
    }
    if (!VERSION_PARTS[index]) {
        throw new Error(`Invalid precision math${arguments}`);
    }

    return VERSION_PARTS[index];
}

/**
 * Joins the major, minor, patch, release, and build parts (controlled by an
 * optional precision arg) of a semver object into a dot-delimited string.
 * @param semver
 * @param {string} [precision]
 * @returns {string}
 */
function stringify(semver, precision) {

    // get a list of the parts up until (and including) the given precision
    // or all of them, if no precision is specified
    const parts = precision ? VERSION_PARTS.slice(0, VERSION_PARTS.indexOf(precision)+1) : VERSION_PARTS;

    // pair each part with its delimiter and join together
    return parts
        .filter(part => {
            return VERSION_BASE_PARTS.includes(precision) || semver[part];
        })
        .map(part => {
            return VERSION_PART_DELIM[part] + (semver[part] || '0');
        })
        .join('');
}

/**
 * Gets how precise this version number is (major, minor, patch, release, or build)
 * @param {string} version
 * @returns {string}
 */
function getPrecision(version) {
    const [semver] = semverutils.parseRange(version);
    // expects VERSION_PARTS to be in correct order
    return VERSION_PARTS.slice().reverse().find(_.propertyOf(semver));
}

/**
 * Sets the precision of a (loose) semver to the specified level: major, minor, etc.
 * @param {string} version
 * @param {string} [precision]
 * @returns {string}
 */
function setPrecision(version, precision) {
    const [semver] = semverutils.parseRange(version);
    return stringify(semver, precision);
}

/**
 * Adds a given wildcard (^,~,.*,.x) to a version number. Adds ^ and ~ to the
 * beginning. Replaces everything after the major version number with .* or .x
 * @param {string} version
 * @param {string} wildcard
 * @returns {string}
 */
function addWildCard(version, wildcard) {
    return wildcard === '^' || wildcard === '~' ?
        wildcard + version :
        setPrecision(version, 'major') + wildcard;
}

/**
 * Returns true if the given string is one of the wild cards.
 * @param {string} version
 * @returns {boolean}
 */
function isWildCard(version) {
    return WILDCARD_PURE_REGEX.test(version);
}

/**
 * Returns true if the given digit is a wildcard for a part of a version.
 * @param {"*"|"x"} versionPart
 * @returns {boolean}
 */
function isWildPart(versionPart) {
    return versionPart === '*' || versionPart === 'x';
}

/**
 * Colorize the parts of a version string (to) that are different than
 * another (from). Assumes that the two verson strings are in the same format.
 * @param from
 * @param to
 * @returns {string}
 */
function colorizeDiff(from, to) {
    let leadingWildcard = '';

    // separate out leading ^ or ~
    if (/^[~^]/.test(to) && to[0] === from[0]) {
        leadingWildcard = to[0];
        to = to.slice(1);
        from = from.slice(1);
    }

    // split into parts
    const partsToColor = to.split('.');
    const partsToCompare = from.split('.');

    let i = partsToColor.findIndex((part, i) => part !== partsToCompare[i]);
    i = i >= 0 ? i : partsToColor.length;

    // major = red (or any change before 1.0.0)
    // minor = cyan
    // patch = green
    const color = i === 0 || partsToColor[0] === '0' ? 'red' :
        i === 1 ? 'cyan' :
            'green';

    // if we are colorizing only part of the word, add a dot in the middle
    const middot = i > 0 && i < partsToColor.length ? '.' : '';

    return leadingWildcard +
        partsToColor.slice(0,i).join('.') +
        middot +
        chalk[color](partsToColor.slice(i).join('.'));
}

/**
 * @param versions  Array of all available versions
 * @param current   Current version
 * @param level     major/minor
 * @returns {string}         String representation of the suggested version. If the current version
 * is not direct then returns null
 */
function findGreatestByLevel(versions, current, level) {
    if (!SEMANTIC_DIRECT.test(current)) {
        return null;
    }

    const cur = semverutils.parse(current);
    return _.chain(versions)
        .map(v => {
            return {
                string: v,
                parsed: semverutils.parse(v)
            };
        })
        .filter(o => {
            if (level === 'minor' && o.parsed.major !== cur.major) {
                return false;
            }
            return o.parsed[level] === cur[level];
        })
        .map(o => {
            return o.string;
        })
        .last()
        .value();
}

/** Comparator used to sort semver versions */
function compareVersions(a, b) {
    return semver.gt(a, b) ? 1 : a === b ? 0 : -1;
}

/**
 * @param {String} version
 * @returns {boolean} True if the version is any kind of prerelease: alpha, beta, rc, pre
 */
function isPre(version) {
    return getPrecision(version) === 'release';
}

module.exports = {
    compareVersions,
    numParts,
    stringify,
    precisionAdd,
    getPrecision,
    setPrecision,
    addWildCard,
    isPre,
    isWildCard,
    isWildPart,
    colorizeDiff,
    findGreatestByLevel,
    VERSION_BASE_PARTS,
    VERSION_ADDED_PARTS,
    VERSION_PARTS,
    WILDCARDS
};
