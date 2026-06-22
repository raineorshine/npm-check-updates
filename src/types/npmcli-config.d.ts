// @npmcli/config is typed by @types/npmcli__config. Only the deep `lib/definitions`
// subpath is untyped (not part of the package's public entry), so shim just that.
// Keep this file import-free so the `declare module` stays an ambient declaration.
declare module '@npmcli/config/lib/definitions/index.js' {
  const mod: {
    definitions: Record<string, any>
    shorthands: Record<string, string[]>
    flatten: (data: Record<string, any>, flattened: Record<string, any>) => void
  }
  export default mod
}
