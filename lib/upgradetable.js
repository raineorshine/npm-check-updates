var Table = require('cli-table');
var chalk = require('chalk');
var logUpdate = require('log-update')
var elegantSpinner = require('elegant-spinner')
var versionUtil = require('./version-util');

var intervalDelay = 50;

/** Create an empty, borderless table */
function createTable() {
    return new Table({
        colAligns: ['left', 'right', 'right', 'right'],
        chars: {
            'top': '',
            'top-mid': '',
            'top-left': '',
            'top-right': '',
            'bottom': '',
            'bottom-mid': '',
            'bottom-left': '',
            'bottom-right': '',
            'left': '',
            'left-mid': '',
            'mid': '',
            'mid-mid': '',
            'right': '',
            'right-mid': '',
            'middle': ''
        }
    });
}

var UpgradeTable = function (current) {
    this.interval = null;
    this.current = current;
    this.upgraded = {};
    this.spinner = elegantSpinner();
    this.spinnerFrame = this.spinner();
};

/** Create a table that lists current and upgraded dependencies. Includes the current spinner state. */
UpgradeTable.prototype.createDependencyTable = function() {

    var that = this;
    var table = createTable();
    var rows = Object.keys(that.current).map(function (dep) {
        var from = that.current[dep] || '';
        // add five spaces to spinner to make the column width closer to what it will become when the version numbers show up
        var to = that.upgraded[dep] ? versionUtil.colorizeDiff(that.upgraded[dep] || '', from) : '     ' + that.spinnerFrame;
        return [dep, from, '→', to];
    });
    rows.forEach(function (row) {
        table.push(row);
    });
    return table;
}

/** Start the animation */
UpgradeTable.prototype.start = function() {
    var that = this;
    this.interval = setInterval(function () {
        that.spinnerFrame = that.spinner();
        that.log();
    }, intervalDelay);
};

/** Generate a new dependency table and log it using logUpdate */
UpgradeTable.prototype.log = function () {
    // preceding newline is necessary so that the first line doesn't become duplicated if the user hits enter
    logUpdate('\n' + this.createDependencyTable().toString() + '\n');
};

/** Update a single dependency in the table */
UpgradeTable.prototype.update = function(dep, version) {
    this.upgraded[dep] = version;
};

/** Stop the animation */
UpgradeTable.prototype.stop = function() {
    clearInterval(this.interval);
    this.log();
};

module.exports = UpgradeTable;
