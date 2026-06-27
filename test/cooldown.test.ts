/* eslint-disable @typescript-eslint/no-unused-expressions */
// eslint doesn't like .to.be.false syntax
import { expect } from 'chai'
import fs from 'fs/promises'
import { stripVTControlCharacters } from 'node:util'
import os from 'os'
import path from 'path'
import Sinon from 'sinon'
import { run as ncu } from '../src/'
import { npmApi } from '../src/package-managers/npm'
import { pnpmApi } from '../src/package-managers/pnpm'
import { yarnApi } from '../src/package-managers/yarn'
import type { PackageFile } from '../src/types/PackageFile'
import type { Packument } from '../src/types/Packument'
import chaiSetup from './helpers/chaiSetup'
import { silenceProgressBar } from './helpers/silenceProgressBar'
import stubVersions from './helpers/stubVersions'

chaiSetup()

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

interface CreateMockParams {
  name: string
  versions: Record<string, string>
  distTags?: Record<string, string>
}

/**
 * Creates a mock package version object for testing purposes.
 *
 * @param params - The parameters for creating the mock version.
 * @param params.name - The name of the package.
 * @param params.versions - An object mapping version strings to their corresponding release dates.
 * @param params.distTags - An object representing distribution tags for the package.
 * @returns An object representing mocked package versions, including name, versions, time, and distTags.
 */
const createMockVersion = ({ name, versions, distTags }: CreateMockParams): Partial<Packument> => {
  return {
    name,
    version: Object.keys(versions)[0],
    versions: Object.fromEntries(Object.entries(versions).map(([version]) => [version, { version } as Packument])),
    time: Object.fromEntries(Object.entries(versions).map(([version, date]) => [version, date])),
    'dist-tags': distTags,
  }
}

/**
 * Processes log arguments by removing ANSI escape codes, collapsing all
 * internal whitespace (multiple spaces/tabs) into a single space,
 * and trimming leading/trailing newlines.
 */
const getNormalizedLogs = (logSpy: Sinon.SinonStub<any[], void>): string[] => {
  return logSpy.args
    .flat()
    .filter((arg): arg is string => typeof arg === 'string')
    .join('\n')
    .replace(/^\n+|\n+$/g, '') // Remove newlines at the start and end
    .replace(/\n+/g, '\n') // Remove consecutive newlines
    .split('\n')
    .map(
      l =>
        stripVTControlCharacters(l)
          .replace(/\s+/g, ' ') // Replace all whitespace sequences with a single space
          .trim(), // Ensure no stray spaces remain at the edges
    )
}

