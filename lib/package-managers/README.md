To add support for another package manager, drop in a module with the following interface:

```
{
    init: (PACKAGE_MANAGER_SPECIFIC_ARGS) => Promise<null> fulfilled if successful

    list: () => Promise<{
        dependencies: {
            NAME: {
                name: NAME,
                version: VERSION
            }
        }
    }>
    latest: (String packageName) => Promise<String> version
    newest: (String packageName) => Promise<String> version
    greatest: (String packageName) => Promise<String> version
    greatestMajor: (String packageName, String currentVersion) => Promise<String> version
    greatestMinor: (String packageName, String currentVersion) => Promise<String> version
}
```

* latest and greatest are expected to throw `new Error(404)` if the package is not found
