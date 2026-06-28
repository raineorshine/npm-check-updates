import { type Index } from './IndexType.ts'

export type NpmConfig = Index<string | string[] | boolean | ((path: string) => string | { ca: string[] } | undefined)>
