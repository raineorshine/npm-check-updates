import { type Packument } from '../../src/types/Packument.ts'

interface CreateMockParams {
  name: string
  versions: Record<string, string>
  distTags?: Record<string, string>
}

/**
 * Creates a mock package version object for testing purposes.
 *
 * @param params - The parameters for creating the mock version.
 * @param params.name - The name of the package.
 * @param params.versions - An object mapping version strings to their corresponding release dates.
 * @param params.distTags - An object representing distribution tags for the package.
 * @returns An object representing mocked package versions, including name, versions, time, and distTags.
 */
const createMockVersion = ({ name, versions, distTags }: CreateMockParams): Partial<Packument> => {
  return {
    name,
    version: Object.keys(versions)[0],
    versions: Object.fromEntries(Object.keys(versions).map(version => [version, { version } as Packument])),
    time: Object.fromEntries(Object.entries(versions).map(([version, date]) => [version, date])),
    'dist-tags': distTags,
  }
}

export default createMockVersion
