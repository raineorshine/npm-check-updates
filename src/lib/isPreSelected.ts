import { type InteractiveSelect, type ResolvedInteractiveSelect } from '../types/InteractiveSelect.ts'
import { type Options } from '../types/Options.ts'
import { partChanged } from './version-util.ts'

/** The upgrade groups that are pre-selected for each --interactiveSelect value. `all` pre-selects every group, including custom groups returned by --groupFunction, so it is not enumerated here. */
const preSelectedGroups: Record<Exclude<ResolvedInteractiveSelect, 'all'>, string[]> = {
  none: [],
  patch: ['patch'],
  minor: ['patch', 'minor'],
}

/**
 * Resolves `auto` (the default) to a concrete --interactiveSelect value. `auto` preserves the historical behavior:
 * patch and minor are pre-selected with `--format group`, and everything is pre-selected otherwise.
 */
export const resolveInteractiveSelect = (options: Options): ResolvedInteractiveSelect => {
  const interactiveSelect: InteractiveSelect = options.interactiveSelect ?? 'auto'
  return interactiveSelect !== 'auto' ? interactiveSelect : options.format?.includes('group') ? 'minor' : 'all'
}

/**
 * Determines if an upgrade group is pre-selected in interactive mode. majorVersionZero and custom groups are only
 * pre-selected by `all`, since anything may change in a 0.x upgrade and custom groups have unknown semantics.
 */
export const isPreSelectedGroup = (groupName: string, interactiveSelect: ResolvedInteractiveSelect): boolean =>
  interactiveSelect === 'all' || preSelectedGroups[interactiveSelect].includes(groupName)

/** Determines if a dependency upgrade is pre-selected in interactive mode, based on the semver part that changed. */
export const isPreSelectedUpgrade = (
  from: string,
  to: string,
  interactiveSelect: ResolvedInteractiveSelect,
): boolean => {
  // short-circuit the group derivation, which is not needed when everything or nothing is pre-selected
  if (interactiveSelect === 'all') return true
  if (interactiveSelect === 'none') return false
  return isPreSelectedGroup(partChanged(from, to), interactiveSelect)
}
