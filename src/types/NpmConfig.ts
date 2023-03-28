import { Index } from './IndexType'

export type NpmConfig = Index<string | boolean | ((path: string) => string | { ca: string[] } | undefined)>
