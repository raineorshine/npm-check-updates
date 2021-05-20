// add to tsconfig compilerOptions.paths
declare module 'cint' {
  export function filterObject<T = any>(obj: Index<T>, f: (key: string, value: T) => boolean): Index<T>
  export function mapObject<T = any, R = any>(obj: Index<T>, f: (key: string, value: T) => R): Index<R>
  export function toArray<T = any, R = any>(object: Index<T>, f: (key: string, value: T) => R): R[]
  export function toObject<T = any, R = any>(arr: T[], f: (value: T, i: number) => Index<R>): Index<R>
}
