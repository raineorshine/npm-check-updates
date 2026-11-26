# Deployment Instructions

- Have you created tests?
- Have you updated the README?

```bash
npm version [minor]
git push && git push --tags
npm ci
npm publish [--tag unstable]
```

- Run `npm ci` before publishing so the published bundle is built from a clean
  install of the lockfile. Publishing from a stale `node_modules` can bundle
  outdated dependency code (v23.1.1 shipped a pre-4.0.0 `spawn-please` and
  crashed with an unhandled rejection whenever the post-upgrade install
  failed — see #2144).

- Update the release history
  <https://github.com/raineorshine/npm-check-updates/releases>
