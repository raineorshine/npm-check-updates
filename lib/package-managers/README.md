To add support for another package manager, drop in a module with the following interface:

```
{
    list: (npmOptions) => Promise<{
        NAME: VERSION
    }>
    latest: (String packageName) => Promise<String> version
    newest: (String packageName) => Promise<String> version
    greatest: (String packageName) => Promise<String> version
    greatestMajor: (String packageName, String currentVersion) => Promise<String> version
    greatestMinor: (String packageName, String currentVersion) => Promise<String> version
}
```

* latest and greatest are expected to reject with `'404 Not Found'` if the package is not found
