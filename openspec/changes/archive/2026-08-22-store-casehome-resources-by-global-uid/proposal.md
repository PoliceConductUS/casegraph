## Why

Strict resource envelopes do not yet establish where CaseHome resources live,
which resources belong to a case graph, or how a global UID resolves. Issue #41
adds the authoritative rooted storage boundary required before Git-backed
CaseHomes and GitHub bootstrap commands can safely create or read graph data.

## What Changes

**Case membership**

- From: The foundation `Case` resource has an empty strict `spec`.
- To: `Case.spec.resources` is an ordered array of global resource UIDs and the
  root source of graph membership.
- Reason: Membership must be explicit and must not depend on directory scans.
- Impact: Intentional breaking evolution of the new resource contract; no
  legacy migration is added.

**Global-UID resource storage**

- Add one CaseHome boundary that reads `<casehome>/root.yaml` and resolves every
  reachable non-root resource from `<casehome>/<uid>/root.yaml`.
- Add kind-declared node/legal-effect-edge classification, typed reference
  discovery, and typed owned-path discovery.
- Reject missing, mismatched, duplicate, invalid, unreferenced, or escaping
  resources and paths while handling repeated references and cycles by UID.

## Capabilities

### New Capabilities

- `casehome-resource-storage`: Rooted membership, canonical UID-folder
  resolution, node/edge classification, owned-path containment, cycles, and
  storage failures.

### Modified Capabilities

- `case-resources`: Add `Case.spec.resources` and kind-declared category,
  reference, and owned-path semantics.

## Impact

- Updates `src/resources/case/case-resource.ts` and the resource-kind definition
  boundary.
- Adds a package-by-outcome CaseHome storage module and focused tests.
- Adds no external dependency, CLI command, infrastructure, migration, or
  compatibility layer.
