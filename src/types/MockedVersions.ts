import { Index } from './IndexType'
import { Options } from './Options'
import { Version } from './Version'

export type MockedVersions = Version | Index<Version> | ((options: Options) => Index<Version> | null)
