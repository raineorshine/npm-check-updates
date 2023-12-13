import { Index } from './IndexType.js'
import { Options } from './Options.js'
import { Packument } from './Packument.js'
import { Version } from './Version.js'

export type MockedVersions =
  | Version
  | Partial<Packument>
  | Index<Version>
  | Index<Partial<Packument>>
  | ((options: Options) => Index<Version> | Index<Partial<Packument>> | null)
