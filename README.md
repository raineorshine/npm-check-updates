[![npm stable version](https://img.shields.io/npm/v/npm-check-updates.svg?label=stable)](https://npmjs.org/package/npm-check-updates)
<!-- [![npm unstable version](https://img.shields.io/github/tag/tjunnone/npm-check-updates.svg?label=unstable)](https://github.com/tjunnone/npm-check-updates/tags) -->
[![Dependency Status](https://david-dm.org/tjunnone/npm-check-updates.svg)](https://david-dm.org/tjunnone/npm-check-updates)
[![devDependency Status](https://david-dm.org/tjunnone/npm-check-updates/dev-status.svg)](https://david-dm.org/tjunnone/npm-check-updates#info=devDependencies)

npm-check-updates is a command-line tool that allows you to **find the latest versions of dependencies**, regardless of any version
constraints in your package.json file (unlike npm itself).

npm-check-updates can optionally upgrade your package.json file to
use the latest available versions, all while **maintaining your
existing semantic versioning policies**.

Put plainly, it will upgrade your `"express": "^4.11.2"` dependency to
`"express": "^5.0.0"` when express 5.0.0 is released.

Installation
--------------

```sh
npm install -g npm-check-updates
```

Please consider installing the unstable version to help test pre-release features. You may even find [some features](#history) you needed that are not yet in the stable version.

```sh
npm install -g npm-check-updates@unstable
```

Usage
--------------

> *This documentation is for the upcoming v2 release, available on the `unstable` tag. It is recommended that you install the unstable branch in preparation for v2. For documentation for the `stable` tag, please see [v1.5.1](https://github.com/tjunnone/npm-check-updates/tree/a7373782cb9623d44395eabf6382d6791749b16e).*

Show any new dependencies for the project in the current directory:
```sh
$ ncu

"connect" can be updated from ^2.8.0 to ^2.11.0  (Installed: 2.8.8, Latest: 2.11.0)
"commander" can be updated from ^1.3.0 to ^2.0.0 (Installed: 1.3.2, Latest: 2.0.0)

Run with '-u' to upgrade your package.json
```

Upgrade a project's package.json:

> **Make sure your package.json is in version control and all changes have been committed. This *will* overwrite your package.json.**

```sh
$ ncu -u

"request" can be updated from ^2.20.0 to ^2.27.0 (Installed: 2.20.0, Latest: 2.27.1)

package.json upgraded
```

Filter by package name:
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
    -h, --help               output usage information
    -e, --error-level        set the error-level. 1: exits with error code 0 if no
                             errors occur. 2: exits with error code 0 if no
                             packages need updating (useful for continuous
                             integration) (alpha release only)
    -f, --force              force upgrade even when the latest version satisfies
                             the declared semver dependency
    -g, --global             check global packages instead of in the current project
    -j, --jsonAll            output new package.json instead of human-readable
                             message
    --jsonUpgraded           output upgraded dependencies in json
    -p, --prod               check only dependencies (not devDependencies)
    -r, --registry           specify third-party NPM registry
    -s, --silent             don't output anything
    -t, --greatest           find the highest versions available instead of the
                             latest stable versions (alpha release only)
    -u, --upgrade            upgrade package.json dependencies to match latest
                             versions (maintaining existing policy)
    -V, --version            output the version number

Motivation
--------------

[Package.json best practices](http://blog.nodejitsu.com/package-dependencies-done-right) recommends maintaining dependencies using a [semantic versioning](http://semver.org/) policy. In practice you do this by specifying a "^1.2.0" style dependency in your package.json, whereby patch- and minor-level updates are automatically allowed but major releases require manual verification.

Unfortunately, it then becomes your responsibility to find out about new
package releases, for example by using "npm info" command one package at a time, or by visiting project pages.

How dependency updates are determined
--------------

- Direct dependencies will be increased to the latest stable version:
  - 2.0.1 => 2.2.0
  - 1.2 => 1.3
-  Semantic versioning policies for levels are maintained while satisfying the latest version:
  - ^1.2.0 => ^1.3.0
  - 1.x => 2.x
- "Any version" is maintained:
  - \* => \*
- "Greater than" is maintained:
  - \>0.2.0 => \>0.3.0
- Closed ranges are replaced with a wildcard:
  - 1.0.0 \< 2.0.0 => ^3.0.0

History
--------------

- *2.0.0-alpha.10*
  - Move filter from command-line option to argument
  - Add -f/--force option to force upgrades even when the latest version satisfies the declared semver dependency
- *2.0.0-alpha.9*
  - Refactoring
- *2.0.0-alpha.8*
  - Add ncu alias
  - Allow specifying third-party registry with -r/--registry flag
  - Replace callbacks with promises
  - Replace < and <= with ^
  - Add -j/--json and --jsonFlat flags for json output
  - Full unit test coverage!
- *2.0.0-alpha.7*
  - Bug fixes and refactoring
- *2.0.0-alpha5*
  - Add -e/--error-level option
- *2.0.0-alpha4*
  - Add -t/--greatest option to search for the highest versions instead of the default latest stable versions.
- *2.0.0-alpha3*
  - Automatically look for the closest descendant package.json if not found in current directory
- *2.0.0-alpha1*
  - Do not downgrade packages
- 1.5.1
  - Fix bug where package names got truncated (grunt-concurrent -> grunt)
- 1.5
  - Add prod and dev only options
- 1.4
  - Add package filtering option
  - Add mocha as npm test script
- 1.3
  - Handle private packages and NPM errors
  - Added Mocha tests
  - Bugfixes
- 1.2
  - Print currently installed and latest package version in addition to semantic versions
  - Fixed bug where extra whitespace in package.json may prevent automatic upgrade
- 1.1
  - Added option to check global packages for updates: -g switch
  - Now also checks and upgrades devDependencies in package.json
- 1.0
  - Find and upgrade dependencies maintaining existing versioning policy in package.json

Problems?
--------------

Please [file an issue on github](https://github.com/tjunnone/npm-check-updates/issues).

Pull requests are welcome :)
