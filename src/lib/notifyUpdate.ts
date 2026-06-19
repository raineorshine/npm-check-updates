import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import boxen from 'boxen'
import latestVersion from 'latest-version'
import semver from 'semver'
import pkg from '../../package.json' with { type: 'json' }
import { getChalk } from './chalk.ts'

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
function readCache(): UpdateCache {
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8'))
  } catch {
    return { lastUpdateCheck: 0 }
  }
}

/** Rejects after ms. The timer is unref'd so it won't keep the process alive. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms).unref()
    }),
  ])
}

/** Builds the notification box, matching the previous update-notifier output. */
function renderNotification(current: string, latest: string): string {
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
      ? Array.from({ length: latestMajor - currentMajor }, (x, i) => currentMajor + i + 1)
      : []
  const releaseUrls = majorVersions.map(majorVersion => `${pkg.homepage}/releases/tag/v${majorVersion}.0.0`)

  // for non-major updates, generate a URL to view all commits since the current version
  const compareUrl = `${pkg.homepage}/compare/v${current}...v${latest}`

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

/** Fetches the latest version and refreshes the cache. Best-effort; failures are ignored. */
async function refreshCache(): Promise<void> {
  try {
    const latest = await withTimeout(latestVersion(pkg.name), FETCH_TIMEOUT)
    await writeFile(cacheFile, JSON.stringify({ lastUpdateCheck: Date.now(), latest }, null, 2))
  } catch {
    // network or write failure; ignore
  }
}

/**
 * Checks for a newer version of npm-check-updates and prints a notification.
 *
 * Prints the last check's result from cache (never blocks startup) and refreshes the cache in the
 * background once per day. Skipped for non-TTY stdout, CI, tests, and NO_UPDATE_NOTIFIER.
 */
function notifyUpdate(): void {
  const disabled =
    !process.stdout.isTTY ||
    'NO_UPDATE_NOTIFIER' in process.env ||
    process.env.NODE_ENV === 'test' ||
    process.env.NCU_TESTS != null ||
    process.env.CI != null

  if (disabled) return

  try {
    const cache = readCache()

    // show the previous check's result without hitting the network
    if (cache.latest && semver.gt(cache.latest, pkg.version)) {
      console.error(renderNotification(pkg.version, cache.latest))
    }

    // refresh a stale cache in the background; not awaited
    if (Date.now() - cache.lastUpdateCheck >= UPDATE_CHECK_INTERVAL) {
      refreshCache()
    }
  } catch {
    // a failed update check should never break the cli
  }
}

export default notifyUpdate
