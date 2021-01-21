To add support for another package manager, drop in a module with the following interface.

```js
{
  *list: (npmOptions: {}) => Promise<{ name: version }>,
  *latest: (pkgName: string) => Promise<String> version,
  newest: (pkgName: string) => Promise<String> version,
  greatest: (pkgName: string) => Promise<String> version,
  minor: (pkgName: string, String currentVersion) => Promise<String> version,
  patch: (pkgName: string, String currentVersion) => Promise<String> version,
}
```

- `list` and `latest` are required.
- Methods corresponding to other `--target` values are optional.
- Methods are expected to reject with `'404 Not Found'` if the package is not found.
