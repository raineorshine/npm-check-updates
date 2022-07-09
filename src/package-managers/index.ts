import { Index } from '../types/IndexType'
import { PackageManager } from '../types/PackageManager'
import * as gitTags from './gitTags'
import * as npm from './npm'
import * as staticRegistry from './staticRegistry'
import * as yarn from './yarn'

export default {
  npm,
  yarn,
  gitTags,
  staticRegistry,
} as Index<PackageManager>
