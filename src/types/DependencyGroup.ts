import { type Index } from './IndexType.ts'

export interface DependencyGroup {
  heading: string
  groupName: string
  packages: Index<string>
}
