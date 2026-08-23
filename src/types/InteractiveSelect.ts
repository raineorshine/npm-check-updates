/** Which upgrades are pre-selected in interactive mode, controlled by `--interactiveSelect`. */
export type InteractiveSelect = 'auto' | 'none' | 'patch' | 'minor' | 'all'

/** An --interactiveSelect value with `auto` resolved to a concrete value. */
export type ResolvedInteractiveSelect = Exclude<InteractiveSelect, 'auto'>
