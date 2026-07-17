import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import { type FilterFunction } from '../src/types/FilterFunction.ts'
import { type Index } from '../src/types/IndexType.ts'
import { type TargetFunction } from '../src/types/TargetFunction.ts'
import { type Version } from '../src/types/Version.ts'
import stubVersions from './helpers/stubVersions.ts'

// TODO: Mock based on real output of viewMany
describe('target', () => {
  describe('minor', () => {
    it('do not update major versions with --target minor', async () => {
      const pkgData = await ncu({ target: 'minor', packageData: { dependencies: { chalk: '3.0.0' } } })
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('update minor versions with --target minor', async () => {
      const pkgData = (await ncu({
        target: 'minor',
        packageData: { dependencies: { chalk: '2.3.0' } },
      })) as Index<Version>
      expect(pkgData).toHaveProperty('chalk')
      expect(pkgData.chalk).toBe('2.4.2')
    })

    it('update patch versions with --target minor', async () => {
      const pkgData = (await ncu({
        target: 'minor',
        packageData: { dependencies: { chalk: '2.4.0' } },
      })) as Index<Version>
      expect(pkgData).toHaveProperty('chalk')
      expect(pkgData.chalk).toBe('2.4.2')
    })
  })

  describe('patch', () => {
    it('do not update major versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { chalk: '3.0.0' } } })
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('do not update minor versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { chalk: '2.3.2' } } })
      expect(pkgData).not.toHaveProperty('chalk')
    })

    it('update patch versions with --target patch', async () => {
      const pkgData = (await ncu({
        target: 'patch',
        packageData: { dependencies: { chalk: '2.4.1' } },
      })) as Index<Version>
      expect(pkgData).toHaveProperty('chalk')
      expect(pkgData.chalk).toBe('2.4.2')
    })

    it('skip non-semver versions with --target patch', async () => {
      const pkgData = await ncu({ target: 'patch', packageData: { dependencies: { test: 'github:a/b' } } })
      expect(pkgData).not.toHaveProperty('test')
    })
  })

  describe('newest', () => {
    it('do not require --pre with --target newest', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'newest',
      })
      expect(data).toStrictEqual({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0',
        },
      })
    })

    it('allow --pre 0 with --target newest to exclude prereleases', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'newest',
        pre: false,
      })
      expect(data).toStrictEqual({
        dependencies: {
          'ncu-mock-pre': '1.0.0',
        },
      })
    })

    it('work with --target newest with any invalid or wildcard range', () => {
      return Promise.all([
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: 'invalid range',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '*',
            },
          },
        }),
        ncu({
          jsonAll: true,
          target: 'newest',
          packageData: {
            dependencies: {
              del: '~',
            },
          },
        }),
      ])
    })
  })

  describe('greatest', () => {
    it('do not require --pre with --target greatest', async () => {
      const data = await ncu({
        jsonAll: true,
        packageData: {
          dependencies: {
            'ncu-mock-pre': '1.0.0',
          },
        },
        target: 'greatest',
      })
      expect(data).toStrictEqual({
        dependencies: {
          'ncu-mock-pre': '2.0.0-alpha.0',
        },
      })
    })
  })

  describe('semver', () => {
    describe('^', () => {
      it('highest minor for post-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '^1.0.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '^1.2.0',
          },
        })
      })

      it('highest patch for pre-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-pre1': '^0.1.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-pre1': '^0.1.2',
          },
        })
      })

      // a stable release in range wins over prereleases even with --pre: 1.0.0 satisfies ^1.0.0-alpha.1
      it('prerelease range upgrades to the highest satisfying stable version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-alpha': '^1.0.0-alpha.1',
            },
          },
          pre: true,
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-alpha': '^1.0.0',
          },
        })
      })
    })

    describe('~', () => {
      it('highest patch for post-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '~1.0.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '~1.0.1',
          },
        })
      })

      it('highest patch for pre-1.0 version', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-pre1': '~0.1.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-pre1': '~0.1.2',
          },
        })
      })
    })

    describe('exact version', () => {
      it('ignore exact version range', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1.0.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '1.0.0',
          },
        })
      })
    })

    describe('explicit ranges', () => {
      it('ignore inclusive range', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1.0.0 - 1.3.0',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '1.0.0 - 1.3.0',
          },
        })
      })

      it('ignore >', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '>1',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '>1',
          },
        })
      })

      it('ignore >=', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '>=1',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '>=1',
          },
        })
      })

      it('ignore <', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '<2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '<2',
          },
        })
      })

      it('ignore <=', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '<=2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '<=2',
          },
        })
      })

      it('ignore ||', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '1 || 2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '1 || 2',
          },
        })
      })
    })

    describe('bounded ^ and ~ ranges', () => {
      it('upgrade within an explicit upper bound', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '^1.0.0 <2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '^1.2.0 <2',
          },
        })
      })

      it('do not exceed an upper bound tighter than the caret range', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '^1.0.0 <1.2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '^1.1.1 <1.2',
          },
        })
      })

      it('upgrade a tilde range within an explicit upper bound', async () => {
        const data = await ncu({
          jsonAll: true,
          packageData: {
            dependencies: {
              'ncu-test-semver': '~1.1.0 <1.2',
            },
          },
          target: 'semver',
        })

        expect(data).toStrictEqual({
          dependencies: {
            'ncu-test-semver': '~1.1.1 <1.2',
          },
        })
      })
    })
  })

  describe('custom', () => {
    it('custom target function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      const pkgData = (await ncu({
        target,
        packageData: {
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        },
      })) as Index<Version>
      expect(pkgData).toHaveProperty('eslint-plugin-jsdoc')
      expect(pkgData['eslint-plugin-jsdoc']).toBe('~36.1.1')
      expect(pkgData).toHaveProperty('jsonlines')
      expect(pkgData.jsonlines).toBe('0.1.1')
      expect(pkgData).toHaveProperty('juggernaut')
      expect(pkgData.juggernaut).toBe('2.1.1')
      expect(pkgData).toHaveProperty('mocha')
      expect(pkgData.mocha).toBe('^8.4.0')
    })

    it('custom target and filter function to mimic semver', async () => {
      // eslint-disable-next-line jsdoc/require-jsdoc
      const target: TargetFunction = (name, [{ operator }]) =>
        operator === '^' ? 'minor' : operator === '~' ? 'patch' : 'latest'
      // eslint-disable-next-line jsdoc/require-jsdoc
      const filter: FilterFunction = (_, [{ major, operator }]) =>
        !(major === '0' || major === undefined || operator === undefined)
      const pkgData = (await ncu({
        filter,
        target,
        packageData: {
          dependencies: {
            'eslint-plugin-jsdoc': '~36.1.0',
            jsonlines: '0.1.0',
            juggernaut: '1.0.0',
            mocha: '^8.3.2',
          },
        },
      })) as Index<Version>
      expect(pkgData).toHaveProperty('eslint-plugin-jsdoc')
      expect(pkgData['eslint-plugin-jsdoc']).toBe('~36.1.1')
      expect(pkgData).not.toHaveProperty('jsonlines')
      expect(pkgData).not.toHaveProperty('juggernaut')
      expect(pkgData).toHaveProperty('mocha')
      expect(pkgData.mocha).toBe('^8.4.0')
    })
  })
}) // end 'target'

