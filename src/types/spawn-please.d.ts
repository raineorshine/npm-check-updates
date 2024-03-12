// add to tsconfig compilerOptions.paths
declare module 'spawn-please' {
  export default function(command: string, args?: string[], options?: {
    rejectOnError?: boolean | undefined;
    stdin?: string | undefined;
    stderr?: ((data: string) => void) | undefined;
    stdout?: ((data: string) => void) | undefined;
}, spawnOptions?: any): Promise<{ 
    stdout: string, 
    stderr: string 
  }>;
}
