import { type Index } from './IndexType'

export type NpmConfig = Index<string | string[] | boolean | ((path: string) => string | { ca: string[] } | undefined)>