describe('cooldown', () => {
  beforeEach(() => {
    Sinon.restore()
  })

  describe('invalid cooldown values', () => {
    it('throws error for negative cooldown', () => {
      expect(
        ncu({
          cooldown: -1,
        }),
      ).to.be.rejectedWith(
        'Cooldown must be a non-negative number (days), a string like "7d", "12h", or "30m", or a predicate function.',
      )
    })

    it('throws error for unrecognized string cooldown', () => {
      expect(
        ncu({
          cooldown: 'invalid',
        }),
      ).to.be.rejectedWith(
        'Invalid cooldown value: "invalid". Use a number (days) or a string like "7d", "12h", or "30m".',
      )
    })
  })

  describe('cooldown string formats', () => {
    it('upgrades package when cooldown is given in days ("6d")', async () => {
      // Given: cooldown "6d" (6 days), version released 7 days ago — outside cooldown
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 7 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '6d',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in days ("6d") and version is inside period', async () => {
      // Given: cooldown "6d" (6 days), version released 5 days ago — inside cooldown
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 5 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '6d',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('upgrades package when cooldown is given in hours ("12h")', async () => {
      // Given: cooldown "12h" (12 hours), version released 13 hours ago — outside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 13 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '12h',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in hours ("12h") and version is inside period', async () => {
      // Given: cooldown "12h" (12 hours), version released 11 hours ago — inside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 11 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '12h',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('upgrades package when cooldown is given in minutes ("30m")', async () => {
      // Given: cooldown "30m" (30 minutes), version released 31 minutes ago — outside cooldown
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 31 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '30m',
      })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when cooldown is given in minutes ("30m") and version is inside period', async () => {
      // Given: cooldown "30m" (30 minutes), version released 29 minutes ago — inside cooldown
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 29 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({
        packageData,
        cooldown: '30m',
      })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('"6d" string is equivalent to the number 6', async () => {
      // Given: both cooldown forms should produce identical results
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const mockData = createMockVersion({
        name: 'test-package',
        versions: { '1.1.0': new Date(NOW - 7 * DAY).toISOString() },
        distTags: { latest: '1.1.0' },
      })

      const stub1 = stubVersions(mockData)
      const resultNumber = await ncu({
        packageData,
        cooldown: 6,
      })
      stub1.restore()

      const stub2 = stubVersions(mockData)
      const resultString = await ncu({
        packageData,
        cooldown: '6d',
      })
      stub2.restore()

      expect(resultNumber).to.deep.equal(resultString)
    })
  })

  it('upgrades when cooldown is not set', async () => {
    // Given: no cooldown set, test-package@1.0.0 installed, latest version 1.2.0 released 1 day ago
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.2.0': new Date(NOW - DAY).toISOString(),
        },
        distTags: {
          latest: '1.2.0',
        },
      }),
    )

    const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

    // When: running ncu without cooldown
    const result = await ncu({ packageData })

    // Then: package is upgraded to latest version (1.2.0)
    expect(result).to.have.property('test-package', '1.2.0')

    stub.restore()
    findNpmConfigStub.restore()
  })

  it('upgrades package when cooldown is set to 0 (no cooldown)', async () => {
    // Given: cooldown set to 0, test-package@1.0.0 installed, latest version 1.2.0 released 1 day ago
    const cooldown = 0
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.2.0': new Date(NOW - DAY).toISOString(),
        },
        distTags: {
          latest: '1.2.0',
        },
      }),
    )

    // When ncu is run with a 0 day cooldown parameter
    const result = await ncu({ packageData, cooldown })

    // Then test-package should be upgraded to version 1.2.0 (latest) - as cooldown of 0 means no cooldown.
    expect(result).to.have.property('test-package', '1.2.0')

    stub.restore()
  })

  describe('when latest target', () => {
    it('upgrades package when latest version was released outside cooldown period', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'latest'
      const result = await ncu({ packageData, cooldown, target: 'latest' })

      // Then: package is upgraded to version 1.1.0
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('falls back to most recent passing version when latest dist-tag is within cooldown', async () => {
      // Given: cooldown=10, latest (1.1.0) released 5 days ago (within cooldown),
      // previous version (1.0.1) released 15 days ago (outside cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({ packageData, cooldown, target: 'latest' })

      expect(result).to.have.property('test-package', '1.0.1')

      stub.restore()
    })

    it('skips package entirely when all versions are within cooldown (no fallback possible)', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed
      // latest dist-tag (1.1.0) released 5 days ago (within 10-day cooldown)
      // previous version (1.0.1) released 8 days ago — also within cooldown, so no fallback exists
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 8 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'latest'
      const result = await ncu({ packageData, cooldown, target: 'latest' })

      // Then: package is not upgraded (latest version within cooldown, 1.0.1 is ignored as not latest)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('does not return a pre-release version as the fallback when latest is within cooldown', async () => {
      // Given: cooldown=10, latest (1.1.0) released 5 days ago (within cooldown)
      // The only older version outside cooldown is a pre-release (1.1.0-beta.1, 15 days ago)
      // No stable version outside cooldown exists
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0-beta.1': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({ packageData, cooldown, target: 'latest' })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('logs a verbose message when a package is skipped due to cooldown', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 5 days ago (within 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const logSpy = Sinon.stub(console, 'log')

      // When ncu is run with verbose logging and cooldown
      // Note: jsonUpgraded is set to false to disable json mode, which would otherwise suppress verbose output
      await ncu({ packageData, cooldown, target: 'latest', loglevel: 'verbose', jsonUpgraded: false })

      // Then: a verbose message mentioning cooldown is logged
      const cooldownMessages = logSpy.args.flat().filter(arg => typeof arg === 'string' && arg.includes('cooldown'))
      expect(cooldownMessages).to.have.length.greaterThan(0)
      expect(cooldownMessages[0]).to.include('test-package@1.1.0')

      logSpy.restore()
      stub.restore()
    })

    it('prints "All dependencies not in cooldown" instead of registry error when all packages are within cooldown', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 5 days ago (within 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      // When ncu is run with cooldown and jsonUpgraded disabled
      // Note: loglevel must be set explicitly since the module default sets silent mode
      await ncu({ packageData, cooldown, target: 'latest', jsonUpgraded: false, loglevel: 'warn' })

      // Then: the output should say "All dependencies not in cooldown", not "No package versions were returned"
      const allMessages = logSpy.args.flat().filter(arg => typeof arg === 'string')
      expect(allMessages.some(msg => msg.includes('All dependencies not in cooldown'))).to.be.true
      expect(allMessages.some(msg => msg.includes('No package versions were returned'))).to.be.false

      logSpy.restore()
      stub.restore()
    })
  })

  it('prints "All dependencies match the latest package versions" instead of registry error when installed version is the latest and within cooldown', async () => {
    // Given: cooldown set to 10, test-package@1.1.0 installed and it is latest version 1.1.0 released 5 days ago (within 10-day cooldown)
    const cooldown = 10
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.1.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          '1.0.0': new Date(NOW - 11 * DAY).toISOString(),
        },
        distTags: {
          latest: '1.1.0',
        },
      }),
    )

    const logSpy = Sinon.stub(console, 'log')
    silenceProgressBar()

    // When ncu is run with cooldown and jsonUpgraded disabled
    // Note: loglevel must be set explicitly since the module default sets silent mode
    await ncu({ packageData, cooldown, target: 'latest', jsonUpgraded: false, loglevel: 'warn' })

    // Then: the output should say "All dependencies match the latest package versions", not "No package versions were returned"
    const allMessages = logSpy.args.flat().filter(arg => typeof arg === 'string')
    expect(allMessages.some(msg => msg.includes('All dependencies match the latest package versions'))).to.be.true
    expect(allMessages.some(msg => msg.includes('No package versions were returned'))).to.be.false

    logSpy.restore()
    stub.restore()
  })

  describe('when @TAG target', () => {
    it('upgrades package when @next version was released outside cooldown period', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, @next version 1.1.0-rc.1 released 15 days ago (outside 10-day cooldown boundary)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0-rc.1': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            next: '1.1.0-rc.1',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is '@next'
      const result = await ncu({ packageData, cooldown, target: '@next' })

      // Then: package is upgraded to @next version 1.1.0-rc.1
      expect(result).to.have.property('test-package', '1.1.0-rc.1')

      stub.restore()
    })

    it('skips package upgrade completely when @next version is inside cooldown period', async () => {
      // Given: cooldown days is set to 10 days, test-package is installed in version 1.0.0, and the @next version - 1.1.0-rc.2 was released 5 days ago (inside cooldown period). Another version 1.1.0-rc.1 was released 10 days ago (outside cooldown period), but it is not marked as @next version.
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0-rc.2': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0-rc.1': new Date(NOW - 10 * DAY).toISOString(),
          },
          distTags: {
            next: '1.1.0-rc.2',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is '@next'
      const result = await ncu({ packageData, cooldown, target: '@next' })

      // Then: package is not upgraded (next version within cooldown, 1.1.0-rc.2 is ignored as not tagged as next)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  describe('when @latest strict target', () => {
    it('upgrades package when @latest version was released outside cooldown period', async () => {
      // Given: cooldown=10, latest (1.1.0) released 15 days ago (outside cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({ packageData, cooldown, target: '@latest' })

      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips the package entirely when @latest is within cooldown, with no fallback', async () => {
      // Given: cooldown=10, latest (1.1.0) released 5 days ago (within cooldown),
      // previous version (1.0.1) released 15 days ago (outside cooldown)
      // Unlike --target latest, @latest is strict and does not fall back
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: { latest: '1.1.0' },
        }),
      )

      const result = await ncu({ packageData, cooldown, target: '@latest' })

      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  describe('when greatest target', () => {
    it('upgrades package to greatest version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.2.0 released 5 days ago (within cooldown), version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.2.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'greatest'
      const result = await ncu({ packageData, cooldown, target: 'greatest' })

      // Then: package is upgraded to version 1.1.0 (oldest version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips package upgrade if no versions are older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, all versions (1.1.0, 1.2.0) released within 10-day cooldown (8 and 5 days ago)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 8 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.2.0',
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'greatest'
      const result = await ncu({ packageData, cooldown, target: 'greatest' })

      // Then test-package should not be upgraded (as no versions were released outside cooldown period)
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })
  })

  describe('when newest target', () => {
    it('upgrades package to newest version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.2.0 released 5 days ago (within cooldown), version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'newest'
      const result = await ncu({ packageData, cooldown, target: 'newest' })

      // Then: package is upgraded to version 1.1.0 (newest version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })
  })

  describe('when minor target', () => {
    it('upgrades package to newest minor version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.2.0 released 5 days ago (within cooldown), version 1.1.0 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.2.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'minor'
      const result = await ncu({ packageData, cooldown, target: 'minor' })

      // Then: package is upgraded to version 1.1.0 (newest minor version outside cooldown)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })
  })

  describe('when patch target', () => {
    it('upgrades package to newest patch version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.0.2 released 5 days ago (within cooldown), version 1.0.1 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.0.2': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'patch'
      const result = await ncu({ packageData, cooldown, target: 'patch' })

      // Then: package is upgraded to version 1.0.1 (newest patch version outside cooldown)
      expect(result).to.have.property('test-package', '1.0.1')

      stub.restore()
    })
  })

  describe('when semver target', () => {
    it('upgrades package to newest semver version older than cooldown period', async () => {
      // Given: test-package@1.0.0 installed, version 1.1.0 released 5 days ago (within cooldown), version 1.0.1 released 15 days ago (outside 10-day cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '^1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.1': new Date(NOW - 15 * DAY).toISOString(),
          },
        }),
      )

      // When ncu is run with the cooldown parameter and target is 'semver'
      const result = await ncu({ packageData, cooldown, target: 'semver' })

      // Then: package is upgraded to version ^1.0.1 (newest semver version outside cooldown)
      expect(result).to.have.property('test-package', '^1.0.1')
      stub.restore()
    })
  })

  it('upgrades package when version was released exactly at the cooldown boundary', async () => {
    // Given: test-package@1.0.0 installed, latest version 1.1.0 released exactly 10 days ago (at cooldown boundary)
    const cooldown = 10
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '1.0.0',
      },
    }
    const stub = stubVersions(
      createMockVersion({
        name: 'test-package',
        versions: {
          '1.1.0': new Date(NOW - 10 * DAY).toISOString(),
        },
        distTags: {
          latest: '1.1.0',
        },
      }),
    )

    // When ncu is run with the cooldown parameter and target is 'latest'
    const result = await ncu({ packageData, cooldown, target: 'latest' })

    // Then: test-package should be upgraded to version 1.1.0 (as 1.1.0 was released exactly at the cooldown boundary)
    expect(result).to.have.property('test-package', '1.1.0')

    stub.restore()
  })

  describe('cooldown predicate function', () => {
    it('skips cooldown check when predicate returns null', async () => {
      // Given: cooldown set to 10, test-package@1.0.0 installed, latest version 1.1.0 released 5 days ago (within cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // When: cooldown predicate returns null for test-package
      const result = await ncu({
        packageData,
        cooldown: packageName => (packageName === 'test-package' ? null : cooldown),
        target: 'latest',
      })

      // Then: test-package is upgraded to version 1.1.0 (cooldown check skipped)
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('applies custom cooldown when predicate returns a number', async () => {
      // Given: default cooldown set to 10, test-package and test-package-2 - both installed in version 1.0.0, and both has the latest version 1.1.0 released 5 days ago (within cooldown)
      const cooldown = 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: {
            '1.1.0': new Date(NOW - 5 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      })

      // When: cooldown predicate returns 5 for test-package (skipping cooldown), and 10 for the rest packages
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? 5 : cooldown),
        target: 'latest',
      })

      // Then: test-package is upgraded to version 1.1.0 (as cooldown for this package was set to 5), but test-package-2 is not upgraded (as rest of the packages use default cooldown of 10)
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })

    it('upgrades when predicate returns a sub-day (fractional) value and version is outside that period', async () => {
      // Given: predicate returns 12/24 (= 12 hours), version released 13 hours ago — outside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 13 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      // When: cooldown predicate returns 12/24 (fractional days = 12 hours)
      const result = await ncu({
        packageData,
        cooldown: () => 12 / 24,
        target: 'latest',
      })

      // Then: test-package is upgraded to 1.1.0
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
    })

    it('skips upgrade when predicate returns a sub-day (fractional) value and version is inside that period', async () => {
      // Given: predicate returns 12/24 (= 12 hours), version released 11 hours ago — inside cooldown
      const HOUR = DAY / 24
      const packageData: PackageFile = {
        dependencies: { 'test-package': '1.0.0' },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 11 * HOUR).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      )

      // When: cooldown predicate returns 12/24 (fractional days = 12 hours)
      const result = await ncu({
        packageData,
        cooldown: () => 12 / 24,
        target: 'latest',
      })

      // Then: test-package is not upgraded
      expect(result).to.not.have.property('test-package')

      stub.restore()
    })

    it('accepts a string ("3m") returned from the predicate for per-package unit suffixes', async () => {
      // Given: predicate returns "3m" (3 minutes) for test-package and 10 (days) for test-package-2;
      //        test-package released 4 minutes ago (outside 3m cooldown),
      //        test-package-2 released 1 day ago (inside 10-day cooldown)
      const MINUTE = DAY / (24 * 60)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 4 * MINUTE).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      })

      // When: predicate returns a string for one package and a number for another
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? '3m' : 10),
        target: 'latest',
      })

      // Then: test-package is upgraded (4 min > 3 min cooldown), test-package-2 is not (1 day < 10 days)
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })

    it('upgrades when predicate returns 0, disabling cooldown for that package', async () => {
      // Given: predicate returns 0 for test-package (no cooldown) and 10 for others; version released 1 day ago
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'test-package-2': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        'test-package-2': createMockVersion({
          name: 'test-package-2',
          versions: { '1.1.0': new Date(NOW - DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
      })

      // When: predicate returns 0 for test-package and 10 for everything else
      const result = await ncu({
        packageData,
        cooldown: (packageName: string) => (packageName === 'test-package' ? 0 : 10),
        target: 'latest',
      })

      // Then: test-package is upgraded (cooldown disabled for it), test-package-2 is not
      expect(result).to.have.property('test-package', '1.1.0')
      expect(result).to.not.have.property('test-package-2')

      stub.restore()
    })
  })

  describe('npm config min-release-age', () => {
    it('applies min-release-age from npm config as cooldown when cooldown is not set', async () => {
      // Given: npm config has min-release-age=7, test-package@1.0.0 installed
      // latest dist-tag (1.1.0) released 3 days ago (within 7-day cooldown)
      // previous version 1.0.1 released 10 days ago (outside 7-day cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.0.1': new Date(NOW - 10 * DAY).toISOString(),
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub findNpmConfig to return a config with minReleaseAge: '7'
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({ minReleaseAge: '7' })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 7-day min-release-age
      expect(result).to.have.property('test-package', '1.0.1')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('ignores min-release-age when cooldown is explicitly set', async () => {
      // Given: npm config has min-release-age=7, but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub findNpmConfig to return a config with minReleaseAge: '7'
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({ minReleaseAge: '7' })

      // When: ncu is run with explicit cooldown=0 (overrides min-release-age)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides min-release-age
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('does not log "Using min-release-age" message when jsonUpgraded is enabled', async () => {
      // Given: npm config has min-release-age=7
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 10 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub findNpmConfig to return a config with minReleaseAge: '7'
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({ minReleaseAge: '7' })

      const logSpy = Sinon.stub(console, 'log')

      // When: ncu is run with jsonUpgraded enabled
      await ncu({ packageData, jsonUpgraded: true })

      // Then: the "Using min-release-age from .npmrc" message should NOT be logged to stdout
      const minReleaseAgeMessages = logSpy.args
        .flat()
        .filter(arg => typeof arg === 'string' && arg.includes('min-release-age'))
      expect(minReleaseAgeMessages).to.have.length(0)

      logSpy.restore()
      stub.restore()
      findNpmConfigStub.restore()
    })

    it('excludes packages matching min-release-age-exclude patterns from cooldown', async () => {
      // Given: npm config has min-release-age=7 with @myorg/* excluded,
      // test-package released 3 days ago (within cooldown), @myorg/pkg released 3 days ago (excluded from cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          '@myorg/pkg': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      // Stub findNpmConfig to return a config with minReleaseAge: '7' and @myorg/* excluded
      // (repeated min-release-age-exclude[] entries in .npmrc parse as an array)
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: ['@myorg/*'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: test-package is skipped (within 7-day cooldown), @myorg/pkg is upgraded (excluded from cooldown)
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('excludes a package when min-release-age-exclude is a single string', async () => {
      // Given: npm config has min-release-age=7 and a single min-release-age-exclude entry,
      // which the ini parser returns as a string rather than an array
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          'excluded-package': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        'excluded-package': createMockVersion({
          name: 'excluded-package',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: 'excluded-package',
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: test-package is skipped (within 7-day cooldown), excluded-package is upgraded
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('excluded-package', '2.0.0')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('splits comma-separated min-release-age-exclude values and removes duplicates', async () => {
      const packageData: PackageFile = {
        dependencies: {
          react: '17.0.0',
          '@myorg/pkg': '1.0.0',
          vue: '2.0.0',
        },
      }
      const stub = stubVersions({
        react: createMockVersion({
          name: 'react',
          versions: { '18.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '18.0.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
        vue: createMockVersion({
          name: 'vue',
          versions: { '3.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '3.0.0' },
        }),
      })
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: ['react, @myorg/*', 'react'],
      })
      const logSpy = Sinon.stub(console, 'log')

      const result = await ncu({ packageData, jsonUpgraded: false, loglevel: 'warn' })

      expect(result).to.have.property('react', '18.0.0')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')
      expect(result).to.not.have.property('vue')
      expect(logSpy.args.flat()).to.include('Using min-release-age from .npmrc: 7 days (2 excluded patterns)')

      logSpy.restore()
      stub.restore()
      findNpmConfigStub.restore()
    })

    it('disables negation, comments, and extglobs in min-release-age-exclude patterns', async () => {
      const packageData: PackageFile = {
        dependencies: {
          react: '17.0.0',
          vue: '2.0.0',
          lodash: '4.0.0',
        },
      }
      const stub = stubVersions({
        react: createMockVersion({
          name: 'react',
          versions: { '18.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '18.0.0' },
        }),
        vue: createMockVersion({
          name: 'vue',
          versions: { '3.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '3.0.0' },
        }),
        lodash: createMockVersion({
          name: 'lodash',
          versions: { '5.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '5.0.0' },
        }),
      })
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: ['!react', '#lodash', '@(react|vue)'],
      })

      const result = await ncu({ packageData })

      expect(result).to.deep.equal({})

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('only excludes packages that exactly match a non-glob pattern', async () => {
      // Given: npm config has min-release-age=7 with "react" excluded;
      // react-dom released 3 days ago should still be within cooldown
      const packageData: PackageFile = {
        dependencies: {
          react: '17.0.0',
          'react-dom': '17.0.0',
        },
      }
      const stub = stubVersions({
        react: createMockVersion({
          name: 'react',
          versions: { '18.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '18.0.0' },
        }),
        'react-dom': createMockVersion({
          name: 'react-dom',
          versions: { '18.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '18.0.0' },
        }),
      })

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: ['react'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: react is upgraded (exact match excluded), react-dom is skipped (within cooldown)
      expect(result).to.have.property('react', '18.0.0')
      expect(result).to.not.have.property('react-dom')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('does not apply any cooldown when min-release-age-exclude is set without min-release-age', async () => {
      // Given: npm config has min-release-age-exclude but no min-release-age
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAgeExclude: ['react'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: package is upgraded since no cooldown is in effect
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
    })

    it('ignores min-release-age-exclude when cooldown is explicitly set', async () => {
      // Given: npm config has min-release-age=7 with test-package excluded, but cooldown is explicitly set to 10
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({
        minReleaseAge: '7',
        minReleaseAgeExclude: ['test-package'],
      })

      // When: ncu is run with explicit cooldown=10 (overrides min-release-age and its exclusions)
      const result = await ncu({ packageData, cooldown: 10 })

      // Then: package is not upgraded since the explicit cooldown applies to all packages
      expect(result).to.not.have.property('test-package')

      stub.restore()
      findNpmConfigStub.restore()
    })
  })

  describe('pnpm workspace minimumReleaseAge', () => {
    it('applies minimumReleaseAge from pnpm-workspace.yaml as cooldown when cooldown is not set', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=1440 (1440 minutes = 1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 12 hours ago (within cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Prevent user's .npmrc min-release-age from taking precedence over pnpm/yarn config in tests
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a config with minimumReleaseAge: 1440 minutes
      const pnpmWorkspaceStub = Sinon.stub(pnpmApi, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 1440,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'pnpm' })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 1-day cooldown
      expect(result).to.not.have.property('test-package')

      stub.restore()
      findNpmConfigStub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('excludes packages matching minimumReleaseAgeExclude patterns from cooldown', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days) with @myorg/* excluded,
      // test-package released 3 days ago (within cooldown), @myorg/pkg released 3 days ago (excluded from cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          '@myorg/pkg': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a config with 7 days cooldown and @myorg/* excluded
      const pnpmWorkspaceStub = Sinon.stub(pnpmApi, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080, // 7 days in minutes
        minimumReleaseAgeExclude: ['@myorg/*'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'pnpm' })

      // Then: test-package is skipped (within 7-day cooldown), @myorg/pkg is upgraded (excluded from cooldown)
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')

      stub.restore()
      findNpmConfigStub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('does not apply pnpm minimumReleaseAge when cooldown is explicitly set', async () => {
      // Given: pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days), but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub getPnpmWorkspaceMinimumReleaseAge to return a 7-day config
      const pnpmWorkspaceStub = Sinon.stub(pnpmApi, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run with explicit cooldown=0 (overrides pnpm minimumReleaseAge)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides pnpm minimumReleaseAge
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      pnpmWorkspaceStub.restore()
    })

    it('does not apply pnpm minimumReleaseAge when npm min-release-age is set', async () => {
      // Given: both npm config has min-release-age=2 and pnpm-workspace.yaml has minimumReleaseAge=10080 (7 days)
      // test-package latest released 3 days ago (within 7-day pnpm cooldown but outside 2-day npm cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub npm config with min-release-age=2
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({ minReleaseAge: '2' })
      // Stub pnpm workspace with 7-day cooldown
      const pnpmWorkspaceStub = Sinon.stub(pnpmApi, 'getPnpmWorkspaceMinimumReleaseAge').resolves({
        minimumReleaseAge: 10080,
        minimumReleaseAgeExclude: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData })

      // Then: package is upgraded because npm's 2-day cooldown takes precedence and 3 days > 2 days
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
      pnpmWorkspaceStub.restore()
    })
  })

  describe('pnpm global minimumReleaseAge config fallback', () => {
    let originalCwd: string
    let originalXdg: string | undefined
    let projectDir: string
    let xdgDir: string

    beforeEach(async () => {
      originalCwd = process.cwd()
      originalXdg = process.env.XDG_CONFIG_HOME
      // A project directory without a pnpm-workspace.yaml so the workspace layer is absent.
      projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-pnpm-project-'))
      // An isolated XDG_CONFIG_HOME so pnpm's global config resolves to a temp directory.
      xdgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ncu-pnpm-xdg-'))
      await fs.mkdir(path.join(xdgDir, 'pnpm'), { recursive: true })
      process.env.XDG_CONFIG_HOME = xdgDir
      process.chdir(projectDir)
    })

    afterEach(async () => {
      process.chdir(originalCwd)
      if (originalXdg === undefined) {
        delete process.env.XDG_CONFIG_HOME
      } else {
        process.env.XDG_CONFIG_HOME = originalXdg
      }
      await fs.rm(projectDir, { recursive: true, force: true })
      await fs.rm(xdgDir, { recursive: true, force: true })
    })

    it('reads minimumReleaseAge from pnpm global config.yaml (pnpm >= 11) when pnpm-workspace.yaml is absent', async () => {
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - react\n',
      )

      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()

      expect(result).to.deep.equal({ minimumReleaseAge: 10080, minimumReleaseAgeExclude: ['react'] })
    })

    it('reads minimumReleaseAge from pnpm global rc (pnpm <= 10) when pnpm-workspace.yaml is absent', async () => {
      // `pnpm config set minimumReleaseAgeExclude '["react"]' --global` stores a JSON-encoded array string in the ini rc file.
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'rc'),
        'minimumReleaseAge=10080\nminimumReleaseAgeExclude=["react"]\n',
      )

      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()

      expect(result).to.deep.equal({ minimumReleaseAge: 10080, minimumReleaseAgeExclude: ['react'] })
    })

    it('returns null when no config layer defines minimumReleaseAge', async () => {
      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()
      expect(result).to.equal(null)
    })

    it('prefers minimumReleaseAge from pnpm-workspace.yaml over global config and merges excludes', async () => {
      await fs.writeFile(
        path.join(projectDir, 'pnpm-workspace.yaml'),
        'packages:\n  - "packages/*"\nminimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - "@myorg/*"\n',
      )
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - react\n',
      )

      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()

      // workspace minimumReleaseAge wins; excludes from both layers are merged
      expect(result).to.deep.equal({ minimumReleaseAge: 1440, minimumReleaseAgeExclude: ['@myorg/*', 'react'] })
    })

    it('falls back to global minimumReleaseAge when pnpm-workspace.yaml omits it, merging excludes from both layers', async () => {
      await fs.writeFile(
        path.join(projectDir, 'pnpm-workspace.yaml'),
        'packages:\n  - "packages/*"\nminimumReleaseAgeExclude:\n  - "@myorg/*"\n',
      )
      await fs.writeFile(
        path.join(xdgDir, 'pnpm', 'config.yaml'),
        'minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - react\n',
      )

      const result = await pnpmApi.getPnpmWorkspaceMinimumReleaseAge()

      expect(result).to.deep.equal({ minimumReleaseAge: 10080, minimumReleaseAgeExclude: ['@myorg/*', 'react'] })
    })

    it('applies the cooldown from pnpm global config when pnpm-workspace.yaml does not define minimumReleaseAge', async () => {
      // Given: only pnpm global config defines minimumReleaseAge=1440 (1 day); latest released 12 hours ago (within cooldown)
      await fs.writeFile(path.join(xdgDir, 'pnpm', 'config.yaml'), 'minimumReleaseAge: 1440\n')

      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Prevent the user's .npmrc min-release-age from taking precedence over pnpm config in tests
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'pnpm' })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 1-day cooldown
      expect(result).to.not.have.property('test-package')

      stub.restore()
      findNpmConfigStub.restore()
    })
  })

  describe('yarn npmMinimalAgeGate', () => {
    it('applies npmMinimalAgeGate from .yarnrc.yml as cooldown when cooldown is not set', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=1440 (1440 minutes = 1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 12 hours ago (within cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      // Stub getYarnMinimalAgeGate to return a config with npmMinimalAgeGate: 1440 minutes (1 day)
      const yarnAgeGateStub = Sinon.stub(yarnApi, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 1440,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package upgrade is skipped because latest version (1.1.0) is within the 1-day cooldown
      expect(result).to.not.have.property('test-package')

      stub.restore()
      findNpmConfigStub.restore()
      yarnAgeGateStub.restore()
    })

    it('upgrades packages older than npmMinimalAgeGate', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=1440 (1 day),
      // test-package@1.0.0 installed, latest version 1.1.0 released 2 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 2 * DAY).toISOString(), // 2 days ago
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      const yarnAgeGateStub = Sinon.stub(yarnApi, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 1440,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package is upgraded because 2 days > 1 day cooldown
      expect(result).to.have.property('test-package', '1.1.0')

      stub.restore()
      findNpmConfigStub.restore()
      yarnAgeGateStub.restore()
    })

    it('excludes packages listed in npmPreapprovedPackages from cooldown', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=10080 (7 days) with @myorg/pkg pre-approved,
      // test-package released 3 days ago (within cooldown), @myorg/pkg released 3 days ago (pre-approved)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
          '@myorg/pkg': '1.0.0',
        },
      }
      const stub = stubVersions({
        'test-package': createMockVersion({
          name: 'test-package',
          versions: { '1.1.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '1.1.0' },
        }),
        '@myorg/pkg': createMockVersion({
          name: '@myorg/pkg',
          versions: { '2.0.0': new Date(NOW - 3 * DAY).toISOString() },
          distTags: { latest: '2.0.0' },
        }),
      })

      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns(null)

      // Stub getYarnMinimalAgeGate to return a 7-day cooldown with @myorg/pkg pre-approved
      const yarnAgeGateStub = Sinon.stub(yarnApi, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 10080,
        npmPreapprovedPackages: ['@myorg/pkg'],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: test-package is skipped (within 7-day cooldown), @myorg/pkg is upgraded (pre-approved)
      expect(result).to.not.have.property('test-package')
      expect(result).to.have.property('@myorg/pkg', '2.0.0')

      stub.restore()
      findNpmConfigStub.restore()
      yarnAgeGateStub.restore()
    })

    it('does not apply npmMinimalAgeGate when cooldown is explicitly set', async () => {
      // Given: .yarnrc.yml has npmMinimalAgeGate=10080 (7 days), but cooldown is explicitly set to 0
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      const yarnAgeGateStub = Sinon.stub(yarnApi, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 10080,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run with explicit cooldown=0 (overrides npmMinimalAgeGate)
      const result = await ncu({ packageData, cooldown: 0 })

      // Then: package is upgraded since explicit cooldown=0 overrides npmMinimalAgeGate
      expect(result).to.have.property('test-package', '1.1.0')
      expect(yarnAgeGateStub.called).to.equal(false)

      stub.restore()
      yarnAgeGateStub.restore()
    })

    it('does not apply npmMinimalAgeGate when npm min-release-age is set', async () => {
      // Given: both npm config has min-release-age=2 and .yarnrc.yml has npmMinimalAgeGate=10080 (7 days)
      // test-package latest released 3 days ago (within 7-day yarn cooldown but outside 2-day npm cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.1.0': new Date(NOW - 3 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.1.0',
          },
        }),
      )

      // Stub npm config with min-release-age=2
      const findNpmConfigStub = Sinon.stub(npmApi, 'findNpmConfig').returns({ minReleaseAge: '2' })
      const yarnAgeGateStub = Sinon.stub(yarnApi, 'getYarnMinimalAgeGate').resolves({
        npmMinimalAgeGate: 10080,
        npmPreapprovedPackages: [],
      })

      // When: ncu is run without explicit cooldown option
      const result = await ncu({ packageData, packageManager: 'yarn' })

      // Then: package is upgraded because npm's 2-day cooldown takes precedence and 3 days > 2 days
      expect(result).to.have.property('test-package', '1.1.0')
      expect(yarnAgeGateStub.called).to.equal(false)

      stub.restore()
      findNpmConfigStub.restore()
      yarnAgeGateStub.restore()
    })
  })

  describe('print: Skipped due to cooldown when `--format cooldown` included', () => {
    const mockedVersion = createMockVersion({
      name: 'test-package',
      versions: {
        '1.0.2': new Date(NOW - 5 * DAY).toISOString(),
        '1.0.1': new Date(NOW - 8 * DAY).toISOString(),
      },
      distTags: {
        latest: '1.0.2',
      },
    })
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '^1.0.0',
      },
    }

    // When ncu is run with cooldown and jsonUpgraded disabled
    // Note: loglevel must be set explicitly since the module default sets silent mode
    const options = {
      packageData,
      jsonUpgraded: false,
      loglevel: 'warn',
      format: ['cooldown'],
    }

    const targets = ['latest', 'newest', 'greatest', 'minor', 'patch', 'semver', '@latest'] as const
    for (const target of targets) {
      it(`handles "target: ${target}" when all versions are within cooldown (no fallback possible)`, async () => {
        // Given: cooldown set to 10, test-package@1.0.0 installed
        // latest dist-tag (1.0.2) released 5 days ago (within 10-day cooldown)
        // previous version (1.0.1) released 8 days ago — also within cooldown, so no fallback exists
        const cooldown = 10

        const stub = stubVersions(mockedVersion)
        const logSpy = Sinon.stub(console, 'log')
        silenceProgressBar()

        await ncu({ ...options, cooldown, target })

        const allMessages = getNormalizedLogs(logSpy)

        expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
        expect(allMessages[1]).to.equal(`test-package ^1.0.0 → ^1.0.2 5 days ago`)
        expect(allMessages.at(-1)?.includes('All dependencies not in cooldown')).to.be.true

        logSpy.restore()
        stub.restore()
      })

      it(`handles "target: ${target}" when target version are within cooldown and a fallback exist)`, async () => {
        // Given: cooldown set to 6, test-package@1.0.0 installed
        // latest dist-tag (1.0.2) released 5 days ago (within 6-day cooldown)
        // previous version (1.0.1) released 8 days ago — is before cooldown and return as a fallback
        const cooldown = 6

        const stub = stubVersions(mockedVersion)
        const logSpy = Sinon.stub(console, 'log')
        silenceProgressBar()

        await ncu({ ...options, cooldown, target, format: ['cooldown', 'time'] })

        const allMessages = getNormalizedLogs(logSpy)

        expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)

        if (target === '@latest') {
          // if version from dist-tag does not meet cooldown requirement skip finding other versions
          expect(allMessages[1]).to.equal(`test-package ^1.0.0 → ^1.0.2 5 days ago`)
          expect(allMessages.at(-1)?.includes('All dependencies not in cooldown')).to.be.true
        } else {
          expect(allMessages[1]).to.equal(`test-package ^1.0.1 → ^1.0.2 5 days ago`)
          expect(allMessages[2]).to.equal(`Updates`)
          expect(allMessages[3]).to.equal(`test-package ^1.0.0 → ^1.0.1 [cooldown] 1.0.2 1 week ago`)
        }

        logSpy.restore()
        stub.restore()
      })
    }
  })

  describe('when installed version matches target version and is within cooldown', () => {
    const mockedVersion = createMockVersion({
      name: 'test-package',
      versions: {
        '2.0.0': new Date(NOW - 3 * DAY).toISOString(),
        '1.0.0': new Date(NOW - 10 * DAY).toISOString(),
      },
      distTags: {
        latest: '2.0.0',
      },
    })
    const packageData: PackageFile = {
      dependencies: {
        'test-package': '^2.0.0',
      },
    }
    const options = {
      packageData,
      jsonUpgraded: false,
      loglevel: 'warn',
      format: ['cooldown'],
    }
    const targets = ['latest', '@latest', 'newest', 'greatest'] as const
    for (const target of targets) {
      it(`handles "target: ${target}" correctly within cooldown`, async () => {
        const cooldown = 6

        const stub = stubVersions(mockedVersion)
        const logSpy = Sinon.stub(console, 'log')
        silenceProgressBar()

        await ncu({ ...options, packageData, cooldown, target, format: ['cooldown', 'time'] })

        const allMessages = getNormalizedLogs(logSpy)
        const happyMsg = `All dependencies match the ${target} package versions :)`
        expect(allMessages.some(msg => msg.includes(happyMsg))).to.be.true
        expect(allMessages.some(msg => msg.includes('No package versions were returned'))).to.be.false
        expect(allMessages.some(msg => msg.includes(`Skipped due to ${cooldown}-day cooldown`))).to.be.false

        logSpy.restore()
        stub.restore()
      })
    }
  })

  describe(`Don't skip by cooldown when package metadata doesn't have "time"`, () => {
    const mockedVersion = createMockVersion({
      name: 'test-package',
      versions: {
        '1.0.3-pre.0': new Date(NOW - 3 * DAY).toISOString(),
        '1.0.2': new Date(NOW - 3 * DAY).toISOString(),
        '1.0.1': new Date(NOW - 6 * DAY).toISOString(),
        '1.0.0': new Date(NOW - 9 * DAY).toISOString(),
      },
      distTags: {
        latest: '1.0.2',
      },
    })
    const mockedVersionWithNoTime = {
      ...mockedVersion,
      time: {
        ...mockedVersion.time,
      },
      name: 'test-package-with-no-time',
    }

    // mock missing time
    // mockedVersionWithNoTime.time = {}
    delete mockedVersionWithNoTime.time!['1.0.3-pre.0']
    delete mockedVersionWithNoTime.time!['1.0.2']

    const packageData: PackageFile = {
      dependencies: {
        'test-package': '^1.0.0',
        'test-package-with-no-time': '^1.0.0',
      },
    }

    // When ncu is run with cooldown and jsonUpgraded disabled
    // Note: loglevel must be set explicitly since the module default sets silent mode
    const options = {
      packageData,
      jsonUpgraded: false,
      loglevel: 'warn',
      format: ['cooldown'],
    }

    let stub: { restore: () => void }
    const versions = {
      'test-package': mockedVersion,
      'test-package-with-no-time': mockedVersionWithNoTime,
    }
    after(() => stub.restore())

    const targets = ['latest', 'greatest', 'minor', 'patch', 'semver'] as const
    for (const target of targets) {
      it(`handles "target: ${target}" correctly within cooldown`, async () => {
        // greatest version time was deleted, all teaget function should return
        // test-package-with-no-time: 1.0.2 or 1.0.3-pre.0, for newest and greatest for the upgrade
        // when newest function get a package with missing time it should return greatest instead
        stub = stubVersions(versions)
        const cooldown = 5

        const logSpy = Sinon.stub(console, 'log')
        silenceProgressBar()

        await ncu({ ...options, cooldown, target })

        const upgradeVersion = ['newest', 'greatest'].includes(target) ? '1.0.3-pre.0' : '1.0.2'
        const truncateVersion = ['newest', 'greatest'].includes(target) ? '1.0.3-+' : '1.0.2'

        const allMessages = getNormalizedLogs(logSpy)
        expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
        expect(allMessages[1]).to.equal(`test-package ^1.0.1 → ^${upgradeVersion} 3 days ago`)
        expect(allMessages[3]).to.equal(`test-package ^1.0.0 → ^1.0.1 [cooldown] ${truncateVersion}`)
        expect(allMessages[4]).to.equal(`test-package-with-no-time ^1.0.0 → ^${upgradeVersion} [missing time]`)

        logSpy.restore()
      })
    }

    it(`handles "target: '@latest'" correctly within cooldown`, async () => {
      stub = stubVersions(versions)
      const cooldown = 5

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, cooldown, target: '@latest' })

      const allMessages = getNormalizedLogs(logSpy)

      expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
      expect(allMessages[1]).to.equal(`test-package ^1.0.0 → ^1.0.2 3 days ago`)
      expect(allMessages[3]).to.equal(`test-package-with-no-time ^1.0.0 → ^1.0.2 [missing time]`)

      logSpy.restore()
    })

    it(`"target: newest" - ignore versions without time`, async () => {
      // test-package-with-no-time versions 1.0.2 and 1.0.3-pre.0 don't have time
      // test-package-with-no-time will upgrade to version 1.0.1
      stub = stubVersions(versions)
      const cooldown = 5

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, cooldown, target: 'newest' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
      expect(allMessages[1]).to.equal(`test-package ^1.0.1 → ^1.0.3-pre.0 3 days ago`)
      expect(allMessages[3]).to.equal(`test-package ^1.0.0 → ^1.0.1 [cooldown] 1.0.3-+`)
      expect(allMessages[4]).to.equal(`test-package-with-no-time ^1.0.0 → ^1.0.1`)

      logSpy.restore()
    })

    it(`"target: newest" - no upgrade is possible when all times are missing`, async () => {
      // delete all times and update stub
      stub = stubVersions({
        'test-package': mockedVersion,
        'test-package-with-no-time': { ...mockedVersionWithNoTime, time: {} },
      })

      const cooldown = 5

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, cooldown, target: 'newest' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
      expect(allMessages[1]).to.equal(`test-package ^1.0.1 → ^1.0.3-pre.0 3 days ago`)
      expect(allMessages[3]).to.equal(`test-package ^1.0.0 → ^1.0.1 [cooldown] 1.0.3-+`)
      expect(allMessages.join('/n')).not.to.include(`test-package-with-no-time`)

      logSpy.restore()
    })
    // prints "All dependencies match the latest package versions"
    it(`handles "target: newest" when all packages are without time`, async () => {
      // delete all times for all packages and update stub
      stub = stubVersions({
        'test-package': { ...mockedVersion, time: {} },
        'test-package-with-no-time': { ...mockedVersionWithNoTime, time: {} },
      })

      const cooldown = 5

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, cooldown, target: 'newest' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages[0]).to.equal(`All dependencies match the newest package versions :)`)

      logSpy.restore()
    })
  })

  describe('downgrade from prerelease when target version is within cooldown', () => {
    const cooldown = 10

    // Common options for all tests in this describe block
    const options = {
      cooldown,
      jsonUpgraded: false,
      loglevel: 'warn',
      format: ['cooldown'],
    }

    it('downgrades from prerelease to older stable version when target @latest is not within cooldown', async () => {
      // Given: test-package@2.0.0-beta.1 (prerelease) installed
      // @latest is 1.5.0 released 11 days ago (outside cooldown)
      // older stable version 1.0.0 released 15 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '2.0.0-beta.1',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.5.0': new Date(NOW - 11 * DAY).toISOString(),
            '1.0.0': new Date(NOW - 15 * DAY).toISOString(),
            '2.0.0-beta.1': new Date(NOW - 20 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.5.0',
          },
        }),
      )

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, packageData, target: '@latest' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages.length).to.equal(1)
      expect(allMessages[0]).to.equal(`test-package 2.0.0-beta.1 → 1.5.0`)

      logSpy.restore()
      stub.restore()
    })

    it('skip by cooldown downgrades from prerelease to older stable version when target @latest is within cooldown', async () => {
      // Given: test-package@2.0.0-beta.1 (prerelease) installed
      // @latest is 1.5.0 released 5 days ago (within cooldown)
      // older stable version 1.0.0 released 15 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '2.0.0-beta.1',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.5.0': new Date(NOW - 5 * DAY).toISOString(),
            '1.0.0': new Date(NOW - 15 * DAY).toISOString(),
            '2.0.0-beta.1': new Date(NOW - 20 * DAY).toISOString(),
          },
          distTags: {
            latest: '1.5.0',
          },
        }),
      )

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, packageData, target: '@latest' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
      expect(allMessages[1]).to.equal(`test-package 2.0.0-beta.1 → 1.5.0 5 days ago`)
      // if version from dist-tag does not meet cooldown requirement skip finding other versions
      expect(allMessages.join('\n')).not.to.include(`test-package 2.0.0-beta.1 → 1.0.0`)
      expect(allMessages[2]).to.equal(`All dependencies not in cooldown match the @latest package versions :)`)

      logSpy.restore()
      stub.restore()
    })

    it('skip by cooldown upgrades from prerelease to specific tag when target tag version is within cooldown', async () => {
      // Given: test-package@1.0.0-dev.0 (prerelease) installed
      // @next tag is 1.5.0-rc.1 released 3 days ago (within cooldown)
      // older version on @next tag is 1.0.0-next.0 released 15 days ago (outside cooldown)
      const packageData: PackageFile = {
        dependencies: {
          'test-package': '1.0.0-dev.0',
        },
      }
      const stub = stubVersions(
        createMockVersion({
          name: 'test-package',
          versions: {
            '1.5.0-rc.1': new Date(NOW - 3 * DAY).toISOString(),
            '1.1.0-dev.0': new Date(NOW - 15 * DAY).toISOString(),
            '1.0.0-dev.0': new Date(NOW - 20 * DAY).toISOString(),
          },
          distTags: {
            next: '1.5.0-rc.1',
          },
        }),
      )

      const logSpy = Sinon.stub(console, 'log')
      silenceProgressBar()

      await ncu({ ...options, packageData, target: '@next' })

      const allMessages = getNormalizedLogs(logSpy)
      expect(allMessages[0]).to.equal(`Skipped due to ${cooldown}-day cooldown`)
      expect(allMessages[1]).to.equal(`test-package 1.0.0-dev.0 → 1.5.0-rc.1 3 days ago`)
      // if version from dist-tag does not meet cooldown requirement skip finding other versions
      expect(allMessages.join('\n')).not.to.include(`test-package 1.0.0-dev.0 → 1.1.0-dev.0`)
      expect(allMessages[2]).to.equal(`All dependencies not in cooldown match the @next package versions :)`)

      logSpy.restore()
      stub.restore()
    })
  })
})
