[![npm](https://badge.fury.io/js/npm-check-updates.svg)](http://badge.fury.io/js/npm-check-updates)
[![Build Status](https://travis-ci.org/tjunnone/npm-check-updates.svg?branch=master)](https://travis-ci.org/tjunnone/npm-check-updates)

> v3 released! See the [release notes](https://github.com/tjunnone/npm-check-updates/releases/tag/v3.0.0) for a description of breaking changes.

**npm-check-updates upgrades your package.json dependencies to the *latest* versions, ignoring specified versions.**

npm-check-updates maintains your existing semantic versioning *policies*, i.e., it will upgrade `"express": "^4.0.0"` to `"express": "^5.0.0"`.

npm-check-updates *only* modifies your package.json file. Run `npm install` to update your installed packages and package-lock.json.

![npm-check-updates-screenshot](https://github.com/tjunnone/npm-check-updates/blob/master/.github/screenshot.png?raw=true)

- Red = major upgrade
- Cyan = minor upgrade
- Green = patch upgrade

You may also want to consider [npm-check](https://github.com/dylang/npm-check). Similar purpose, different features.

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
Checking package.json
[====================] 5/5 100%

 express           4.12.x  →   4.13.x
 multer            ^0.1.8  →   ^1.0.1
 react-bootstrap  ^0.22.6  →  ^0.24.0
 react-a11y        ^0.1.1  →   ^0.2.6
 webpack          ~1.9.10  →  ~1.10.5

Run ncu -u to upgrade package.json
```

Upgrade a project's package file:

> **Make sure your package file is in version control and all changes have been committed. This *will* overwrite your package file.**

```sh
$ ncu -u
Upgrading package.json
[====================] 1/1 100%

 express           4.12.x  →   4.13.x

Run npm install to install new versions.

$ npm install      # update installed packages and package-lock.json
```

Check global packages:

```sh
$ ncu -g           # add -u to get a one-line command for upgrading
```

You can include or exclude specific packages using the `--filter` and `--reject` options. They accept strings, comma-delimited lists, or regular expressions:

```sh
# match mocha and should packages exactly
$ ncu mocha             # shorthand for ncu -f mocha (or --filter)
$ ncu one, two, three

# exclude packages
$ ncu -x nodemon        # shorthand for ncu --reject nodemon

# match packages that start with "gulp-" using regex
$ ncu '/^gulp-.*$/'

# match packages that do not start with "gulp-". Note: single quotes are required
# here to avoid inadvertent bash parsing
$ ncu '/^(?!gulp-).*$/'
```

Options
--------------

    --configFilePath         rc config file path (default: ./)
    --configFileName         rc config file name (default: .ncurc.{json,yml,js})                             
    --dep                    check only a specific section(s) of dependencies:
                             prod|dev|peer|optional|bundle (comma-delimited)
    -e, --error-level        set the error-level. 1: exits with error code 0 if no
                             errors occur. 2: exits with error code 0 if no
                             packages need updating (useful for continuous
                             integration)
    -f, --filter             include only package names matching the given string,
                             comma-delimited list, or regex
    -g, --global             check global packages instead of in the current project
    -i, --interactive        Enable interactive prompts for each dependency
    -j, --jsonAll            output new package file instead of human-readable
                             message
    --jsonUpgraded           output upgraded dependencies in json
    -l, --loglevel           what level of logs to report: silent, error, warn,
                             info, verbose, silly (default: warn)
    -p, --packageManager     npm or bower (default: npm)
    -m, --minimal            do not upgrade to newer versions that are already
                             satisfied by the existing version range (v2 behavior).
    -n, --newest             find the newest published versions available instead
                             of the latest stable versions
    --packageData            include stringified package file (use stdin instead)
    --packageFile            package file location (default: ./package.json)
    --packageFileDir         use same directory as packageFile to compare against
                             installed modules. See #201.
    --pre                    include -alpha, -beta, -rc. Default: 0. Default 
                             with --newest and --greatest: 1.
    -r, --registry           specify third-party NPM registry
    -s, --silent             don't output anything (--loglevel silent)
    --semverLevel            find the highest version within "major" or "minor"
    -t, --greatest           find the highest versions available instead of the
                             latest stable versions
    --removeRange            remove version ranges from the final package version
    --timeout                a global timeout in ms
    -u, --upgrade            overwrite package file
    -x, --reject             exclude packages matching the given string, comma-
                             delimited list, or regex

How dependency updates are determined
--------------

- Direct dependencies will be increased to the latest stable version:
  - `2.0.1` → `2.2.0`
  - `1.2` → `1.3`
  - `0.1.0` → `1.0.1`
  - with `--semverLevel major`
    - `0.1.0` → `0.2.1`
  - with `--semverLevel minor`
    - `0.1.0` → `0.1.2`
-  Semantic versioning policies for levels are maintained while satisfying the latest version:
  - `^1.2.0` → `^2.0.0`
  - `1.x` → `2.x`
- "Any version" is maintained:
  - `*` → `*`
- "Greater than" is maintained:
  - `>0.2.0` → `>0.3.0`
- Closed ranges are replaced with a wildcard:
  - `1.0.0 < 2.0.0` → `^3.0.0`

Configuration Files
--------------
Use a `.ncurc.{json,yml,js}` file to specify configuration information.
You can specify file name and path using `--configFileName` and `--configFilePath`
command line options.

For example, `.ncurc.json`:

```json
{
  "upgrade": true,
  "filter": "express",
  "reject": [
    "@types/estree",
    "ts-node"
  ]
}
```

Module Use
--------------
npm-check-updates can be required:

```js
const ncu = require('npm-check-updates');

ncu.run({
    // Any command-line option can be specified here.
    // These are set by default:
    jsonUpgraded: true,
    packageManager: 'npm',
    silent: true
}).then((upgraded) => {
    console.log('dependencies to upgrade:', upgraded);
});
```

Known Issues
--------------

- Windows: If npm-check-updates hangs, run `ncu --loglevel verbose` to see if it is waiting for stdin. If so, try setting the package file explicitly: `ncu -g --packageFile package.json`. See [#136](https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102).

Also search the [issues page](https://github.com/tjunnone/npm-check-updates/issues).


Problems?
--------------

Please [file an issue](https://github.com/tjunnone/npm-check-updates/issues)! But always [search existing issues](https://github.com/tjunnone/npm-check-updates/issues?utf8=%E2%9C%93&q=is%3Aissue) first!
