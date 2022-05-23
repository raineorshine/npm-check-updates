# libnpmconfig

[![npm version](https://img.shields.io/npm/v/libnpmconfig.svg)](https://npm.im/libnpmconfig)
[![license](https://img.shields.io/npm/l/libnpmconfig.svg)](https://npm.im/libnpmconfig)
[![Travis](https://img.shields.io/travis/npm/libnpmconfig.svg)](https://travis-ci.org/npm/libnpmconfig)
[![Coverage Status](https://coveralls.io/repos/github/npm/libnpmconfig/badge.svg?branch=latest)](https://coveralls.io/github/npm/libnpmconfig?branch=latest)

[`libnpmconfig`](https://github.com/npm/libnpmconfig) is a Node.js library for
programmatically managing npm's configuration files and data.

## Table of Contents

- [Example](#example)
- [Install](#install)
- [Contributing](#contributing)
- [API](#api)

## Example

```js
const config = require('libnpmconfig')

console.log(
  'configured registry:',
  config.read({
    registry: 'https://default.registry/',
  }),
)
// => configured registry: https://registry.npmjs.org
```

## Install

`$ npm install libnpmconfig`

### Contributing

The npm team enthusiastically welcomes contributions and project participation!
There's a bunch of things you can do if you want to contribute! The
[Contributor Guide](https://github.com/npm/cli/blob/latest/CONTRIBUTING.md)
outlines the process for community interaction and contribution. Please don't
hesitate to jump in if you'd like to, or even ask us questions if something
isn't clear.

All participants and maintainers in this project are expected to follow the
[npm Code of Conduct](https://www.npmjs.com/policies/conduct), and just
generally be excellent to each other.

Please refer to the [Changelog](CHANGELOG.md) for project history details, too.

Happy hacking!

### API

#### `read(cliOpts, builtinOpts)`

Reads configurations from the filesystem and the env and returns a
[`figgy-pudding`](https://npm.im/figgy-pudding) object with the configuration
values.

If `cliOpts` is provided, it will be merged with the returned config pudding,
shadowing any read values. These are intended as CLI-provided options. Do your
own `process.argv` parsing, though.

If `builtinOpts.cwd` is provided, it will be used instead of `process.cwd()` as
the starting point for config searching.
