import { Index } from './IndexType'
import { Options } from './Options'
import { Packument } from './Packument'
import { Version } from './Version'

export type MockedVersions =
  | Version
  | Partial<Packument>
  | Index<Version>
  | Index<Partial<Packument>>
  | ((options: Options) => Index<Version> | Index<Partial<Packument>> | null)
