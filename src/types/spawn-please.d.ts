// add to tsconfig compilerOptions.paths
declare module 'spawn-please' {
  export default function(command: string, args?: string[], options?: any, spawnOptions?: any): Promise<{ 
    stdout: string, 
    stderr: string 
  }>;
}
