import { Index } from './IndexType'

export interface DependencyGroup {
  heading: string
  groupName: string
  packages: Index<string>
}
