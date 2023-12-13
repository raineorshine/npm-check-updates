import { Index } from './IndexType.js'

export type NpmConfig = Index<string | boolean | ((path: string) => string | { ca: string[] } | undefined)>
