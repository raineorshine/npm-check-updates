import boxen from 'boxen'
import fs from 'fs'
import latestVersion from 'latest-version'
import os from 'os'
import path from 'path'
import semver from 'semver'
import pkg from '../../package.json'
import { getChalk } from './chalk'

// once per day, matching update-notifier's default
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 24

// registry request timeout, in ms
const FETCH_TIMEOUT = 5000

const cacheFile = path.join(os.tmpdir(), 'update-check-npm-check-updates.json')

interface UpdateCache {
  lastUpdateCheck: number
  latest?: string
}

/** Reads the cached update-check result, returning an empty result on any error. */
const readCache = (): UpdateCache => {
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch {
    return { lastUpdateCheck: 0 }
  }
}

/** Rejects after ms. The timer is unref'd so it won't keep the process alive. */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref()),
  ])

/** Builds the notification box, matching the previous update-notifier output. */
const renderNotification = (current: string, latest: string): string => {
  const chalk = getChalk(true)
  const type = semver.diff(current, latest)

  // generate release urls for all the major versions from the current version up to the latest
  const currentMajor = semver.parse(current)?.major
  const latestMajor = semver.parse(latest)?.major
  const majorVersions =
    // Greater than or equal to (>=) will always return false if either operand is NaN or undefined.
    // Without this condition, it can result in a RangeError: Invalid array length.
    // See: https://github.com/raineorshine/npm-check-updates/issues/1200
    currentMajor && latestMajor && latestMajor >= currentMajor
      ? new Array(latestMajor - currentMajor).fill(0).map((x, i) => currentMajor + i + 1)
      : []
  const releaseUrls = majorVersions.map(majorVersion => `${pkg.homepage ?? ''}/releases/tag/v${majorVersion}.0.0`)

  // for non-major updates, generate a URL to view all commits since the current version
  const compareUrl = `${pkg.homepage ?? ''}/compare/v${current}...v${latest}`

  let latestColored
  if (type === 'major') {
    latestColored = chalk.red(latest)
  } else if (type === 'minor') {
    latestColored = chalk.yellow(latest)
  } else {
    latestColored = chalk.green(latest)
  }

  const message = `Update available ${chalk.dim(current)}${chalk.reset(' → ')}${latestColored}
Run ${chalk.cyan('npm i -g npm-check-updates')} to update
${chalk.dim.underline(type === 'major' ? releaseUrls.map(url => chalk.dim.underline(url)).join('\n') : compareUrl)}`

  return boxen(message, {
    padding: 1,
    margin: 1,
    textAlignment: 'center',
    borderColor: 'yellow',
    borderStyle: 'round',
  })
}

/**
 * Checks for a newer version of npm-check-updates and prints a notification.
 *
 * Prints the last check's result from cache (never blocks startup) and refreshes the cache in the
 * background once per day. Skipped for non-TTY stdout, CI, tests, NO_UPDATE_NOTIFIER, and
 * --no-update-notifier.
 */
const notifyUpdate = (): void => {
  const disabled =
    !process.stdout.isTTY ||
    'NO_UPDATE_NOTIFIER' in process.env ||
    process.env.NODE_ENV === 'test' ||
    process.env.NCU_TESTS != null ||
    process.env.CI != null ||
    process.argv.includes('--no-update-notifier')

  if (disabled) return

  const cache = readCache()

  // show the previous check's result without hitting the network
  if (cache.latest && semver.gt(cache.latest, pkg.version)) {
    console.error(renderNotification(pkg.version, cache.latest))
  }

  // refresh a stale cache in the background; not awaited
  if (Date.now() - cache.lastUpdateCheck >= UPDATE_CHECK_INTERVAL) {
    withTimeout(latestVersion(pkg.name), FETCH_TIMEOUT)
      .then(latest => fs.promises.writeFile(cacheFile, JSON.stringify({ lastUpdateCheck: Date.now(), latest })))
      .catch(() => {})
  }
}

export default notifyUpdate