describe('tags', () => {
  it('upgrade nonprerelease version to specific tag', async () => {
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '0.1.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.0-1')
  })

  it('upgrade prerelease version without preid to nonprerelease', async () => {
    const upgraded = (await ncu({
      target: 'latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-1',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.1.0')
  })

  it('upgrade prerelease version with preid to higher version on a specific tag', async () => {
    const upgraded = (await ncu({
      target: '@beta',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-task-42.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.1-beta.0')
  })

  // can't detect which prerelease is higher, so just allow switching
  it('upgrade from prerelease without preid to prerelease with preid at a specific tag if major.minor.patch is the same', async () => {
    const upgraded = (await ncu({
      target: '@task-42',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-beta.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.0-task-42.0')
  })

  // need to test reverse order too, because by base semver logic preid are sorted alphabetically
  it('upgrade from prerelease with preid to prerelease without preid at a specific tag if major.minor.patch is the same', async () => {
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.0-task-42.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.0-1')
  })

  // comparing semver between different dist-tags is incorrect, both versions could be released from the same latest
  // so instead of looking at numbers, we should focus on intention of the user upgrading to specific dist-tag
  it('downgrade to tag with a non-matching preid and lower patch', async () => {
    const upgraded = (await ncu({
      target: '@task-42',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.0.1-beta.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.0-task-42.0')
  })

  // same as previous, doesn't matter if it's patch, minor or major, comparing different dist-tags is incorrect
  it('downgrade to tag with a non-matching preid and lower minor', async () => {
    const upgraded = (await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.2.0-dev.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('1.0.0-1')
  })

  it('do not downgrade nonprerelease version to lower version with specific tag', async () => {
    const stub = stubVersions('1.0.0-1')

    const upgraded = await ncu({
      target: '@next',
      packageData: {
        dependencies: {
          'ncu-test-tag': '1.1.0',
        },
      },
    })

    expect(upgraded).not.toHaveProperty('ncu-test-tag')

    stub.restore()
  })

  it('do not downgrade to latest with lower version by default', async () => {
    const stub = stubVersions('1.1.0')

    const upgraded = await ncu({
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })

    expect(upgraded).not.toHaveProperty('ncu-test-tag')

    stub.restore()
  })

  it('do not downgrade to latest with lower version with --target latest', async () => {
    const stub = stubVersions('1.1.0')

    const upgraded = await ncu({
      target: 'latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })

    expect(upgraded).not.toHaveProperty('ncu-test-tag')

    stub.restore()
  })

  it('downgrade to latest with lower version with explicit --target @latest', async () => {
    const stub = stubVersions('1.1.0')

    const upgraded = (await ncu({
      target: '@latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('^1.1.0')

    stub.restore()
  })

  it('downgrade to latest with lower version with target function returning @latest', async () => {
    const stub = stubVersions('1.1.0')

    const upgraded = (await ncu({
      target: () => '@latest',
      packageData: {
        dependencies: {
          'ncu-test-tag': '^1.1.1-beta.0',
        },
      },
    })) as Index<Version>

    expect(upgraded['ncu-test-tag']).toBe('^1.1.0')

    stub.restore()
  })
}) // end 'tags'
