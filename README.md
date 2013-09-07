npm-check-updates
=================

npm-check-updates is a tool that allows you to **instantly find any updates to
all dependencies** in your Node.js project, regardless of the version
constraints you've specified in your package.json file (unlike npm itself).

Optionally, npm-check-updates will also upgrade your package.json file to
satisfy the latest available versions, all while **maintaining your
existing semantic versioning policies**.

Put plainly, it will upgrade your "express": "3.3.x" dependency to
"express": "3.4.x" when express 3.4.0 hits the scene.

Finally you can stick to [package.json best practices](http://blog.nodejitsu.com/package-dependencies-done-right)
and [semantic versioning](http://semver.org/), without having to track
individual package releases. In case you do pin the exact versions, it'll
update those too.

Installation
--------------

```
npm install -g npm-check-updates
```

Example
--------------

Show any new dependencies for the project in the current directory:
```
$ npm-check-updates

Dependency "connect" could be updated to "2.8.x" (latest is 2.8.8)
Dependency "commander" could be updated to "2.0.x" (latest is 2.0.0)

Run 'npm-check-updates -u' to upgrade your package.json automatically

```

Upgrade another project's package.json:
```
$ npm-check-updates -u another-project/

Dependency "request" could be updated to "2.27.x" (latest is 2.27.0)

package.json upgraded

```

Now simply perform the usual "npm update" and verify that your project
works with the upgraded versions.

How new versions are determined
--------------

- Direct dependencies will be increased to the latest available version:
  - 2.0.1 => 2.2.0
  - 1.2 => 1.3
-  Semantic versioning policies for levels are maintained while satisfying the latest version:
  - 1.2.x => 1.3.x
  - 1.x => 2.x
- "Any version" is maintained:
  - \* => \*
- Version constraints are maintained:
  - \>0.2.x => \> 0.3.x
  - \>=1.0.0 => >=1.1.0
- Dependencies newer than the latest available version are suggested to be downgraded, as it's likely a mistake:
  - 2.0.x => 1.7.x, when 1.7.10 is the latest available version
  - 1.1.0 => 1.0.1, when 1.0.1 is the latest available version

Problems?
--------------

Please [file an issue on github](https://github.com/tjunnone/npm-check-updates/issues).
Pull requests are welcome :)
