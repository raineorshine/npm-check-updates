declare namespace ncu {

  interface RunOptions {

    /**
     * Force color in terminal
     */
    color?: boolean;

    /**
     * Max number of concurrent HTTP requests to registry. (default: 8)
     */
    concurrency?: number;

    /**
     * Config file name (default: .ncurc.{json,yml,js})
     */
    configFileName?: string;

    /**
     * Directory of .ncurc config file (default: directory of `packageFile`).
     */
    configFilePath?: string;

    /**
     * Working directory in which npm will be executed.
     */
    cwd?: string;

    /**
     * Run recursively in current working directory. Alias of (--packageFile '**\/package.json').
     */
    deep?: boolean;

    /**
     * Check one or more sections of dependencies only: dev, optional, peer, prod, bundle (comma-delimited).
     */
    dep?: string;

    /**
     * Include deprecated packages.
     */
    deprecated?: boolean;

    /**
     * Iteratively installs upgrades and runs tests to identify breaking upgrades. Run "ncu --doctor" for detailed help. Add "-u" to execute.
     */
    doctor?: boolean;

    /**
     * Include only packages that satisfy engines.node as specified in the package file.
     */
    enginesNode?: boolean;

    /**
     * Set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration). (default: 1)
     */
    errorLevel?: number;

    /**
     * Include only package names matching the given string, wildcard, glob, comma-or-space-delimited list, or /regex/.
     */
    filter?: string | string[] | RegExp;

    /**
     * Filter on package version using comma-or-space-delimited list, or /regex/.
     */
    filterVersion?: string | string[] | RegExp;

    /**
     * Enable additional output data, string or comma-delimited list: ownerChanged, repo. ownerChanged: shows if the package owner changed between versions. repo: infers and displays links to source code repository. (default: [])
     */
    format?: string[];

    /**
     * Check global packages instead of in the current project.
     */
    global?: boolean;

    /**
     * DEPRECATED. Renamed to "--target greatest".
     * @deprecated
     */
    greatest?: boolean;

    /**
     * Enable interactive prompts for each dependency; implies -u unless one of the json options are set,
     */
    interactive?: boolean;

    /**
     * Output new package file instead of human-readable message.
     */
    jsonAll?: boolean;

    /**
     * Like `jsonAll` but only lists `dependencies`, `devDependencies`, `optionalDependencies`, etc of the new package data.
     */
    jsonDeps?: boolean;

    /**
     * Output upgraded dependencies in json.
     */
    jsonUpgraded?: boolean;

    /**
     * Amount to log: silent, error, minimal, warn, info, verbose, silly. (default: "warn")
     */
    loglevel?: string;

    /**
     * Merges nested configs with the root config file for --deep or --packageFile options (default: false)').
     */
    mergeConfig?: boolean;

    /**
     * Do not upgrade newer versions that are already satisfied by the version range according to semver.
     */
    minimal?: boolean;

    /**
     * DEPRECATED. Renamed to "--target newest".
     * @deprecated
     */
    newest?: boolean;

    /**
     * DEPRECATED. Renamed to "--format ownerChanged".
     * @deprecated
     */
    ownerChanged?: boolean;

    /**
     * Package file data (you can also use stdin).
     */
    packageData?: string;

    /**
     * Package file(s) location (default: ./package.json).
     */
    packageFile?: string;

    /**
     * npm, yarn (default: "npm")
     */
    packageManager?: string;

    /**
     * Check peer dependencies of installed packages and filter updates to compatible versions. Run "ncu --help --peer" for details.
     */
    peer?: boolean;

    /**
     * Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1).
     */
    pre?: boolean;

    /**
     * Current working directory of npm.
     */
    prefix?: string;

    /**
     * Third-party npm registry.
     */
    registry?: string;

    /**
     * Exclude packages matching the given string, wildcard, glob, comma-or-space-delimited list, or /regex/.
     */
    reject?: string | string[] | RegExp;

    /**
     * Exclude package.json versions using comma-or-space-delimited list, or /regex/.
     */
    rejectVersion?: string | string[] | RegExp;

    /**
     * Remove version ranges from the final package version.
     */
    removeRange?: boolean;

    /**
     * DEPRECATED. Renamed to --target.
     * @deprecated
     */
    semverLevel?: string;

    /**
     * Don't output anything (--loglevel silent).
     */
    silent?: boolean;

    /**
     * Target version to upgrade to: latest, newest, greatest, minor, patch. Run "ncu --help --target" for details.` (default: "latest")
     */
    target?: string;

    /**
     * Global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch).
     */
    timeout?: number;

    /**
     * Overwrite package file with upgraded versions instead of just outputting to console.
     */
    upgrade?: boolean;

  }

  type RunResults = Record<string, string>

  function run(options?: RunOptions): Promise<RunResults>
}

export = ncu
