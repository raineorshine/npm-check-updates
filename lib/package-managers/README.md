To add support for another package manager, drop in a module with the following interface:

```
{
    init: (PACKAGE_MANAGER_SPECIFIC_ARGS) => Promise<Boolean> success

    list: () => Promise<{
        dependencies: {
            NAME: {
                name: NAME,
                version: VERSION
            }
        }
    }>
    latest: (String packageName) => Promise<String> version
    greatest: (String packageName) => Promise<String> version
}
```

* latest and greatest are expected to throw `new Error(404)` if the package is not found
