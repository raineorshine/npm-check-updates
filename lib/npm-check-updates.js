var program = require('commander');
var async = require('async');
var cint = require('cint');
var fs = require('fs');
var path = require('path');
var vm = require('./versionmanager');
var closestPackage = require('closest-package');
var _ = require('lodash');


//
// Helper functions
//

var print = program.silent ? _.noop : console.log;
var readPackageFile = cint.partialAt(fs.readFile, 1, 'utf8');
var writePackageFile = fs.writeFile;

//
// Main functions
//

function upgradePackageFile(packageFile, currentDependencies, upgradedDependencies, callback) {
    readPackageFile(packageFile, function (error, packageData) {
        if (error) return callback(error);

        var newPackageData = vm.updatePackageData(packageData, currentDependencies, upgradedDependencies);
        writePackageFile(packageFile, newPackageData, callback);
    });
}

function upgradePackageDefinitions(currentDependencies, callback) {
    var dependencyList = Object.keys(currentDependencies);
    vm.getLatestVersions(
        dependencyList,
        {
            versionTarget: program.greatest ? 'greatest' : 'latest',
            registry: program.registry ? program.registry : null,
        },
        function (error, latestVersions, failedDependencies) {
            if (error) return callback(error);

            var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions);

            callback(error, upgradedDependencies, latestVersions, failedDependencies);
        }
    );
}

function analyzeGlobalPackages() {
    vm.getInstalledPackages(function (error, globalPackages) {
        if (error) {
            console.error("There was an error reading the global packages: ");
            process.exit(1);
        }

        upgradePackageDefinitions(globalPackages, function (error, upgradedPackages, latestVersions) {
            if (error) {
                console.error("There was an error determining the latest package versions: " + error);
                process.exit(1);
            }

            print('');
            if (_.isEmpty(upgradedPackages)) {
                print("All global packages are up to date :)");
            } else {
                for (var package in upgradedPackages) {
                    print('"' + package + '" can be updated from ' +
                        globalPackages[package] + ' to ' + upgradedPackages[package]);
                }
                if(program.errorLevel >= 2) {
                    process.exit(1);
                }
            }
        });
    });
}

function analyzeProjectDependencies(packageFile) {
    async.series({
        current: function (callback) {
            vm.getCurrentDependencies(packageFile, {
                filter: program.filter,
                prod: program.prod,
                dev: program.dev
            }, callback);
        },
        installed: vm.getInstalledPackages
    }, function (error, results) {
        if (error) {
            console.error("There was an error analyzing the dependencies: " + error);
            process.exit(1);
        }

        upgradePackageDefinitions(results.current, function (error, upgradedDependencies, latestVersions, failedDependencies) {
            if (error) {
                console.error("There was an error determining the latest package versions: " + error);
                process.exit(1);
            }

            print('');
            printDependencyUpgrades(results.current, upgradedDependencies, results.installed, latestVersions, failedDependencies);

            if (!_.isEmpty(upgradedDependencies)) {
                if (program.upgrade) {
                    upgradePackageFile(packageFile, results.current, upgradedDependencies, function (error) {
                        if (error) {
                            console.error("There was an error writing the package.json file: " + error);
                            process.exit(1);
                        }

                        print('\n' + packageFile + " upgraded");
                    });
                } else {
                    print("\nRun with '-u' to upgrade your package.json");
                }
                if(program.errorLevel >= 2) {
                    process.exit(1);
                }
            }
        });
    });
}

function printDependencyUpgrades(currentDependencies, upgradedDependencies, installedVersions, latestVersions, failedDependencies) {

    var superlative = program.greatest ? "Greatest" : "Latest";

    for (var failedDependency in failedDependencies) {
        print('Unable to determine updates for "' + failedDependency + '": ' + failedDependencies[failedDependency]);
    }

    if (_.isEmpty(upgradedDependencies)) {
        print("All dependencies match the latest package versions :)");
    } else {
        for (var dependency in upgradedDependencies) {
            print('"' + dependency + '" can be updated from ' +
                currentDependencies[dependency] + ' to ' + upgradedDependencies[dependency] +
                " (Installed: " + (installedVersions[dependency] ? installedVersions[dependency] : "none") + ", " + superlative + ": " + latestVersions[dependency] + ")");
        }
    }
}

//
// Program
//

program
    .version(require('../package').version)
    .usage('[options] <package.json or dir>')
    .option('-d, --dev', 'check only devDependencies')
    .option('-e, --error-level <n>', 'set the error-level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration). Default is 1.', cint.partialAt(parseInt, 1, 10), 1)
    .option('-f, --filter <packages>', 'list or regex of package names to search (all others will be ignored). Note: single quotes may be required to avoid inadvertant bash parsing.')
    .option('-g, --global', 'check global packages instead of in the current project')
    .option('-p, --prod', 'check only dependencies (not devDependencies)')
    .option('-s, --silent', "don't output anything")
    .option('-t, --greatest', "find the highest versions available instead of the latest stable versions")
    .option('-u, --upgrade', 'upgrade package.json dependencies to match latest versions (maintaining existing policy)')
    .option('--registry <url>', 'specify third-party npm registry')
    .parse(process.argv);

var execName = path.basename(process.argv[1]);
if(execName === 'npm-check-updates') {
    print('You can now use the alias "ncu" for less typing!');
}

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
        } else {
            packageFile = closestPackage.sync(process.cwd());
            packageInSameDir = false;
        }

        var relPathToPackage = path.relative(process.cwd(), packageFile);

        if (!fs.existsSync(packageFile)) {
            print("package.json not found");
            process.exit(1);
        }

        // print a message if we are using a descendant package.json
        if(relPathToPackage !== 'package.json') {
            print('Using ' + relPathToPackage);
        }

        analyzeProjectDependencies(packageFile);
    }
});
