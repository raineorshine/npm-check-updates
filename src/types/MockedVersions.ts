import { type Index } from './IndexType'
import { type Options } from './Options'
import { type Packument } from './Packument'
import { type Version } from './Version'

/** Parameter type for stubVersions. */
export type MockedVersions =
  | Version
  | Partial<Packument>
  | Index<Version>
  | Index<Partial<Packument>>
  | ((options: Options) => Index<Version> | Index<Partial<Packument>> | null)
