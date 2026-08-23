import prompts from 'prompts-ncu'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ncu from '../src/index.ts'
import stubVersions from './helpers/stubVersions.ts'

vi.mock('prompts-ncu', () => {
  const prompt = vi.fn(async () => ({ value: [] }))
  return { default: Object.assign(prompt, { inject: vi.fn(), override: vi.fn() }) }
})

const packageData = {
  dependencies: {
    'patch-dep': '1.0.0',
    'minor-dep': '1.0.0',
    'major-dep': '1.0.0',
    'major-version-zero-dep': '0.1.0',
  },
}

const versions = {
  'patch-dep': '1.0.1',
  'minor-dep': '1.1.0',
  'major-dep': '2.0.0',
  'major-version-zero-dep': '0.2.0',
}

/** Runs ncu in interactive mode and returns the names of the pre-selected dependencies, sorted for stable comparison across group and non-group formats. */
const preSelected = async (options: Parameters<typeof ncu>[0]): Promise<string[]> => {
  const stub = stubVersions(versions)
  try {
    await ncu({ packageData, interactive: true, jsonUpgraded: true, ...options })
  } finally {
    stub.restore()
  }

  const { choices } = vi.mocked(prompts).mock.calls.at(-1)![0] as any
  return choices
    .filter((choice: any) => choice.selected)
    .map((choice: any) => choice.value)
    .sort()
}

afterEach(() => {
  vi.mocked(prompts).mockClear()
})

describe('--interactiveSelect', () => {
  describe('--format group', () => {
    const format = ['group']

    it('defaults to patch and minor', async () => {
      expect(await preSelected({ format })).toStrictEqual(['minor-dep', 'patch-dep'])
    })

    it('auto', async () => {
      expect(await preSelected({ format, interactiveSelect: 'auto' })).toStrictEqual(['minor-dep', 'patch-dep'])
    })

    it('none', async () => {
      expect(await preSelected({ format, interactiveSelect: 'none' })).toStrictEqual([])
    })

    it('patch', async () => {
      expect(await preSelected({ format, interactiveSelect: 'patch' })).toStrictEqual(['patch-dep'])
    })

    it('minor', async () => {
      expect(await preSelected({ format, interactiveSelect: 'minor' })).toStrictEqual(['minor-dep', 'patch-dep'])
    })

    it('all', async () => {
      expect(await preSelected({ format, interactiveSelect: 'all' })).toStrictEqual([
        'major-dep',
        'major-version-zero-dep',
        'minor-dep',
        'patch-dep',
      ])
    })
  })

  describe('without --format group', () => {
    const format: string[] = []

    it('defaults to all', async () => {
      expect(await preSelected({ format })).toStrictEqual([
        'major-dep',
        'major-version-zero-dep',
        'minor-dep',
        'patch-dep',
      ])
    })

    it('auto', async () => {
      expect(await preSelected({ format, interactiveSelect: 'auto' })).toStrictEqual([
        'major-dep',
        'major-version-zero-dep',
        'minor-dep',
        'patch-dep',
      ])
    })

    it('none', async () => {
      expect(await preSelected({ format, interactiveSelect: 'none' })).toStrictEqual([])
    })

    it('patch', async () => {
      expect(await preSelected({ format, interactiveSelect: 'patch' })).toStrictEqual(['patch-dep'])
    })

    it('minor', async () => {
      expect(await preSelected({ format, interactiveSelect: 'minor' })).toStrictEqual(['minor-dep', 'patch-dep'])
    })

    it('all', async () => {
      expect(await preSelected({ format, interactiveSelect: 'all' })).toStrictEqual([
        'major-dep',
        'major-version-zero-dep',
        'minor-dep',
        'patch-dep',
      ])
    })
  })
})
