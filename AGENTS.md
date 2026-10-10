# npm-check-updates

A CLI and Node library that upgrades `package.json` dependencies to the latest versions while preserving the
project's version-range policy. Pure ESM, TypeScript, bundled with Vite. See
[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for the development setup, the design guidelines that decide
whether a feature is in scope, and how to add a CLI option.

## Gates

```sh
npm test          # tsc --noEmit, then the unit suite, then test/e2e.sh
npm run lint      # lockfile, types, markdown, eslint — in parallel
npm run prettier  # prettier . --check
```

`npm run test:unit` (`npx vitest run`) is the fast inner loop and finishes in well under a minute; pass test paths to
narrow it. Everything above should be green on `main` — a failure is yours, so do not write it off as pre-existing
without reverting your change and re-running the failing files.

## Node version and `engine-strict`

`.npmrc` sets `engine-strict=true`, so `npm ci` and `npm install` **refuse** to run on a node outside
`engines.node` instead of warning. The range has a gap inside a major (`^22.22.2 || ^24.15.0 || >=26.0.0`), so a node
that looks new enough can still be rejected — 24.8 fails, 24.17 passes. Check `node -v` against `engines.node` before
debugging an install failure.

## `.npmrc` silently applies a cooldown to every local run

`.npmrc` also sets `min-release-age=7`, and ncu adopts npm's `min-release-age` as `--cooldown` whenever `--cooldown`
is not given ([src/lib/initOptions.ts](src/lib/initOptions.ts)). So **every ncu run launched from inside this repo
gets a 7-day cooldown**, which holds back the newest version of each package and prints `[cooldown]` markers.

Neither `--cwd` nor `--configFilePath` suppresses it: `findNpmConfig` in
[src/package-managers/npm.ts](src/package-managers/npm.ts) resolves `.npmrc` with `findUpSync` from the **process**
working directory and memoizes the result, while the pnpm and yarn equivalents honour `--cwd`. Pass `--cooldown 0`,
or launch from the fixture directory, when a run must see the true latest versions.

The same `.npmrc` key makes every `npm` and `npx` invocation print
`npm warn Unknown project config "min-release-age"`. It is noise, not a failure.

## Reproducing a bug report

1. Read the issue with `gh api repos/raineorshine/npm-check-updates/issues/<n>` — the body carries the reporter's
   `package.json`, `.ncurc`, and command output.
2. Write their `package.json` (and `.ncurc.json`, if they have one) into a scratch directory.
3. Run the CLI straight from TypeScript source against it — no build step:

   ```sh
   node src/bin/cli.ts --cwd <dir> --packageFile <dir>/package.json --configFilePath <dir> --cooldown 0
   ```

   `--configFilePath` pointed at a nonexistent path disables the config file, so options can be reintroduced one at a
   time on the command line until a single one reproduces the symptom. Attribute the symptom to an option by toggling
   it, not by reading the code — much of ncu's resolution is recursive and option-coupled.

## Tests never hit the registry

Unit tests stub the npm registry instead of fetching from it. The helpers in `test/helpers/` are the vocabulary:

| Helper                  | Use                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `stubVersions.ts`       | Spy on `npmApi.fetchUpgradedPackumentMemo`; `spawn: true` passes mocks to a child ncu via env |
| `createMockVersion.ts`  | Build a packument with versions, publish times, and dist-tags                                 |
| `silenceProgressBar.ts` | Required whenever `loglevel` is neither `silent` nor `verbose`, or the bar writes to stdout   |
| `makeTempDir.ts`        | Every temp directory a test needs                                                             |

Mock a module directly (`vi.mock`) when the behaviour under test depends on a value changing between calls — see
[docs/peer-dependencies.md](docs/peer-dependencies.md) for the peer recursion's version of this.

## Git

`origin` is the canonical remote, alongside contributor fork remotes (`github-desktop-*`) that are not push targets.
A fresh branch has no upstream, so push with `git push -u origin <branch>`.

PRs are squash-merged, so the merge subject is the PR title with `(#NNNN)` appended: write an imperative subject that
names the behaviour change, not the mechanism. In the body, state the cause, the symptom a user sees, and why the
cases you did not change are unaffected, then `Fixes #<issue>`.

## Docs

- [docs/peer-dependencies.md](docs/peer-dependencies.md) — how `--peer` resolution actually works, why its output can
  name a package no peer blocked, and how to drive the recursion from a test.
