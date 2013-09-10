npm-check-updates
=================

npm-check-updates is a tool that allows you to **find all updates to
dependencies** in your Node.js project, regardless of any version
constraints in your package.json file (unlike npm itself).

Optionally, npm-check-updates can also upgrade your package.json file to
satisfy the latest available versions, all while **maintaining your
existing semantic versioning policies**.

Put plainly, it will upgrade your "express": "3.3.x" dependency to
"express": "3.4.x" when express 3.4.0 hits the scene.

npm-check-updates can also show you all available **updates to your globally
installed packages**.

Motivation
--------------

[Package.json best practices](http://blog.nodejitsu.com/package-dependencies-done-right)
recommends maintaining dependencies using a [semantic versioning](http://semver.org/)
policy. In practice you do this by specifying a "1.2.x" style dependency
in your package.json, whereby patch-level updates are automatically allowed
but major and minor releases require manual verification.

Unfortunately, it then becomes your responsibility to find out about new
package releases, for example by using "npm info" command one package at a time,
or by visiting project pages.

Whatever your versioning policy, npm-check-updates will make keeping your
dependencies up to date a breeze.


Installation
--------------

```
npm install -g npm-check-updates
```

Examples
--------------

Show any new dependencies for the project in the current directory:
```
$ npm-check-updates

Dependency "connect" could be updated to 2.8.x
Dependency "commander" could be updated to 2.0.0

Run 'npm-check-updates -u' to upgrade your package.json automatically
```

Check global npm packages for updates:
```
$ npm-check-updates -g

Package "mocha" could be updated to version 1.12.1
```

Upgrade a project's package.json:
```
$ npm-check-updates -u

Dependency "request" could be updated to 2.27.x

package.json upgraded
```

Now simply perform the usual "npm update" and verify that your project
works with the upgraded versions.

History
--------------

- 1.1
  - Added option to check global packages for updates: -g switch
  - Now also checks and upgrades devDependencies in package.json
- 1.0
  - Find and upgrade dependencies maintaining existing versioning policy in package.json

How new package dependency updates are determined
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
