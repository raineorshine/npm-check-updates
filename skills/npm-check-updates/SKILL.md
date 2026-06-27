---
name: npm-check-updates
description: Upgrade package.json dependencies to the latest versions with npm-check-updates (ncu). Use when the user wants to check for outdated dependencies, upgrade package versions, filter or reject specific packages, target a specific version range (latest, greatest, minor, patch, semver, @tag), scan a single or multiple package files (--deep, --workspaces, --packageFile), run interactive selection (--interactive), detect breaking upgrades by running tests after each bump (--doctor), defend against supply-chain attacks with --cooldown, query private or alternate registries, or use the programmatic API from a .ncurc.js config or a Node module.
---

# npm-check-updates (ncu)

`npm-check-updates` upgrades your `package.json` dependencies to the latest versions while preserving your existing version-range policy (`^17.0.2` → `^18.3.1`). It only modifies `package.json`; the user must run their package manager's install command (e.g. `npm install`) to update `package-lock.json` and `node_modules`.

The CLI is exposed as `npm-check-updates` and the shorter `ncu`. The library is dual ESM/CJS, importable from Node.

## When to reach for this skill

- Listing outdated dependencies in a project.
- Bumping versions in `package.json` to the newest available (dry run, interactive, or write to disk).
- Bulk-upgrading with filters, rejections, peer-dependency awareness, or engine constraints.
- Scanning monorepos (workspaces, `--deep`, custom globs).
- Safer upgrades via cooldown windows or the iterative `--doctor` mode.
- Driving ncu programmatically from a Node script or a `.ncurc.*` config.

## Quick start

```sh
# Dry run: print upgrades without touching files.
ncu

# Write the upgrades back into package.json, then install.
ncu -u
npm install

# Interactively pick which packages to upgrade.
ncu -i

# Only a subset of packages.
ncu -f "react,react-dom"
ncu "/^@types\//"

# Bump only patch / minor versions.
ncu --target patch
ncu --target minor

# Skip a package.
ncu -x typescript,eslint
```

## Critical flags

| Flag                       | Purpose                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `-u, --upgrade`            | Overwrite `package.json` (required for non-dry-run behaviour).                                                                    |
| `-i, --interactive`        | Pick packages from a checklist. Implies `-u` unless a JSON output is set.                                                         |
| `-t, --target <value>`     | `latest` (default), `newest`, `greatest`, `minor`, `patch`, `semver`, or `@<tag>` (e.g. `@next`, `@beta`).                        |
| `-f, --filter <p>`         | Include only matching names. Accepts strings, wildcards, globs, comma or space lists, `/regex/`, or a predicate (in `.ncurc.js`). |
| `-x, --reject <p>`         | Exclude matching names. Same matcher syntax as `--filter`. Prefix `!` works on positional args (`ncu \!nodemon`).                 |
| `-g, --global`             | Inspect globally installed packages instead of the local project.                                                                 |
| `-p, --packageManager <s>` | `npm`, `yarn`, `pnpm`, `deno`, `bun`, or `staticRegistry`.                                                                        |
| `-d, --doctor`             | Iteratively install and test each upgrade to isolate breaking changes. Requires `-u`.                                             |
| `-c, --cooldown <period>`  | Skip versions published within the window. `7` / `7d` days, `12h` hours, `30m` minutes. Mitigates supply-chain risk.              |
| `--peer`                   | Respect peer-dependency constraints when picking a version.                                                                       |
| `--enginesNode`            | Only consider versions compatible with the project's `engines.node`.                                                              |
| `--deep`                   | Recurse into every `package.json` under the cwd.                                                                                  |
| `-w, --workspaces`         | Operate on every workspace (npm, yarn, pnpm). Pair with `--no-root` to exclude the root.                                          |
| `--workspace <s>`          | Operate on the named workspace(s). Pair with `--no-root` to exclude the root.                                                     |
| `--packageFile <p>`        | Override the default `package.json` location. Accepts globs (`packages/*/package.json`).                                          |
| `-j, --jsonAll`            | Output the new full `package.json`.                                                                                               |
| `--jsonDeps`               | Like `--jsonAll` but only the dependency fields.                                                                                  |
| `--jsonUpgraded`           | Output the upgraded dependencies as JSON.                                                                                         |
| `--format <value>`         | Comma list: `dep`, `group`, `ownerChanged`, `repo`, `time`, `lines`, `installedVersion`, `cooldown`.                              |
| `-l, --loglevel <n>`       | `silent`, `error`, `minimal`, `warn` (default), `info`, `verbose`, `silly`.                                                       |
| `-e, --errorLevel <n>`     | `1` (default) or `2`. `2` is CI-friendly: exit 0 when nothing needs updating.                                                     |
| `--cache`                  | Cache registry lookups. Default file: `~/.ncu-cache.json`. Default TTL: 10 minutes.                                               |
| `--cacheFile <path>`       | Cache file path.                                                                                                                  |
| `--cacheExpiration <min>`  | Cache TTL in minutes.                                                                                                             |
| `--registry <uri>`         | Custom registry.                                                                                                                  |
| `--registryType <type>`    | `npm` (default) or `json` (a static JSON catalog).                                                                                |
| `--install <value>`        | `always`, `never`, or `prompt` (default). Run install after `-u`?                                                                 |
| `--pre <n>`                | Include prerelease versions. Auto-enabled for `--target newest` or `greatest` and when the current version is prerelease.         |
| `--minimal`                | Skip upgrades whose range already satisfies the latest per semver.                                                                |
| `--removeRange`            | Strip the range operator and pin to the exact version.                                                                            |
| `--timeout <ms>`           | Global timeout. Per-request default: 30 seconds.                                                                                  |
| `--retry <n>`              | Retries on failed registry requests (default: 3).                                                                                 |
| `--doctorInstall <cmd>`    | Override install command used by `--doctor`.                                                                                      |
| `--doctorTest <cmd>`       | Override test command used by `--doctor`.                                                                                         |
| `--mergeConfig`            | With `--deep` or a glob, merge each found config with the root config.                                                            |
| `--root`                   | Include the root project alongside the specified workspaces.                                                                      |
| `--stdin`                  | Read `package.json` from stdin.                                                                                                   |
| `--packageData <value>`    | Pass `package.json` content as a string.                                                                                          |

