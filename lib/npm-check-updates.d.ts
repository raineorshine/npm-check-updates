declare namespace ncu {

  interface RunOptions {

    /** max number of concurrent HTTP requests to registry. (default: 8) */
    concurrency?: number;

    /** rc config file path (default: directory of `packageFile` or ./ otherwise) */
    configFilePath?: string;

    /** rc config file name (default: .ncurc.{json,yml,js}) */
    configFileName?: string;

    /** working directory in which npm will be executed */
    cwd?: string;

    /** check only a specific section(s) of dependencies: prod, dev, peer, optional, bundle (comma-delimited) */
    dep?: string;

    /** include only packages that satisfy engines.node as specified in the package file */
    enginesNode?: boolean;

    /** set the error level. 1: exits with error code 0 if no errors occur. 2: exits with error code 0 if no packages need updating (useful for continuous integration). (default: 1) */
    errorLevel?: number;

    /** include only package names matching the given string, comma-or-space-delimited list, or /regex/ */
    filter?: string | string[] | RegExp;

    /** check global packages instead of in the current project */
    global?: boolean;

    /** find the highest versions available instead of the latest stable versions (--target greatest) */
    greatest?: boolean;

    /** Enable interactive prompts for each dependency; implies -u unless one of the json options are set */
    interactive?: boolean;

    /** output new package file instead of human-readable message */
    jsonAll?: boolean;

    /** Will return output like `jsonAll` but only lists `dependencies`, `devDependencies`, and `optionalDependencies` of the new package data. */
    jsonDeps?: boolean;

    /** output upgraded dependencies in json */
    jsonUpgraded?: boolean;

    /** what level of logs to report: silent, error, minimal, warn, info, verbose, silly (default: "warn") */
    loglevel?: string;

    /** do not upgrade newer versions that are already satisfied by the version range according to semver */
    minimal?: boolean;

    /** find the newest versions available instead of the latest stable versions (--target newest) */
    newest?: boolean;

    /** npm, yarn (default: "npm") */
    packageManager?: string;

    /** include stringified package file (use stdin instead) */
    packageData?: boolean;

    /** package file location (default: ./package.json) */
    packageFile?: string;

    /** Include -alpha, -beta, -rc. (default: 0; default with --newest and --greatest: 1) */
    pre?: boolean;

    /** Used as current working directory in npm */
    prefix?: string;

    /** specify third-party npm registry */
    registry?: string;

    /** remove version ranges from the final package version */
    removeRange?: boolean;

    /** don't output anything (--loglevel silent) */
    silent?: boolean;

    /** target version to upgrade to: latest, newest, greatest, minor, patch (default: "latest") */
    target?: string;

    /** global timeout in milliseconds. (default: no global timeout and 30 seconds per npm-registery-fetch) */
    timeout?: number;

    /** overwrite package file */
    upgrade?: boolean;

    /** exclude packages matching the given string, comma-or-space-delimited list, or /regex/ */
    reject?: string | string[] | RegExp;

  }

  type RunResults = Record<string, string>

  function run(options?: RunOptions): Promise<RunResults>
}

export = ncu
