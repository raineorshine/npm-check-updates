## Filing an issue

Make sure you read the list of [known issues](https://github.com/raineorshine/npm-check-updates#known-issues) and search for [similar issues](https://github.com/raineorshine/npm-check-updates/issues) before filing an issue.

When filing an issue, please include:

- node version
- npm version
- npm-check-updates version
- the relevant package names and their specified versions from your package file
- ...or the output from `npm -g ls --depth=0` if using global mode

## Design

The _raison d'être_ of npm-check-updates is to upgrade package.json dependencies to the latest versions, ignoring specified versions. Suggested features that do not fit within this objective will be considered out of scope.

npm-check-updates maintains a balance between minimalism and customizability. The default execution with no options will always produce simple, clean output. If you would like to add additional information to ncu's output, you may propose a new value for the `--format` option.

## Adding a new CLI or module option

All of ncu's options are generated from [/src/cli-options.ts](https://github.com/raineorshine/npm-check-updates/blob/main/src/cli-options.ts). You can add a new option to this file and then run `npm run build` to automatically generate README, CLI help text, and Typescript definitions.
