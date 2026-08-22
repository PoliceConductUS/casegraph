## Design Summary

Issue #41 adds one CaseHome storage boundary on top of the strict resource
envelopes from Issue #40. The Case resource gains a strict ordered
`spec.resources` array of global resource UIDs. Starting from
`<casehome>/root.yaml`, the storage boundary follows that array and each
resolved kind's explicitly declared typed resource-reference fields. It never
recursively scans directories.

Every non-root resource is read only from
`<casehome>/<metadata.uid>/root.yaml`. A kind definition declares whether the
kind is a node or legal-effect edge and may declare typed selectors for its
resource references and owned paths. Owned paths must begin with `files/` or
`audits/`, remain relative to their resource folder, and cannot escape it.

Opening a CaseHome validates the root, follows the exact reachable membership,
handles cycles by UID, and rejects missing resources, a second authoritative
root-UID document, folder/UID mismatches, invalid envelopes, undeclared UID
resolution, and escaping owned paths. Tests register strict fixture node and
legal-effect-edge kinds; this change does not invent production graph
taxonomies.

## Alternatives Considered

### Approach A: Rooted typed-reference traversal

- **Approach:** Make `Case.spec.resources` the root membership list, follow
  per-kind declared UID references, and resolve every non-root UID through its
  canonical folder.
- **Advantages:** Matches ADRs 0010 and 0013; gives exact membership without
  scanning; supports cycles and node/edge resolution through one boundary.
- **Disadvantages:** Each kind must explicitly declare which typed properties
  contain resource references and owned paths.

### Approach B: Recursively index every UID-shaped directory

- **Approach:** Scan all CaseHome directories and treat matching `root.yaml`
  files as members.
- **Advantages:** Finds resources without adding root membership fields.
- **Disadvantages:** Directory presence becomes authority, unreferenced data
  enters the graph, and operation/package folders risk accidental discovery.
- **Why not selected:** Issue #41 and ADR 0010 expressly forbid recursive
  directory discovery.

### Approach C: Separate node and edge storage trees

- **Approach:** Store resources under `nodes/<uid>/` and `edges/<uid>/`, using
  the reference type to choose a tree.
- **Advantages:** The filesystem exposes a resource classification before read.
- **Disadvantages:** Splits the global namespace and requires callers to know a
  kind category before resolving a UID.
- **Why not selected:** It directly conflicts with the accepted single-folder,
  global-UID architecture.

## Agreed Approach

Use Approach A. It is the smallest complete design that makes the Case root
authoritative, preserves one UID namespace, supports typed owned content, and
keeps all discovery explicit and testable.

## Key Decisions

- `Case.spec.resources` is an ordered, strict array of `ResourceUid` values and
  is the only root-level membership source.
- A non-root resource's authoritative location is exactly
  `<casehome>/<uid>/root.yaml`.
- Kind definitions declare `node` or `legal-effect-edge`; the UID and storage
  boundary do not encode that distinction.
- Kind definitions may expose typed resource-reference and owned-path values
  only after their strict schema validates the resource.
- Repeated references, direct Case self-references, and transitive references
  back to the Case root resolve once by UID; they are cycles, not duplicates.
- A duplicate root identity exists only when both `<casehome>/root.yaml` and
  `<casehome>/<root-uid>/root.yaml` claim the Case root UID. The boundary checks
  that one known shadow path without scanning other directories.
- An API request to resolve a UID outside the rooted membership fails even if a
  matching directory exists.
- Owned paths are normalized only for validation; the stored value is not
  rewritten. Absolute paths, `..`, empty paths, bare `files`/`audits`
  directories, and paths outside those directories fail. Existing path
  segments are realpath-checked so symlinks cannot escape the resource folder.
- The boundary validates owned paths but does not require owned files to exist;
  missing-file behavior belongs to the concrete kind that requires that file.
- The snapshot exposes membership queries and a count, not discovery order;
  traversal order remains outside this change.
- Legacy `CaseHome`, `CaseLocator`, flat graph records, and `cases new` remain
  untouched in this stack layer.

## Open Questions

None. Git initialization, operation worktrees, mutation, traversal handles, and
production node/edge taxonomies belong to later issues.
