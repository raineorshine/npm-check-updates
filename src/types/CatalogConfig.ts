import { z } from 'zod'

export const CatalogsConfig = z.object({
  catalog: z.optional(z.record(z.string(), z.string())),
  catalogs: z.optional(z.record(z.string(), z.record(z.string(), z.string()))).catch(undefined),
})

export type CatalogsConfig = z.infer<typeof CatalogsConfig>
