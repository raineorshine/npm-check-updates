import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import boxen from 'boxen'
import latestVersion from 'latest-version'
import semver from 'semver'
import pkg from '../../package.json' with { type: 'json' }
import { getStyle } from './style.ts'

// once per day
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 24

/** The result of a background update check. */
interface UpdateInfo {
  latest: string
  current: string
  type: string
  name: string
}

interface UpdateConfig {
  optOut?: boolean
  lastUpdateCheck?: number
  update?: UpdateInfo
}

/** Returns the xdg config directory, as xdg-basedir does. */
const xdgConfig = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')

/** Returns the config path. Same file update-notifier/configstore used, so existing state carries over. */
const configPath = () => path.join(xdgConfig(), 'configstore', `update-notifier-${pkg.name}.json`)

/** Reads the config, or an empty config if it is missing or invalid. */
async function readConfig(): Promise<UpdateConfig> {
  try {
    return JSON.parse(await readFile(configPath(), 'utf8'))
  } catch {
    return {}
  }
}

/** Writes the config. */
async function writeConfig(config: UpdateConfig): Promise<void> {
  const file = configPath()
  await mkdir(path.dirname(file), { mode: 0o700, recursive: true })
  await writeFile(file, JSON.stringify(config, undefined, 2), { mode: 0o600 })
}

/** Detects a CI environment. Port of is-in-ci. */
function isInCi(): boolean {
  const env = process.env
  return (
    env.CI !== '0' &&
    env.CI !== 'false' &&
    ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some(key => key.startsWith('CI_')))
  )
}

/** Detects an npm or yarn script. Port of is-npm. */
function isNpmOrYarn(): boolean {
  const userAgent = process.env.npm_config_user_agent
  const packageJson = process.env.npm_package_json
  return Boolean(
    (userAgent && (userAgent.startsWith('npm') || userAgent.startsWith('yarn'))) ||
    (packageJson && packageJson.endsWith('package.json')),
  )
}

/** Whether the update check is disabled for this run. */
function isDisabled(): boolean {
  return 'NO_UPDATE_NOTIFIER' in process.env || process.env.NODE_ENV === 'test' || isInCi()
}

/** Builds the update notification box. */
function renderNotification(update: UpdateInfo): string {
  const style = getStyle(true)

  // generate release urls for all the major versions from the current version up to the latest
  const currentMajor = semver.parse(update.current)?.major
  const latestMajor = semver.parse(update.latest)?.major
  const majorVersions =
    // Greater than or equal to (>=) will always return false if either operant is NaN or undefined.
    // Without this condition, it can result in a RangeError: Invalid array length.
    // See: https://github.com/raineorshine/npm-check-updates/issues/1200
    currentMajor && latestMajor && latestMajor >= currentMajor
      ? new Array(latestMajor - currentMajor).fill(0).map((x, i) => currentMajor + i + 1)
      : []
  const releaseUrls = majorVersions.map(majorVersion => `${pkg.homepage}/releases/tag/v${majorVersion}.0.0`)

  // for non-major updates, generate a URL to view all commits since the current version
  const compareUrl = `${pkg.homepage}/compare/v${update.current}...v${update.latest}`

  const message = `Update available ${style.dim(update.current)}${style.reset(' → ')}${
    update.type === 'major'
      ? style.red(update.latest)
      : update.type === 'minor'
        ? style.yellow(update.latest)
        : style.green(update.latest)
  }
Run ${style.cyan(`npm i -g ${pkg.name}`)} to update
${style.dim.underline(
  update.type === 'major' ? releaseUrls.map(url => style.dim.underline(url)).join('\n') : compareUrl,
)}`

  return boxen(message, {
    padding: 1,
    margin: 1,
    textAlignment: 'center',
    borderColor: 'yellow',
    borderStyle: 'round',
  })
}

/**
 * Prints an update notification from the previous run's cached check, then refreshes a stale cache
 * in a detached background process. Never blocks on the network.
 */
async function notifyUpdate(): Promise<void> {
  if (isDisabled()) return

  const config = await readConfig()
  if (config.optOut) return

  const update = config.update
  if (update) {
    // use the real current version instead of the cached one
    update.current = pkg.version

    // clear the cached update so the notification is only shown once
    delete config.update
    try {
      await writeConfig(config)
    } catch {
      // ignore
    }

    if (process.stdout.isTTY && !isNpmOrYarn() && semver.gt(update.latest, update.current)) {
      console.error(renderNotification(update))
    }
  }

  if (Date.now() - (config.lastUpdateCheck ?? 0) < UPDATE_CHECK_INTERVAL) return

  // detached so the registry request never delays the cli
  try {
    spawn(process.execPath, [process.argv[1]], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NCU_UPDATE_CHECK: '1' },
    }).unref()
  } catch {
    // ignore
  }
}

/**
 * Caches the latest version for the next run to notify about. Runs in the detached process spawned
 * by notifyUpdate. lastUpdateCheck is only bumped on success so an offline run is retried.
 */
export async function runUpdateCheck(): Promise<void> {
  try {
    const latest = await latestVersion(pkg.name)
    const update: UpdateInfo = {
      latest,
      current: pkg.version,
      type: semver.diff(pkg.version, latest) ?? 'latest',
      name: pkg.name,
    }

    const config = await readConfig()
    config.lastUpdateCheck = Date.now()
    if (update.type !== 'latest') {
      config.update = update
    }
    await writeConfig(config)
  } catch {
    // offline or unwritable config
  }
}

export default notifyUpdate
