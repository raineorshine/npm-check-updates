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

program
    .version('1.0.1')
    .usage('[options] <package.json or dir>')
    .option('-s, --silent', "Don't output anything")
    .option('-u, --upgrade', 'Upgrade package.json dependencies with the latest versions while maintaining your versioning policy')
    .parse(process.argv);

vm.initialize(function () {
    var packageFile = 'package.json';

    // Check if a file or directory was specified on the command line
    if (program.args[0] && fs.existsSync(program.args[0])) {
        if (fs.statSync(program.args[0]).isDirectory())
            packageFile = path.join(program.args[0], packageFile);
    } else if (program.args[0]) {
        print(program.args[0] + " is not a valid file or directory");
        process.exit(1);
    }

    if (!fs.existsSync(packageFile)) {
        print("package.json not found");
        process.exit(1);
    }

    vm.getCurrentDependencies(packageFile, function (error, currentDependencies) {
        if (error) {
            return console.error("There was an error reading the package file: " + error);
        }

        var dependencyList = keysToArray(currentDependencies);
        vm.getLatestVersions(dependencyList, function (error, latestVersions) {
            if (error) {
                return console.error("There was an error determining the latest package versions: " + error);
            }

            var upgradedDependencies = vm.upgradeDependencies(currentDependencies, latestVersions);

            if (isEmpty(upgradedDependencies)) {
                print("All dependencies match the latest package versions :)");
            } else {
                print('');
                for (var dependency in upgradedDependencies) {
                    print('Dependency "' + dependency + '" could be updated to "' + upgradedDependencies[dependency] + '" (latest is ' + latestVersions[dependency] + ')');
                }

                if (!program.update) {
                    print("\nRun 'npm-check-updates -u' to upgrade your package.json automatically");
                }

                if (program.update) {
                    upgradePackageFile(packageFile, currentDependencies, upgradedDependencies, function (error) {
                        if (error) {
                            return console.error("There was an error writing the package.json file: " + error);
                        }

                        print('\n' + packageFile + " upgraded");
                    });
                }
            }
        });
    });
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
