import { z } from 'zod'

const catalogFields = {
  catalog: z.optional(z.record(z.string(), z.string())),
  catalogs: z.optional(z.record(z.string(), z.record(z.string(), z.string()))).catch(undefined),
}

export const CatalogsConfig = z.object({
  ...catalogFields,
  // Support catalogs nested under a `workspaces` key (e.g. workspaces.catalog, workspaces.catalogs)
  workspaces: z.optional(z.union([z.array(z.string()), z.object(catalogFields).passthrough()])).catch(undefined),
})

export type CatalogsConfig = z.infer<typeof CatalogsConfig>
