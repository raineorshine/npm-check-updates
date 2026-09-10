import { type Index } from '../types/IndexType.ts'
import { type PackageManager } from '../types/PackageManager.ts'
import * as bun from './bun.ts'
import * as gitTags from './gitTags.ts'
import * as jsr from './jsr.ts'
import * as npm from './npm.ts'
import * as pnpm from './pnpm.ts'
import * as staticRegistry from './staticRegistry.ts'
import * as yarn from './yarn.ts'

export default {
  npm,
  pnpm,
  yarn,
  bun,
  gitTags,
  jsr,
  staticRegistry,
} as Index<PackageManager>
