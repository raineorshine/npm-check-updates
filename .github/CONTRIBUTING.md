## Filing an issue

Make sure you read the list of [known issues](https://github.com/raineorshine/npm-check-updates#known-issues) and search for [similar issues](https://github.com/raineorshine/npm-check-updates/issues) before filing an issue.

## Known Issues

- If `ncu` prints output that does not seem related to this package, it may be conflicting with another executable such as `ncu-weather-cli` or Nvidia CUDA. Try using the long name instead: `npm-check-updates`.
- Windows: If npm-check-updates hangs, try setting the package file explicitly: `ncu --packageFile package.json`. You can run `ncu --loglevel verbose` to confirm that it was incorrectly waiting for stdin. See [#136](https://github.com/raineorshine/npm-check-updates/issues/136#issuecomment-155721102).

When filing an issue, please include:

- node version
- npm version
- npm-check-updates version
- the relevant package names and their specified versions from your package file
- ...or the output from `npm -g ls --depth=0` if using global mode

## Executable Stack Trace

The Vite Build uses SSR to bundle all dependencies for efficiency. There currently is no source map for `./build/cli.js`. To execute npm-check-updates with an accurate stack trace run the following

```sh
git clone https://github.com/raineorshine/npm-check-updates /MY_PROJECTS
npx tsx /MY_PROJECTS/npm-check-updates/src/bin/cli.ts
```

## Design Guidelines

The _raison d'être_ of npm-check-updates is to upgrade package.json dependencies to the latest versions, ignoring specified versions. Suggested features that do not fit within this objective will be considered out of scope.

npm-check-updates maintains a balance between minimalism and customizability. The default execution with no options will always produce simple, clean output. If you would like to add additional information to ncu's output, you may propose a new value for the `--format` option.

## Adding a new CLI or module option

All of ncu's options are generated from [/src/cli-options.ts](https://github.com/raineorshine/npm-check-updates/blob/main/src/cli-options.ts). You can add a new option to this file and then run `npm run build` to automatically generate README, CLI help text, and Typescript definitions.