## Config file (`.ncurc.*`)

`ncu` reads config from these locations (later overrides earlier): CLI flags → local `.ncurc.*` → project `.ncurc.*` → `$HOME/.ncurc.*`.

Supported file types: `.ncurc`, `.ncurc.json`, `.ncurc.yaml`, `.ncurc.yml`, `.ncurc.js`, `.ncurc.mjs`, `.ncurc.cjs`.

From v21 the project is pure ESM, so `.ncurc.js` should use ESM `export default`; CJS configs must use `.cjs`.

A `.ncurc.js` is also the only place to use predicate functions, e.g.:

```js
export default {
  filter: name => !name.startsWith('internal-'),
  reject: ['@types/*'],
  target: 'minor',
  cooldown: 7,
  doctor: false,
}
```

## Programmatic API

```ts
import * as ncu from 'npm-check-updates'

const upgraded = await ncu.run({
  packageFile: './packages/app/package.json',
  filter: ['react', 'react-dom'],
  target: 'latest',
  upgrade: true, // write back to disk
})

console.log(upgraded) // { 'react': '^18.3.1', 'react-dom': '^18.3.1' }
```

Run it via `tsx` (the repo is pure ESM):

```sh
tsx ./scripts/check-deps.ts
```

## Recommended workflows

### Safest upgrade path

1. Ensure the working tree is committed.
2. Run `ncu --cooldown 7` to skip recently published versions.
3. Run `ncu -u` to write updates.
4. Run `npm install` (or the equivalent for the active package manager).
5. Run the test suite and commit if green.

### Detect breaking upgrades automatically

```sh
ncu --doctor -u
```

Reverts broken upgrades one at a time and prints the offender.

### Monorepos

```sh
# All workspaces, including the root.
ncu -uw

# All packages.json files under the cwd.
ncu --deep -u

# A specific glob, merging root config.
ncu --packageFile 'packages/*/package.json' --mergeConfig -u
```

### Custom registry / private mirror

```sh
ncu --registry https://npm.example.com --packageManager npm

# Or a static JSON catalog hosted anywhere.
ncu --registry https://example.com/versions.json --registryType json
```

## Pitfalls and gotchas

- `ncu` only writes `package.json`. Lockfile and `node_modules` updates require a separate install step.
- `--doctor` modifies the lockfile and `node_modules`. Use a clean tree.
- The default CLI name `ncu` collides with `ncu-weather-cli` and Nvidia CUDA's `ncu` on some systems. Fall back to `npm-check-updates` if output is unexpected.
- On Windows, prefer `--packageFile package.json` if `ncu` appears to hang. It is sometimes waiting for stdin.
- The cooldown value is read from `min-release-age` (npm), `npmMinimalAgeGate` (yarn), or `pnpm-workspace.yaml`'s `minimumReleaseAge` (pnpm) when `--cooldown` is not given.
- Pure ESM since v21.0.0. `.ncurc.js` must be ESM (`export default`); CJS configs need `.cjs` extension.
- `--format cooldown` requires registry time data. Some mirrors do not expose it. Use a public registry if nothing is reported.

## Verification cheatsheet

```sh
# Show all CLI options.
ncu --help

# Extended help for a single flag.
ncu --help --filter
ncu --help --target
ncu --help --cooldown
ncu --help --doctor
```
