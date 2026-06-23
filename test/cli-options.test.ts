import { describe, expect, it } from 'vitest'
import cliOptions from '../src/cli-options.ts'

describe('cli-options', () => {
  it('require long and description properties', () => {
    for (const option of cliOptions) {
      expect(option).toHaveProperty('long')
      expect(option).toHaveProperty('description')
    }
  })
})
