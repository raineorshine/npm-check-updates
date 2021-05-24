// add to tsconfig compilerOptions.paths
// TODO: Why?!?
// error TS1208: 'remote-git-tags.ts' cannot be compiled under '--isolatedModules' because it is considered a global script file. Add an import, export, or an empty 'export {}' statement to make it a module.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
declare module 'remote-git-tags' {
  export default function(url: string): Promise<Map<string, string>>
}
