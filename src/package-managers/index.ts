import { Index } from '../types/IndexType'
import { PackageManager } from '../types/PackageManager'
import * as npm from './npm'
import * as yarn from './yarn'
import * as gitTags from './gitTags'

export default {
  npm,
  yarn,
  gitTags,
} as Index<PackageManager>
