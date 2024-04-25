import isString from 'lodash/isString'
import path from 'path'
import prompts from 'prompts-ncu'
import spawn from 'spawn-please'
import { cliOptionsMap } from './cli-options'
import { cacheClear } from './lib/cache'
import chalk, { chalkInit } from './lib/chalk'
import determinePackageManager from './lib/determinePackageManager'
import doctor from './lib/doctor'
import exists from './lib/exists'
import findPackage from './lib/findPackage'
import getAllPackages from './lib/getAllPackages'
import getNcuRc from './lib/getNcuRc'
import initOptions from './lib/initOptions'
import { print, printJson } from './lib/logging'
import mergeOptions from './lib/mergeOptions'
import programError from './lib/programError'
import runGlobal from './lib/runGlobal'
import runLocal from './lib/runLocal'
import { Index } from './types/IndexType'
import { Options } from './types/Options'
import { PackageFile } from './types/PackageFile'
import { PackageInfo } from './types/PackageInfo'
import { RunOptions } from './types/RunOptions'
import { VersionSpec } from './types/VersionSpec'

// allow prompt injection from environment variable for testing purposes
if (process.env.INJECT_PROMPTS) {
  prompts.inject(JSON.parse(process.env.INJECT_PROMPTS))
}

// Exit with non-zero error code when there is an unhandled promise rejection.
// Use `node --trace-uncaught ...` to show where the exception was thrown.
// See: https://nodejs.org/api/process.html#event-unhandledrejection
process.on('unhandledRejection', (reason: string | Error) => {
  // do not rethrow, as there may be other errors to print out
  console.error(reason)
})

/**
 * Volta is a tool for managing JavaScript tooling like Node and npm. Volta has
 * its own system for installing global packages which circumvents npm, so
 * commands like `npm ls -g` do not accurately reflect what is installed.
 *
 * The ability to use `npm ls -g` is tracked in this Volta issue: https://github.com/volta-cli/volta/issues/1012
 */
const noVolta = (options: Options) => {
  // The first check is for macOS/Linux and the second check is for Windows
  if (options.global && (!!process.env.VOLTA_HOME || process.env.PATH?.includes('\\Volta'))) {
    const message =
      'It appears you are using Volta. `npm-check-updates --global` ' +
      'cannot be used with Volta because Volta has its own system for ' +
      'managing global packages which circumvents npm.\n\n' +
      'If you are still receiving this message after uninstalling Volta, ' +
      'ensure your PATH does not contain an entry for Volta and your ' +
      'shell profile does not define VOLTA_HOME. You may need to reboot ' +
      'for changes to your shell profile to take effect.'

    print(options, message, 'error')
    process.exit(1)
  }
}

/** Returns the package manager that should be used to install packages after running "ncu -u". Detects pnpm via pnpm-lock.yaml. This is the one place that pnpm needs to be detected, since otherwise it is backwards compatible with npm. */
const getPackageManagerForInstall = async (options: Options, pkgFile: string) => {
  // when packageManager is set to staticRegistry, we need to infer the package manager from lock files
  if (options.packageManager === 'staticRegistry') determinePackageManager({ ...options, packageManager: undefined })
  else if (options.packageManager !== 'npm') return options.packageManager
  const cwd = options.cwd ?? pkgFile ? `${pkgFile}/..` : process.cwd()
  const pnpmDetected = await exists(path.join(cwd, 'pnpm-lock.yaml'))
  return pnpmDetected ? 'pnpm' : 'npm'
}

/** Returns if analysis contains upgrades */
const someUpgraded = (pkgs: string[], analysis: Index<PackageFile> | PackageFile) => {
  // deep mode analysis is of type Index<PackageFile>
  // non-deep mode analysis is of type <PackageFile>, so we normalize it to Index<PackageFile>
  const analysisNormalized: Index<PackageFile> =
    pkgs.length === 1 ? { [pkgs[0]]: analysis as PackageFile } : (analysis as Index<PackageFile>)
  return Object.values(analysisNormalized).some(upgrades => Object.keys(upgrades).length > 0)
}

