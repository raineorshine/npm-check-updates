import { Packument } from './Packument'

/** Supported function for filtering after the results are fetched */
export type FilterFetchedFunction = (o: Packument) => boolean
