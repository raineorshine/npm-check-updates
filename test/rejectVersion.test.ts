import { describe, expect, it } from 'vitest'
import ncu from '../src/index.ts'
import stubVersions from './helpers/stubVersions.ts'

describe('rejectVersion', () => {
  it('reject by package version with string', async () => {
    const stub = stubVersions({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      rejectVersion: '1.0.0',
    })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-return-version')

    stub.restore()
  })

  it('reject by package version with space-delimited list of strings', async () => {
    const stub = stubVersions({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      rejectVersion: '1.0.0 0.1.0',
    })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-return-version')
    expect(upgraded).not.toHaveProperty('fp-and-or')

    stub.restore()
  })

  it('reject by package version with comma-delimited list of strings', async () => {
    const stub = stubVersions({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      rejectVersion: '1.0.0,0.1.0',
    })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).toHaveProperty('ncu-test-return-version')
    expect(upgraded).not.toHaveProperty('fp-and-or')

    stub.restore()
  })

  it('reject by package version with RegExp', async () => {
    const stub = stubVersions({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      rejectVersion: /^1/,
    })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).not.toHaveProperty('ncu-test-return-version')
    expect(upgraded).toHaveProperty('fp-and-or')

    stub.restore()
  })

  it('reject by package version with RegExp string', async () => {
    const stub = stubVersions({
      'ncu-test-v2': '2.0.0',
      'ncu-test-return-version': '2.0.0',
      'fp-and-or': '0.1.3',
    })

    const pkg = {
      dependencies: {
        'ncu-test-v2': '1.0.0',
        'ncu-test-return-version': '1.0.1',
        'fp-and-or': '0.1.0',
      },
    }

    const upgraded = await ncu({
      packageData: pkg,
      rejectVersion: '/^1/',
    })

    expect(upgraded).not.toHaveProperty('ncu-test-v2')
    expect(upgraded).not.toHaveProperty('ncu-test-return-version')
    expect(upgraded).toHaveProperty('fp-and-or')

    stub.restore()
  })
})
