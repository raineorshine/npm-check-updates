[![NPM version](https://badge.fury.io/js/npm-check-updates.svg)](http://badge.fury.io/js/npm-check-updates)
[![Build Status](https://travis-ci.org/tjunnone/npm-check-updates.svg?branch=master)](https://travis-ci.org/tjunnone/npm-check-updates)

npm-check-updates is a command-line tool that allows you to upgrade your package.json or bower.json dependencies to the latest versions, regardless of existing version constraints.

npm-check-updates maintains your existing semantic versioning *policies*, i.e., it will upgrade your `"express": "^4.11.2"` dependency to `"express": "^5.0.0"` when express 5.0.0 is released.

![npm-check-updates-screenshot](https://cloud.githubusercontent.com/assets/750276/8864534/0788a4d8-3171-11e5-9881-8f7dcf634d14.png)

![Question](http://www.virginmobileusa.com/_img/2012/icon-questionmark-small.gif) Having issues? Check out [known issues](#known-issues) first. Then check the [issues page](https://github.com/tjunnone/npm-check-updates/issues).

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
    -f, --filter             include only package names matching the given string,
                             comma-delimited list, or regex
    -g, --global             check global packages instead of in the current project
    -h, --help               output usage information
    -m, --packageManager     npm or bower (default: npm)
    -r, --registry           specify third-party NPM registry
    -u, --upgrade            overwrite package file
    -x, --reject             exclude packages matching the given string, comma-
                             delimited list, or regex
    -V, --version            output the version number

Advanced Options
--------------

Do not use these unless you know what you are doing! Not needed for typical usage.

    -d, --dev                check only devDependencies
    -e, --error-level        set the error-level. 1: exits with error code 0 if no
                             errors occur. 2: exits with error code 0 if no
                             packages need updating (useful for continuous
                             integration)
    -j, --jsonAll            output new package file instead of human-readable
                             message
    --jsonUpgraded           output upgraded dependencies in json
    -l, --loglevel           what level of logs to report: silent, error, warn,
                             info, verbose, silly (default: warn)
    -p, --prod               check only dependencies (not devDependencies)
    --packageData            include stringified package file (use stdin instead)
    --packageFile            package file location (default: ./package.json)
    --packageFileDir         use same directory as packageFile to compare against
                             installed modules. See #201.
    --configFilePath         rc config file path (default: ./)
    --configFileName         rc config file name (default: .ncurc.{json,yml,js})                             
    -n, --newest             find the newest published versions available instead
                             of the latest stable versions
    -o, --optional           check only optionalDependencies
    --peer                   check only peerDependencies
    -s, --silent             don't output anything (--loglevel silent)
    --semverLevel            find the highest version within "major" or "minor"
    -t, --greatest           find the highest versions available instead of the
                             latest stable versions
    -a, --upgradeAll         include even those dependencies whose latest
                             version satisfies the declared semver dependency
    --removeRange            remove version ranges from the final package version
    --timeout                a global timeout in ms

Configuration Files
--------------
Use a `.ncurc.{json,yml,js}` file to specify configuration information.
You can specify file name and path using `--configFilePath` and `--configFilePath`
command line options.

Integration
--------------
The tool allows integration with 3rd party code:

```js
const ncu = require('npm-check-updates');

ncu.run({
    // Always specify the path to the package file
    packageFile: 'package.json',
    // Any command-line option can be specified here.
    // These are set by default:
    silent: true,
    jsonUpgraded: true
}).then((upgraded) => {
    console.log('dependencies to upgrade:', upgraded);
});
```

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

Why is it not updating ^1.0.0 to ^1.0.1 when 1.0.1 is the latest?
--------------
`^1.0.0` is a *range* that will includes all non-major updates. If you run `npm update`, it will install `1.0.1` without changing the dependency listed in your package file. You don't need to update your package file if the latest version is satisfied by the specified dependency range. If you *really* want to upgrade your package file (even though it's not necessary), you can run `ncu --upgradeAll`.

Docker
------

Docker volumes can be used to easily update a package:

```bash
docker run -it --rm -v $(pwd)/package.json:/app/package.json creack/ncu -u -a
```

Known Issues
--------------

- `ncu -g` incorrectly report that all packages are up-to-date. This is due to an [issue in npm v3](npm/npm#9564) in which dead symlinks break `npm ls -g`. See [#235](https://github.com/tjunnone/npm-check-updates/issues/235#issuecomment-219314327) for a workaround (TLDR; Delete the dead symlinks). For others, it was an issue with the npm prefix path. Try `PREFIX="/usr/local/" ncu -g` ([#146](https://github.com/tjunnone/npm-check-updates/issues/146#issuecomment-155758303)).

- In some environments (Windows) npm-check-updates may hang. Run `ncu --loglevel verbose` to see if it is waiting for stdin. If so, try setting the package file explicitly: `ncu -g --packageFile package.json`. See [#136](https://github.com/tjunnone/npm-check-updates/issues/136#issuecomment-155721102).

- There is an issue with [grunt-shell](https://github.com/sindresorhus/grunt-shell) described in [#119](https://github.com/tjunnone/npm-check-updates/issues/119). TLDR; You have to explicitly specify your package file with `ncu --packageFile package.json`.

- `Cannot find module 'proto-list'`. This error is occurring for many people, yet it cannot be consistently reproduced. It seems to be fixed by fresh installs of node and npm: "I reinstalled node 4.2.1 and npm 2.14.7. Installed ncu, and it worked fine. So I'm afraid I'm not able to reproduce the issue anymore." See [#144](https://github.com/tjunnone/npm-check-updates/issues/144#issuecomment-148499121).

Development Notes
--------------

The following of dependencies should *not* be upgraded as they have breaking changes that are currently untenable to fix. This is internal to npm-check-updates. You are welcome to use and upgrade these dependencies in your project.

- `"find-up": "1.1.2"`
- `"chai": "^3.5.0"`
- `"chai-as-promised": "^6.0.0"`


Problems?
--------------

Please [file an issue](https://github.com/tjunnone/npm-check-updates/issues) on github!
