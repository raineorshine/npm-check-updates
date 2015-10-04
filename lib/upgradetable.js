var Table = require('cli-table');
var chalk = require('chalk');
var logUpdate = require('log-update')
var elegantSpinner = require('elegant-spinner')
var versionUtil = require('./version-util');

var interval;
var intervalDelay = 50;

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

UpgradeTable.prototype.createDependencyTable = function() {

    var that = this;
    var table = createTable();
    var rows = Object.keys(that.current).map(function (dep) {
        var from = that.current[dep] || '';
        var to = that.upgraded[dep] ? versionUtil.colorizeDiff(that.upgraded[dep] || '', from) : that.spinnerFrame;
        return [dep, from, '→', to];
    });
    rows.forEach(function (row) {
        table.push(row);
    });
    return table;
}

UpgradeTable.prototype.start = function() {
    var that = this;
    this.interval = setInterval(function () {
        that.spinnerFrame = that.spinner();
        that.log();
    }, intervalDelay);
};

UpgradeTable.prototype.log = function () {
    logUpdate(this.createDependencyTable().toString());
};

UpgradeTable.prototype.update = function(dep, version) {
    this.upgraded[dep] = version;
};

UpgradeTable.prototype.stop = function() {
    this.log();
    clearInterval(this.interval);
};

module.exports = UpgradeTable;
