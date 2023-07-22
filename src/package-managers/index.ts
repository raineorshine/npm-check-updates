import { Index } from '../types/IndexType'
import { PackageManager } from '../types/PackageManager'
import * as bun from './bun'
import * as gitTags from './gitTags'
import * as npm from './npm'
import * as pnpm from './pnpm'
import * as staticRegistry from './staticRegistry'
import * as yarn from './yarn'

export default {
  npm,
  pnpm,
  yarn,
  bun,
  gitTags,
  staticRegistry,
} as Index<PackageManager>
