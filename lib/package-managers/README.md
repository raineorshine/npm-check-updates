To add support for another package manager, drop in a module with the following interface:

```
{
    list: (npmOptions) => Promise<{ NAME: VERSION, ... }>
    latest: (String pkgName) => Promise<String> version
    newest: (String pkgName) => Promise<String> version
    greatest: (String pkgName) => Promise<String> version
    greatestMajor: (String pkgName, String currentVersion) => Promise<String> version
    greatestMinor: (String pkgName, String currentVersion) => Promise<String> version
}
```

* latest and greatest are expected to reject with `'404 Not Found'` if the package is not found
