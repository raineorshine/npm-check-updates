'use strict';

const chalk = require('chalk');

const stdOutCols = process.stdout.columns || 80;
const warnWord = ' WARNING ';
const padCols = (stdOutCols - warnWord.length) / 2;

const warningHeader = ''.padStart(padCols, '*') + warnWord  + ''.padEnd(padCols, '*');
const warningMessage = "This repository's owner has changed. You are advised to check on the new owner.\nPlease type the new owner's mail address to continue: ...";
const warningFooter = ''.padStart(stdOutCols, '*');

const output = `${chalk.red(warningHeader + '\n' + warningMessage + '\n' + warningFooter)}`;
console.log(output);
