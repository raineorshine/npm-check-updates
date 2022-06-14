// This file cannot be named Index.ts as it conflicts with default directory import.

/** A very generic object. */
export type Index<T = any> = { [key: string]: T }
