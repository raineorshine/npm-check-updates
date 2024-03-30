import { Index } from '../types/IndexType.js'
import { PackageManager } from '../types/PackageManager.js'
import * as bun from './bun.js'
import * as gitTags from './gitTags.js'
import * as npm from './npm.js'
import * as pnpm from './pnpm.js'
import * as staticRegistry from './staticRegistry.js'
import * as yarn from './yarn.js'

export default {
  npm,
  pnpm,
  yarn,
  bun,
  gitTags,
  staticRegistry,
} as Index<PackageManager>