/** Either suggest an install command based on the package manager, or in interactive mode, prompt to auto-install. */
const install = async (
  pkgs: string[],
  analysis: Index<PackageFile> | PackageFile,
  options: Options,
): Promise<unknown> => {
  if (options.install === 'never') {
    print(options, '')
    return
  }

  // if no packages were upgraded (i.e. all dependencies deselected in interactive mode), then bail without suggesting an install.
  // normalize the analysis for one or many packages
  if (!someUpgraded(pkgs, analysis)) return

  // for the purpose of the install hint, just use the package manager used in the first sub-project
  // if auto-installing, the actual package manager in each sub-project will be used
  const packageManager = await getPackageManagerForInstall(options, pkgs[0])

  // by default, show an install hint after upgrading
  // this will be disabled in interactive mode if the user chooses to have npm-check-updates execute the install command
  const installHint = `Run ${chalk.cyan(packageManager + ' install')}${
    pkgs.length > 1 && !options.workspace && !options.workspaces ? ' in each project directory' : ''
  } to install new versions`

  const isInteractive = options.interactive && !process.env.NCU_DOCTOR

  // prompt the user if they want ncu to run "npm install"
  let response
  if (isInteractive && options.install === 'prompt') {
    print(options, '')
    response = await prompts({
      type: 'confirm',
      name: 'value',
      message: `${installHint}?`,
      initial: true,
      // allow Ctrl+C to kill the process
      onState: (state: any) => {
        if (state.aborted) {
          process.nextTick(() => process.exit(1))
        }
      },
    })
  }

  // auto-install
  if (options.install === 'always' || (isInteractive && response.value)) {
    if (options.install === 'always') {
      print(options, '')
    }
    print(options, 'Installing dependencies...')

    // only run npm install once in the root when in workspace mode
    // npm install will install packages for all workspaces
    const isWorkspace = options.workspaces || !!options.workspace?.length
    const pkgsNormalized = isWorkspace ? ['package.json'] : pkgs

    pkgsNormalized.forEach(async pkgFile => {
      const packageManager = await getPackageManagerForInstall(options, pkgFile)
      const cmd = packageManager + (process.platform === 'win32' && packageManager !== 'bun' ? '.cmd' : '')
      const cwd = options.cwd || path.resolve(pkgFile, '..')
      let stdout = ''
      try {
        await spawn(cmd, ['install'], {
          cwd,
          env: {
            ...process.env,
            ...(options.color !== false ? { FORCE_COLOR: true } : null),
            // With spawn, pnpm install will fail with ERR_PNPM_PEER_DEP_ISSUES  Unmet peer dependencies.
            // When pnpm install is run directly from the terminal, this error does not occur.
            // When pnpm install is run from a simple spawn script, this error does not occur.
            // The issue only seems to be when pnpm install is executed from npm-check-updates, but it's not clear what configuration or environmental factors are causing this.
            // For now, turn off strict-peer-dependencies on pnpm auto-install.
            // See: https://github.com/raineorshine/npm-check-updates/issues/1191
            ...(packageManager === 'pnpm' ? { npm_config_strict_peer_dependencies: false } : null),
          },
          stdout: (data: string) => {
            stdout += data
          },
          stderr: (data: string) => {
            console.error(chalk.red(data.toString()))
          },
        })
        print(options, stdout)
        print(options, 'Done')
      } catch (err: any) {
        // sometimes packages print errors to stdout instead of stderr
        // if there is nothing on stderr, reject with stdout
        throw new Error(err?.message || err || stdout)
      }
    })
  }
  // show the install hint unless auto-install occurred
  else if (!isInteractive) {
    print(options, `\n${installHint}.`)
  }
}

