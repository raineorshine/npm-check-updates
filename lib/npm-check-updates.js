// npm-check-updates
// Tomas Junnonen (c) 2013
//
// Checks a package.json file for updated NPM packages that are *not*
// satisfied by the current package.json dependency declarations.
//
// Example output:
//    Dependency "express" could be updated to "3.3.x" (latest is 3.3.8)
//
// Optionally automatically upgrades the dependencies in package.json
// while maintaining your existing versioning policy.
//
// Example:
//    Your package.json: "express": "3.2.x."
//    Latest version upstream is 3.3.8
//    package.json after upgrade: "express": "3.3.x"
//

var program = require('commander');
var async = require('async');
var fs = require('fs');
var path = require('path');
var vm = require('./versionmanager');

function upgradePackageFile(packageFile, currentDependencies, upgradedDependencies, callback) {
    readPackageFile(packageFile, function (error, packageData) {
        if (error) {
            return callback(error);
        }

        var newPackageData = vm.updatePackageData(packageData, currentDependencies, upgradedDependencies);
        writePackageFile(packageFile, newPackageData, function (error) {
            if (error) {
                return callback(error);
            }
            callback(null);
        });
    });
}

function upgradePackageDefinitions(currentDependencies, callback) {
    var dependencyList = keysToArray(currentDependencies);
    vm.getLatestVersions(dependencyList, function (error, latestVersions) {
        if (error) {
            return callback(error);
        }

        var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions);

        callback(error, upgradedDependencies, latestVersions);
    });
}

function analyzeGlobalPackages() {
    vm.getInstalledPackages(function (error, globalPackages) {
        if (error) {
            return console.error("There was an error reading the global packages: ");
        }

        upgradePackageDefinitions(globalPackages, function (error, upgradedPackages, latestVersions) {
            if (error) {
                return console.error("There was an error determining the latest package versions: " + error);
            }

            print('');
            if (isEmpty(upgradedPackages)) {
                print("All global packages are up to date :)");
            } else {
                for (var package in upgradedPackages) {
                    print('"' + package + '" can be updated from ' +
                        globalPackages[package] + ' to ' + upgradedPackages[package]);
                }
            }
        });
    });
}

function analyzeProjectDependencies(packageFile) {
    async.series({
        current: function (callback) {
            vm.getCurrentDependencies(packageFile, callback);
        },
        installed: function (callback) {
            vm.getInstalledPackages(callback);
        }
    }, function (error, results) {
        if (error) {
            return console.error("There was an error analyzing the dependencies: " + error);
        }

        upgradePackageDefinitions(results.current, function (error, upgradedDependencies, latestVersions) {
            if (error) {
                return console.error("There was an error determining the latest package versions: " + error);
            }

            print('');
            printDependencyUpgrades(results.current, upgradedDependencies, results.installed, latestVersions);

            if (isEmpty(upgradedDependencies) === false) {
                if (program.upgrade) {
                    upgradePackageFile(packageFile, results.current, upgradedDependencies, function (error) {
                        if (error) {
                            return console.error("There was an error writing the package.json file: " + error);
                        }

                        print('\n' + packageFile + " upgraded");
                    });
                } else {
                    print("\nRun 'npm-check-updates -u' to upgrade your package.json automatically");
                }
            }
        });
    });
}

function printDependencyUpgrades(currentDependencies, upgradedDependencies, installedVersions, latestVersions) {
    if (isEmpty(upgradedDependencies)) {
        print("All dependencies match the latest package versions :)");
    } else {
        for (var dependency in upgradedDependencies) {
            print('"' + dependency + '" can be updated from ' +
                currentDependencies[dependency] + ' to ' + upgradedDependencies[dependency] +
                " (Installed: " + (installedVersions[dependency] ? installedVersions[dependency] : "none") + ", Latest: " + latestVersions[dependency] + ")");
        }
    }
}

program
    .version('1.1.1')
    .usage('[options] <package.json or dir>')
    .option('-g, --global', 'check global packages instead of in the current project')
    .option('-s, --silent', "don't output anything")
    .option('-u, --upgrade', 'upgrade package.json dependencies to match latest versions (maintaining existing policy)')
    .parse(process.argv);

if (program.global && program.upgrade) {
    print("npm-check-updates cannot update global packages.");
    print("Run 'npm install -g [package]' to upgrade a global package.");
    process.exit(1);
}

vm.initialize(program.global, function () {
    if (program.global) {
        analyzeGlobalPackages();
    } else {
        var packageFile = 'package.json';

        // Check if a file or directory was specified on the command line
        if (program.args[0] && fs.existsSync(program.args[0])) {
            if (path.basename(program.args[0]) === packageFile)
                packageFile = program.args[0];
            else if (fs.statSync(program.args[0]).isDirectory())
                packageFile = path.join(program.args[0], packageFile);
        } else if (program.args[0]) {
            print(program.args[0] + " is not a valid file or directory");
            process.exit(1);
        }

        if (!fs.existsSync(packageFile)) {
            print("package.json not found");
            process.exit(1);
        }

        analyzeProjectDependencies(packageFile);
    }
});

//
// Helper functions
//

function print(message) {
    if (!program.silent)
        console.log(message);
}

function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

function readPackageFile(fileName, callback) {
    fs.readFile(fileName, {encoding: 'utf8'}, callback);
}

function writePackageFile(fileName, data, callback) {
    fs.writeFile(fileName, data, callback);
}

function keysToArray(o) {
    var list = [];

    for (var key in o) {
        if (o.hasOwnProperty(key)) {
            list.push(key);
        }
    }
    return list;
}
