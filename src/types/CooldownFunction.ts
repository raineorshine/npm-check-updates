/** A function that can be provided to the `--cooldown` option for a custom cooldown predicate. */
export type CooldownFunction = (packageName: string) => number | string | null
