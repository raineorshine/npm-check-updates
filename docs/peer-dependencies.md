# Peer dependency resolution (`--peer`)

`--peer` makes ncu refuse upgrades whose peer dependencies cannot be satisfied. The resolution is recursive and
option-coupled, which means **reading it gives you a hypothesis, not an answer** — every claim below was established
by running the CLI or a test, and a change here should be too.

## The moving parts

Peer specs enter the pipeline from two directions, and conflating them is the usual source of confusion.

- **Filtering.** `filterPredicate` in [../src/package-managers/filters.ts](../src/package-managers/filters.ts) drops
  candidate _versions_ that violate `options.peerDependencies` — the peers of the packages at their **current**
  versions, fetched once in [../src/lib/runLocal.ts](../src/lib/runLocal.ts). A package constrained this way never
  appears as an upgrade at all; it is capped, not reported.
- **Post-upgrade checking.** `checkIfInPeerViolation` in
  [../src/lib/upgradePackageDefinitions.ts](../src/lib/upgradePackageDefinitions.ts) takes the upgrades that survived
  filtering and removes the ones whose **post-upgrade** peers conflict, returning the survivors in
  `filteredUpgradedDependencies`. This is what catches a package that only acquires a new peer requirement once it is
  upgraded.

The `do`/`while` loop around the checker requeries with the post-upgrade peer map, capping at 6 passes before throwing
`Stuck in a while loop. Please report an issue`. It exits in one of two ways: the upgrades stop violating anything, or
the peer map stops changing between passes. The second exit is the subtle one, and it must keep the non-violating
upgrades rather than abandoning the whole set — dropping every upgrade because one of them was unresolvable was
[#2072](https://github.com/raineorshine/npm-check-updates/issues/2072). Filtering there also has to repeat until the
set settles, because dropping one upgrade can invalidate another that had been kept.

## The ignored-updates table is a diff, not a record

`getIgnoredUpgradesDueToPeerDeps` does not observe what the peer logic rejected. It recomputes the upgrades with
`peer: false` and lists **every package whose result differs from the final upgrade set**, then tries to attach a
reason:

```text
Ignored incompatible updates (peer dependencies):

 @eslint/js             9.39.1  →   10.0.1  reason: @eslint/js requires eslint ^10.0.0
 @vitejs/plugin-react    6.1.0  →    6.1.1  reason:
```

So an **empty `reason:` is a bug signal, not a peer conflict**. It means the package was dropped somewhere else in
the pipeline and the table inferred a peer cause it could not substantiate. Treat it as a pointer upstream rather
than as output to be tidied.

## Driving the recursion from a test

The recursion only runs when the peer map changes, so a fixture whose peers are constant never reaches the
interesting branches. Mock the registry lookup to return a **different peer map for the upgraded version than for the
current one**:

```js
vi.mock('../src/lib/getPeerDependenciesFromRegistry.ts', () => ({
  default: async packageMap =>
    Object.fromEntries(
      Object.entries(packageMap).map(([name, version]) => [
        name,
        name === 'peer-shifter' && version.startsWith('2') ? { 'pinned-pkg': '^2.0.0' } : {},
      ]),
    ),
}))
```

That forces one pass; if the new requirement is unsatisfiable the upgrade is then dropped and the map reverts, which
is what reaches the second loop exit. `test/peerCooldown.test.ts` and `test/peerPartialUpgrade.test.ts` are both built
this way — reuse the shape instead of adding a fixture. `peerPartialUpgrade` also declares a `chain-head` →
`chain-mid` → `chain-tail` set whose peers never change, which is how the settle-loop is exercised: dropping the tail
invalidates the mid, which invalidates the head.

## Where the behaviour is pinned

- `test/peer.test.ts` — the baseline: peers ignored by default, checked under `--peer`, circular peers, git URLs,
  `catalog:` specs.
- `test/peerPartialUpgrade.test.ts` — a mixed set, where some upgrades violate peers and others do not.
- `test/peerCooldown.test.ts` — the recursion interacting with `--cooldown`.
- `test/getIgnoredUpgradesDueToPeerDeps.test.ts` — the table above.
- `test/test-data/peer-post-upgrade/` and `test/test-data/peer-post-upgrade-no-upgrades/` — fixtures for the
  post-upgrade checker, the second asserting the all-violate case still yields `{}`.

Check the all-violate assertion before changing either loop exit: it passes only because the non-violating set is
empty when everything violates, so it does not distinguish "keep the survivors" from "keep nothing".

## Dead ends

- **Reading the peer code to decide which option caused a symptom.** Filtering and post-upgrade checking produce
  different-looking output from the same conflict, and `--cooldown` (which this repo's `.npmrc` turns on implicitly —
  see [../AGENTS.md](../AGENTS.md)) removes versions before peers are ever consulted. Toggle one option at a time on
  the CLI instead.
- **Trusting the ignored-updates table to say why a package was skipped.** See above; it is reconstructed, not
  recorded.
