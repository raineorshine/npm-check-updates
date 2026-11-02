import { Ajv } from 'ajv'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import schema from '../src/types/RunOptions.json' with { type: 'json' }

const SCHEMA_URL = 'https://raw.githubusercontent.com/raineorshine/npm-check-updates/main/src/types/RunOptions.json'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

/** Validates an .ncurc config against the published JSON schema and returns the errors. */
const errorsFor = (config: unknown) => {
  validate(config)
  return validate.errors ?? []
}

describe('RunOptions.json schema', () => {
  it('accepts $schema with an absolute url', () => {
    expect(errorsFor({ $schema: SCHEMA_URL, upgrade: true })).toEqual([])
  })

  it('accepts $schema with a relative path', () => {
    expect(errorsFor({ $schema: './node_modules/npm-check-updates/RunOptions.json' })).toEqual([])
  })

  it('rejects a non-string $schema', () => {
    expect(errorsFor({ $schema: 123 })).toContainEqual(
      expect.objectContaining({ instancePath: '/$schema', keyword: 'type' }),
    )
  })

  it('rejects unknown options', () => {
    expect(errorsFor({ $schema: SCHEMA_URL, notAnOption: true })).toContainEqual(
      expect.objectContaining({ keyword: 'additionalProperties', params: { additionalProperty: 'notAnOption' } }),
    )
  })

  it('rejects invalid option values', () => {
    expect(errorsFor({ $schema: SCHEMA_URL, cacheExpiration: 'ten' })).toContainEqual(
      expect.objectContaining({ instancePath: '/cacheExpiration', keyword: 'type' }),
    )
  })
})
