[![npm stable version](https://img.shields.io/npm/v/npm-check-updates.svg?label=npm)](https://npmjs.org/package/npm-check-updates)
[![Build Status](https://travis-ci.org/tjunnone/npm-check-updates.svg)](https://travis-ci.org/tjunnone/npm-check-updates)
<!--[![Dependency Status](https://david-dm.org/tjunnone/npm-check-updates.svg)](https://david-dm.org/tjunnone/npm-check-updates)-->
<!--[![devDependency Status](https://david-dm.org/tjunnone/npm-check-updates/dev-status.svg)](https://david-dm.org/tjunnone/npm-check-updates#info=devDependencies)-->
<!-- [![npm unstable version](https://img.shields.io/github/tag/tjunnone/npm-check-updates.svg?label=unstable)](https://github.com/tjunnone/npm-check-updates/tags) -->

npm-check-updates is a command-line tool that allows you to upgrade your package.json or bower.json dependencies to the latest versions, regardless of existing version constraints.

npm-check-updates maintains your existing semantic versioning *policies*, i.e., it will upgrade your `"express": "^4.11.2"` dependency to `"express": "^5.0.0"` when express 5.0.0 is released.

![npm-check-updates-screenshot](https://cloud.githubusercontent.com/assets/750276/8864534/0788a4d8-3171-11e5-9881-8f7dcf634d14.png)

**![Question](http://www.virginmobileusa.com/_img/2012/icon-questionmark-small.gif) Do you think bower support should be part of npm-check-updates, or a separate package? [We need your input!](https://github.com/tjunnone/npm-check-updates/issues/148)**

Installation
--------------

```sh
npm install -g npm-check-updates
```

Usage
--------------
Show any new dependencies for the project in the current directory:

```sh
$ ncu

 express           4.12.x  →   4.13.x
 multer            ^0.1.8  →   ^1.0.1
 react-bootstrap  ^0.22.6  →  ^0.24.0
 react-a11y        ^0.1.1  →   ^0.2.6
 webpack          ~1.9.10  →  ~1.10.5

Run with -u to upgrade your package.json
```

Upgrade a project's package file:

> **Make sure your package file is in version control and all changes have been committed. This *will* overwrite your package file.**

```sh
$ ncu -u

 express           4.12.x  →   4.13.x

package.json upgraded
```

Works with bower:
```sh
$ ncu -m bower     # will use bower.json and check versions in bower
```

Include or exclude specific packages:
```sh
# match mocha and should packages exactly
$ ncu mocha,should

# match packages that start with "gulp-" using regex
$ ncu /^gulp-/

# match packages that do not start with "gulp-". Note: single quotes are required
# here to avoid inadvertant bash parsing
$ ncu '/^(?!gulp-).*$/'
```

Options
--------------
    -d, --dev                check only devDependencies
    -e, --error-level        set the error-level. 1: exits with error code 0 if no
                             errors occur. 2: exits with error code 0 if no
                             packages need updating (useful for continuous
                             integration)
    -g, --global             check global packages instead of in the current project
    -h, --help               output usage information
    -j, --jsonAll            output new package file instead of human-readable
                             message
    --jsonUpgraded           output upgraded dependencies in json
    --packageData            include stringified package file (use stdin instead)
    --packageFile            package file location (default: ./package.json)
    -m, --packageManager     npm or bower (default: npm)
    -o, --optional           check only optionalDependencies
    -p, --prod               check only dependencies (not devDependencies)
    -r, --registry           specify third-party NPM registry
    -s, --silent             don't output anything
    -t, --greatest           find the highest versions available instead of the
                             latest stable versions (alpha release only)
    -u, --upgrade            overwrite package file
    -a, --upgradeAll         include even those dependencies whose latest
                             version satisfies the declared semver dependency
    -V, --version            output the version number

Integration
--------------
The tool allows integration with 3rd party code:

```javascript
var ncu = require('npm-check-updates');

ncu.run({
    packageFile: 'package.json',
    // Any command-line option can be specified here.
    // These are set by default:
    // silent: true,
    // jsonUpgraded: true
}).then(function(upgraded) {
    console.log('dependencies to upgrade:', upgraded);
});
```

How dependency updates are determined
--------------

- Direct dependencies will be increased to the latest stable version:
  - `2.0.1` → `2.2.0`
  - `1.2` → `1.3`
-  Semantic versioning policies for levels are maintained while satisfying the latest version:
  - `^1.2.0` → `^2.0.0`
  - `1.x` → `2.x`
- "Any version" is maintained:
  - `*` → `*`
- "Greater than" is maintained:
  - `>0.2.0` → `>0.3.0`
- Closed ranges are replaced with a wildcard:
  - `1.0.0 < 2.0.0` → `^3.0.0`

Why is it not updating ^1.0.0 to ^1.0.1 when 1.0.1 is the latest?
--------------
`^1.0.0` is a *range* that will includes all non-major updates. If you run `npm update`, it will install `1.0.1` without changing the dependency listed in your package file. You don't need to update your package file if the latest version is satisfied by the specified dependency range. If you *really* want to upgrade your package file (even though it's not necessary), you can run `ncu --upgradeAll`. 

History
--------------

See the github [releases](https://github.com/tjunnone/npm-check-updates/releases).

For help migrating from v1 to v2, see the [v2 release notes](https://github.com/tjunnone/npm-check-updates/releases/tag/v2.0.0).

Compatibility Issues
--------------

- There is an issue with [grunt-shell](https://github.com/sindresorhus/grunt-shell) described in [#119](https://github.com/tjunnone/npm-check-updates/issues/119). TLDR; You have to explicitly specify your package file with `ncu --packageFile package.json`. 

Problems?
--------------

Please [file an issue](https://github.com/tjunnone/npm-check-updates/issues) on github! [Contributors](https://github.com/metaraine/) are responsive and happy to assist.

When filing an issue, always include the dependencies from your package file (or the output from `npm -g ls --depth=0` if using global mode)!

Pull requests are welcome, and will not collect dust :)
