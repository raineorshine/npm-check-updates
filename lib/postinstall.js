'use strict';

const chalk = require('chalk');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const stdOutCols = process.stdout.columns || 80;
const warnWord = ' WARNING ';
const padCols = (stdOutCols - warnWord.length) / 2;

const warningHeader = ''.padStart(padCols, '*') + warnWord  + ''.padEnd(padCols, '*');
const warningMessage = "This repository's owner has changed. You are advised to check on the new owner.\nPlease type the new owner's mail address to continue: ...";
const warningFooter = ''.padStart(stdOutCols, '*');

const output = `${chalk.red(warningHeader + '\n' + warningMessage + '\n' + warningFooter)}`;

async function getOwners() {
    const {stdout} = await exec('npm owner ls npm-check-updates');
    if (stdout) {
        return stdout.trim().split('\n');
    }
    return null;
}

getOwners().then(val => {
    if (val) {
        console.log(JSON.stringify(val, null, 2));
        console.log(output);
    }
});

