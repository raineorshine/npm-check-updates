import { Index } from '../types/IndexType'
import { PackageManager } from '../types/PackageManager'
import * as npm from './npm'
import * as yarn from './yarn'
import * as gitTags from './gitTags'
import * as staticRegistry from './staticRegistry'

export default {
  npm,
  yarn,
  gitTags,
  staticRegistry,
} as Index<PackageManager>
