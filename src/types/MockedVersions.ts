import { type Index } from './IndexType.ts'
import { type Options } from './Options.ts'
import { type Packument } from './Packument.ts'
import { type Version } from './Version.ts'

/** Parameter type for stubVersions. */
export type MockedVersions =
  | Version
  | Partial<Packument>
  | Index<Version>
  | Index<Partial<Packument>>
  | ((options: Options) => Index<Version> | Index<Partial<Packument>> | null)
