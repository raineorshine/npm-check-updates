declare namespace ncu {
  interface RunOptions {
    /**
     * rc config file path (default: directory of `packageFile` or ./ otherwise)
     */
    configFilePath?: string;

    /**
     * rc config file name (default: .ncurc.{json,yml,js})
     */
    configFileName?: string;

    /**
     * Used as current working directory for `spawn` in npm listing
     */
    cwd?: string;

    /**
     * check only a specific section(s) of dependencies:
     * prod|dev|peer|optional|bundle (comma-delimited)
     */
    dep?: string;

    /**
     * upgrade to version which satisfies engines.node range
     */
    enginesNode?: boolean;

    /**
     * set the error-level. 1: exits with error code 0 if no errors occur. 2:
     * exits with error code 0 if no packages need updating (useful for
     * continuous integration). Default is 1.
     */
    errorLevel?: number;

    /**
     * include only package names matching the given string,
     * comma-or-space-delimited list, or /regex/
     */
    filter?: string | string[] | RegExp;

    /**
     * check global packages instead of in the current project
     */
    global?: boolean;

    /**
     * find the highest versions available instead of the latest stable versions
     */
    greatest?: boolean;

    /**
     * Enable interactive prompts for each dependency; implies -u unless one of
     * the json options are set
     */
    interactive?: boolean;

    /**
     * output new package file instead of human-readable message
     */
    jsonAll?: boolean;

    /**
     * Will return output like `jsonAll` but only lists `dependencies`,
     * `devDependencies`, and `optionalDependencies` of the new package data.
     */
    jsonDeps?: boolean;

    /**
     * output upgraded dependencies in json
     */
    jsonUpgraded?: boolean;

    /**
     * what level of logs to report: silent, error, minimal, warn, info,
     * verbose, silly (default: warn)
     */
    loglevel?: string;

    /**
     * do not upgrade newer versions that are already satisfied by the version
     * range according to semver
     */
    minimal?: boolean;

    /**
     * find the newest versions available instead of the latest stable versions
     */
    newest?: boolean;

    /**
     * npm (default) or bower
     */
    packageManager?: string;

    /**
     * include stringified package file (use stdin instead)
     */
    packageData?: string;

    /**
     * package file location (default: ./package.json)
     */
    packageFile?: string;

    /**
     * Include -alpha, -beta, -rc. Default: 0. Default with --newest and
     * --greatest: 1
     */
    pre?: boolean;

    /**
     * Used as current working directory in bower and npm
     */
    prefix?: string;

    /**
     * specify third-party npm registry
     */
    registry?: string;

    /**
     * exclude packages matching the given string, comma-or-space-delimited
     * list, or /regex/
     */
    reject?: string;

    /**
     * remove version ranges from the final package version
     */
    removeRange?: boolean;

    /**
     * don't output anything (--loglevel silent)
     */
    silent?: boolean;

    /**
     * find the highest version within "major" or "minor"
     */
    semverLevel?: string;

    /**
     * a global timeout in ms
     */
    timeout?: number;

    /**
     * overwrite package file
     */
    upgrade?: boolean;
  }

  type RunResults = Record<string, string>;

  function run(options?: RunOptions): Promise<RunResults>;
}

export = ncu;
