import * as v from 'valibot'

const catalogFields = {
  catalog: v.optional(v.record(v.string(), v.string())),
  // eslint-disable-next-line unicorn/no-useless-undefined -- zod .catch() requires an argument
  catalogs: v.fallback(v.optional(v.record(v.string(), v.record(v.string(), v.string()))), undefined),
}

export const CatalogsConfig = v.object({
  ...catalogFields,
  // Support catalogs nested under a `workspaces` key (e.g. workspaces.catalog, workspaces.catalogs)
  // eslint-disable-next-line unicorn/no-useless-undefined -- zod .catch() requires an argument
  workspaces: v.fallback(v.optional(v.union([v.array(v.string()), v.looseObject(catalogFields)])), undefined),
})

export type CatalogsConfig = v.InferOutput<typeof CatalogsConfig>

/** Parses and validates an unknown value against the catalogs config schema. */
export const parseCatalogsConfig = (data: unknown): CatalogsConfig => v.parse(CatalogsConfig, data)
