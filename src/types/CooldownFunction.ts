/** A function that can be provided to the --cooldown option for custom cooldown predicate. */
export type CooldownFunction = (packageName: string) => number | null
