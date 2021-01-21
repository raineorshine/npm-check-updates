# Changelog

This file documents all **major version** releases. For other releases, you'll have to read the [commit history](https://github.com/raineorshine/npm-check-updates/).

## [11.0.0] - 2021-01-20

### Breaking

- `--packageFile` - Now interprets its argument as a glob pattern. It is possible that a previously supplied argument may be interepreted differently now (though I'm not aware of specific instances). Due to our conservative release policy we are releasing as a major version upgrade and allowing developers to assess for themselves.

### Features

- `--deep` - Run recursively in current working directory. Alias of `--packageFile '**/package.json'`.

See: [#785](https://github.com/raineorshine/npm-check-updates/issues/785)

<https://github.com/raineorshine/npm-check-updates/compare/v10.3.1...v11.0.0>

## [10.0.0] - 2020-11-08

### Breaking

- Specifiying both the `--filter` option and argument filters will now throw an error. Use one or the other. Previously the arguments would override the `--filter` option, which made for a confusing result when accidentally not quoting the option in the shell. This change is only breaking for those who are relying on the incorrect behavior of argument filters overriding `--filter`.

See: [#759](https://github.com/raineorshine/npm-check-updates/issues/759#issuecomment-723587297)

<https://github.com/raineorshine/npm-check-updates/compare/v9.2.4...v10.0.0>

## [9.0.0] - 2020-09-10

### Breaking

- Versions marked as `deprecated` in npm are now ignored by default. If the latest version is deprecated, the next highest non-deprecated version will be suggested. Use `--deprecated` to include deprecated versions (old behavior).

<https://github.com/raineorshine/npm-check-updates/compare/v8.1.1...v9.0.0>

## [8.0.0] - 2020-08-29

### Breaking

- `--semverLevel major` is now `--target minor`. `--semverLevel minor` is now `--target patch`. This change was made to provide more intuitive semantics for `--semverLevel` (now `--target`). Most people assumed it meant the inclusive upper bound, so now it reflects that. [a2111f4c2](https://github.com/raineorshine/npm-check-updates/commits/a2111f4c2)
- Programmatic usage: `run` now defaults to `silent: true` instead of `loglevel: 'silent`, unless `loglevel` is explicitly specified. If you overrode `silent` or `loglevel`, this may affect the logging behavior. [423e024](https://github.com/raineorshine/npm-check-updates/commits/423e024)

### Deprecated

Options that controlled the target version (upper bound) of upgrades have been consolidated under `--target`. The old options are aliased with a deprecation warning and will be removed in the next major version. No functionality has been removed.

- `--greatest`: Renamed to `--target greatest`
- `--newest`: Renamed to `--target newest`
- `--semverLevel`: Renamed to `--target`

See: [7eca5bf3](https://github.com/raineorshine/npm-check-updates/commits/7eca5bf3)

### Features

#### Doctor Mode

[#722](https://github.com/raineorshine/npm-check-updates/pull/722)

Usage: `ncu --doctor [-u] [options]`

Iteratively installs upgrades and runs tests to identify breaking upgrades. Add `-u` to execute (modifies your package file, lock file, and node_modules).

To be more precise:

1. Runs `npm install` and `npm test` to ensure tests are currently passing.
2. Runs `ncu -u` to optimistically upgrade all dependencies.
3. If tests pass, hurray!
4. If tests fail, restores package file and lock file.
5. For each dependency, install upgrade and run tests.
6. When the breaking upgrade is found, saves partially upgraded package.json (not including the breaking upgrade) and exits.

Example:

```sh
$ ncu --doctor -u
npm install
npm run test
ncu -u
npm install
npm run test
Failing tests found:
/projects/myproject/test.js:13
  throw new Error('Test failed!')
  ^
Now let’s identify the culprit, shall we?
Restoring package.json
Restoring package-lock.json
npm install
npm install --no-save react@16.0.0
npm run test
  ✓ react 15.0.0 → 16.0.0
npm install --no-save react-redux@7.0.0
npm run test
  ✗ react-redux 6.0.0 → 7.0.0
Saving partially upgraded package.json
```

#### Github URLs

Added support for GitHub URLs.

See: [f0aa792a4](https://github.com/raineorshine/npm-check-updates/commits/f0aa792a4)

Example:

```json
{
  "dependencies": {
    "chalk": "https://github.com/chalk/chalk#v2.0.0"
  }
}
```

#### npm aliases

Added support for npm aliases.

See: [0f6f35c](https://github.com/raineorshine/npm-check-updates/commits/0f6f35c)

Example:

```json
{
  "dependencies": {
    "request": "npm:postman-request@2.88.1-postman.16"
  }
}
```

#### Owner Changed

[#621](https://github.com/raineorshine/npm-check-updates/pull/621)

Usage: `ncu --ownerChanged`

Check if the npm user that published the package has changed between current and upgraded version.

Output values:

- Owner changed: `*owner changed*`
- Owner has not changed: *no output*
- Owner information not available: `*unknown*`

Example:

```sh
$ ncu --ownerChanged
Checking /tmp/package.json
[====================] 1/1 100%

 mocha  ^7.1.0  →  ^8.1.3  *owner changed*

Run ncu -u to upgrade package.json
```

### Commits

<https://github.com/raineorshine/npm-check-updates/compare/v7.1.1...v8.0.0>

## [7.0.0] - 2020-06-09

### Breaking

- Removed bower support (4e4b47fd3bb567435b456906d0106ef442bf46fe)

### Patch

- Fix use of "<" with single digit versions (f04d00e550ce606893bee77b78ef2a0b2a50246a)

### Other

- Change eslint configuration
- Update dependencies
- Replace cint methods with native methods
- Add CI via GitHub Actions workflow

<https://github.com/raineorshine/npm-check-updates/compare/v6.0.2...v7.0.0>

## [6.0.0] - 2020-05-14

### Breaking

- `--semverLevel` now supports version ranges. This is a breaking change since version ranges are no longer ignored by `--semverLevel`, which may result in some dependencies having new suggested updates.

If you are not using `--semverLevel`, NO CHANGE! 😅

<https://github.com/raineorshine/npm-check-updates/compare/v5.0.0...v6.0.0>

## [5.0.0] - 2020-05-11

### Breaking

~node >= 8~
node >= 10.17

Bump minimum node version to `v10.17.0` due to `move-file` #651

If `ncu` was working for you on `v4.x`, then `v5.0.0` will still work. Just doing a major version bump since ncu's officially supported node version is changing. `v4` should be patched to be compatible with node `v8`, but I'll hold off unless someone requests it.

<https://github.com/raineorshine/npm-check-updates/compare/v4.1.2...v5.0.0>

## [4.0.0] - 2019-12-10

ncu v3 excluded prerelease versions (`-alpha`, `-beta`, etc) from the remote by default, as publishing prerelease versions to `latest` is unconventional and not recommended. Prereleases versions can be included by specifying `--pre` (and is implied in options `--greatest` and `--newest`).

However, when you are already specifying a prerelease version in your package.json dependencies, then clearly you want ncu to find newer prerelease versions. This is now default in v4, albeit with the conservative approach of sticking to the `latest` tag.

### Migration

No effect for most users.

If a prerelease version is published on the `latest` tag, and you specify a prerelease version in your package.json, ncu will now suggest upgrades for it.

If a prerelease version is published on a different tag, there is no change from ncu v3; you will still need `--pre`, `--greatest`, or `--newest` to get prerelease upgrades.

<https://github.com/raineorshine/npm-check-updates/compare/v3.2.2...v4.0.0>

## [3.0.0] - 2019-03-07

### Breaking

#### node < 8 deprecated

The required node version has been updated to allow the use of newer Javascript features and reduce maintenance efforts for old versions.

#### System npm used

In ncu v2, an internally packaged npm was used for version lookups. When this became out-of-date and differed considerably from the system npm problems would occur. In ncu v3, the system-installed npm will be used for all lookups. This comes with the maintenance cost of needing to upgrade ncu whenever the output format of npm changes.

#### Installed modules ignored

In ncu v2, out-of-date dependencies in package.json that were installed up-to-date (e.g. `^1.0.0` specified and `1.0.1` installed) were ignored by ncu. Installed modules are now completely ignored and ncu only consider your package.json. This change was made to better match users’ expectations.

#### Existing version ranges that satisfy latest are ignored (-a by default)

In ncu v2, if you had `^1.0.0` in your package.json, a newly released `1.0.1` would be ignored by ncu. The logic was that `^1.0.0` is a range that includes `1.0.1`, so you don’t really need to change the version specified in your package.json, you just need to run `npm update`. While logical, that turned out to be quite confusing to users. In ncu v3, the package.json will always be upgraded if there is a newer version (same as `-a` in v2). The old default behavior is available via the `--minimal` option.

#### Prerelease versions ignored

In ncu v2, any version published to the `latest` tag was assumed to be a stable release version. In practice, occasional package authors would accidentally or unconventionally publish `-alpha`, `-beta`, and `-rc` versions to the `latest` tag. While I still consider this a bad practice, ncu v3 now ignores these prerelease versions by default to better match users’ expectations. The old behavior is available via the `--pre 1` option. (When `--newest` or `--greatest` are set, `--pre 1` is set by default, and can be disabled with `--pre 0`).

#### Options changed: `-m`, `--prod`, `--dev`, `--peer`

In order to only target one or more dependency sections, ncu now uses the `--dep` option instead of separate options for each section.

`--prod` is now `--dep prod`
`--dev` is now `--dep dev`
`--dev --peer` is now `--dep dev,peer` etc

The `--packageManager` alias has changed from `-m` to `-p` to make room for `--minimal` as `-m`.

<https://github.com/raineorshine/npm-check-updates/compare/v2.15.0...v3.0.0>

## [2.0.0] - 2005-08-14

v2 has a few important differences from v1:

- Newer published versions that satisfy the specified range are _not_ upgraded by default (e.g. `1.0.0` to `1.1.0`). This change was made because `npm update` handles upgrades within the satisfied range just fine, and npm-check-updates is primarily intended to provide functionality not otherwise provided by npm itself. These satisfied dependencies will still be shown when you run npm-check-updates, albeit with a short explanation. **For the old behavior, add the -ua/--upgradeAll option.**
- The command-line argument now specifies a package name filter (e.g. `ncu /^gulp-/`). For the old behavior (specifying an alternative package.json), pipe the package.json through stdin.
- Use the easier-to-type `ncu` instead of `npm-check-updates`. `npm-check-updates` is preserved for backwards-compatibility.
- Allow packageData to be specified as an option
- Colored table output
- Add -a/--upgradeAll
- Add -e/--error-level option
- Add -j/--json and --jsonFlat flags for json output
- Add -r/--registry option for specifying third-party npm registry
- Add -t/--greatest option to search for the highest versions instead of the default latest stable versions.
- Remove -f/--filter option and move to command-line argument
- Replace < and <= with ^
- Automatically look for the closest descendant package.json if not found in current directory
- Add ncu alias
- Export functionality to allow for programmatic use
- Bug fixes and refactoring
- Full unit test coverage!

<https://github.com/raineorshine/npm-check-updates/compare/v1.5.1...v2.0.0>