/** Runs the dependency upgrades. Loads the ncurc, finds the package file, and handles --deep. */
async function runUpgrades(options: Options, timeout?: NodeJS.Timeout): Promise<Index<string> | PackageFile | void> {
  const [selectedPackageInfos, workspacePackages]: [PackageInfo[], string[]] = await getAllPackages(options)

  const packageFilepaths: string[] = selectedPackageInfos.map((packageInfo: PackageInfo) => packageInfo.filepath)

  // enable deep mode if --deep, --workspace, --workspaces, or if multiple package files are found
  const isWorkspace = options.workspaces || !!options.workspace?.length
  options.deep = options.deep || isWorkspace || selectedPackageInfos.length > 1

  let analysis: Index<PackageFile> | PackageFile | void
  if (options.global) {
    const analysis = await runGlobal(options)
    clearTimeout(timeout)
    return analysis
  } else if (options.deep) {
    analysis = await selectedPackageInfos.reduce(async (previousPromise, packageInfo: PackageInfo) => {
      const packages = await previousPromise
      // copy object to prevent share .ncurc options between different packageFile, to prevent unpredictable behavior
      const rcResult = await getNcuRc({ packageFile: packageInfo.filepath, color: options.color })
      let rcConfig = rcResult && rcResult.config ? rcResult.config : {}
      if (options.mergeConfig && Object.keys(rcConfig).length) {
        // Merge config options.
        rcConfig = mergeOptions(options, rcConfig)
      }
      const pkgOptions: Options = {
        ...options,
        ...rcConfig,
        packageFile: packageInfo.filepath,
        workspacePackages,
      }
      const { pkgData, pkgFile } = await findPackage(pkgOptions)
      return {
        ...packages,
        // index by relative path if cwd was specified
        [pkgOptions.cwd
          ? path
              .relative(path.resolve(pkgOptions.cwd), pkgFile!)
              // convert Windows path to *nix path for consistency
              .replace(/\\/g, '/')
          : pkgFile!]: await runLocal(pkgOptions, pkgData, pkgFile),
      }
    }, Promise.resolve({} as Index<PackageFile> | PackageFile))
    if (options.json) {
      printJson(options, analysis)
    }
  } else {
    // mutate packageFile when glob pattern finds only single package
    if (
      selectedPackageInfos.length === 1 &&
      selectedPackageInfos[0].filepath !== (options.packageFile || 'package.json')
    ) {
      options.packageFile = selectedPackageInfos[0].filepath
    }
    const { pkgData, pkgFile } = await findPackage(options)
    analysis = await runLocal(options, pkgData, pkgFile)
  }
  clearTimeout(timeout)

  if (options.errorLevel === 2 && someUpgraded(packageFilepaths, analysis)) {
    programError(options, '\nDependencies not up-to-date')
  }

  // suggest install command or auto-install
  if (options.upgrade) {
    // deno does not have an install command
    // The closest equivalent is deno cache, but it is optional.
    // See: https://deno.land/manual@v1.30.3/references/cheatsheet#nodejs---deno-cheatsheet
    if (options.packageManager === 'deno') {
      print(options, '')
    } else {
      await install(packageFilepaths, analysis, options)
    }
  }

  return analysis
}

/** Main entry point.
 *
 * @returns Promise<
 * PackageFile                    Default returns upgraded package file.
 * | Index<VersionSpec>    --jsonUpgraded returns only upgraded dependencies.
 * | void                         --global upgrade returns void.
 * >
 */
export async function run(
  runOptions: RunOptions = {},
  { cli }: { cli?: boolean } = {},
): Promise<PackageFile | Index<VersionSpec> | void> {
  const options = await initOptions(runOptions, { cli })

  // chalk may already have been initialized in cli.ts, but when imported as a module
  // chalkInit is idempotent
  await chalkInit(options.color)

  noVolta(options)

  print(options, 'Initializing', 'verbose')

  if (options.cacheClear) {
    await cacheClear(options)
  }

  let timeout: NodeJS.Timeout | undefined
  let timeoutPromise: Promise<void> = new Promise(() => null)
  if (options.timeout) {
    const timeoutMs = isString(options.timeout) ? Number.parseInt(options.timeout, 10) : options.timeout
    timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        // must catch the error and reject explicitly since we are in a setTimeout
        const error = `Exceeded global timeout of ${timeoutMs}ms`
        reject(error)
        try {
          programError(options, error)
        } catch (e) {
          /* noop */
        }
      }, timeoutMs)
    })
  }

  // doctor mode
  if (options.doctor) {
    // execute with -u
    if (options.upgrade) {
      // we have to pass run directly since it would be a circular require if doctor included this file
      return Promise.race([timeoutPromise, doctor(run, options)])
    }
    // print help otherwise
    else {
      const help =
        typeof cliOptionsMap.doctor.help === 'function' ? cliOptionsMap.doctor.help({}) : cliOptionsMap.doctor.help
      print(options, `Usage: ncu --doctor\n\n${help}`, 'warn')
    }
  }
  // normal mode
  else {
    return Promise.race([timeoutPromise, runUpgrades(options, timeout)])
  }
}

export default run

export type { RunOptions }
