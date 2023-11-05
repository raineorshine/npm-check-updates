export interface SpawnPleaseOptions {
  rejectOnError?: boolean
  stdin?: string
  stdout?: (s: string) => void
  stderr?: (s: string) => void
}
