## Context

Issue #40 established strict kind-owned resource schemas, one branded CUID2
identity type, deterministic YAML, and exact API/kind dispatch. It deliberately
left `Case.spec` empty and did not define CaseHome storage. ADR 0010 now requires
the Case root at `<casehome>/root.yaml`, every non-root resource at
`<casehome>/<uid>/root.yaml`, one node/edge namespace, typed owned paths, and
membership without directory scanning.

The current production registry contains only `Case`. Tests can register strict
fixture kinds, which lets this change prove uniform node and legal-effect-edge
storage without defining a production graph taxonomy.

## Goals / Non-Goals

**Goals:**

- Make `Case.spec.resources` the explicit root membership contract.
- Open and validate the exact reachable CaseHome resource graph by global UID.
- Resolve nodes and legal-effect edges through one kind-agnostic boundary.
- Discover transitive membership and owned paths only through validated,
  kind-declared typed selectors.
- Reject every storage, identity, membership, and containment failure required
  by Issue #41.

**Non-Goals:**

- Do not migrate legacy flat graphs or old CaseHome envelopes.
- Do not initialize Git, create operation worktrees, or change CLI commands.
- Do not define traversal order, mutation transactions, or resource handles.
- Do not add production node or legal-effect-edge kinds beyond `Case`.
- Do not require referenced owned files to exist without a concrete kind
  requirement.

## Decisions

### Extend kind definitions with storage semantics

Each `ResourceKindDefinition` declares a `category` of `node` or
`legal-effect-edge`. It may also provide pure selectors that return typed
resource references and resource-owned relative paths from an already
validated value. Keeping selectors on the kind definition makes the strict
schema the authority and avoids inspecting arbitrary object keys.

`Case` is a node. Its strict spec changes from empty to
`{ resources: ResourceUid[] }`, and its reference selector returns that array.
No category is encoded in a UID, folder, or reference.

### Open one rooted CaseHome snapshot

`openCaseHomeResources(caseHomePath, registry)` reads
`<casehome>/root.yaml`, requires kind `Case`, and follows its typed references
with a visited-UID set. Each first-seen non-root UID resolves only from
`<casehome>/<uid>/root.yaml`. The function returns an immutable snapshot
containing the validated root and a UID-keyed membership map. It exposes a
membership count and UID-only resolution, not discovery order.

A repeated reference to an already visited UID represents the same resource
and terminates that branch, which supports cycles. This includes a direct Case
self-reference and a non-root resource that refers back to the Case root. A
duplicate exists instead when `<casehome>/<root-uid>/root.yaml` creates a second
authoritative document claiming the root UID; the boundary checks that one
known shadow path without recursively scanning directories.

### Resolve only snapshot membership

The snapshot's `resolve(uid)` returns the root when its UID is requested or a
validated non-root member from the map. Any other UID fails even if a matching
directory exists. This makes rooted membership authoritative and prevents
unreferenced path traversal.

### Validate canonical paths and owned containment

After reading a non-root document, its `metadata.uid` must equal the folder UID.
Before reading any root, duplicate-root, or reachable non-root resource
document, every existing segment of its canonical path is resolved against the
real CaseHome. A UID directory or `root.yaml` symlink that resolves outside the
real CaseHome fails before the external document reaches resource inspection.
This check follows only the exact known resource paths and does not scan.

Owned paths returned by the kind definition must be non-empty relative file
paths below `files/` or `audits/`; the bare directory names, absolute paths, and
any `..` segment fail. Lexical containment is always checked. Every existing
path segment is also resolved so a symlink cannot escape the owning resource
folder. A missing final path is allowed after its existing ancestors pass,
because existence belongs to the concrete kind contract. The snapshot reports
normalized absolute owned paths without rewriting the stored resource value.

### Keep storage eager and direct

Opening validates the exact reachable snapshot eagerly. This is smaller than a
lazy cache or generic traversal framework and makes duplicate, missing,
invalid, cycle, and containment behavior deterministic at one boundary. Later
ResourceHandle work may add lazy resolution under its own OpenSpec change.

## Risks / Trade-offs

- **[Risk] Eager opening reads every reachable resource.** → Accept for this
  foundation capability; lazy handles and bounded traversal are explicitly
  deferred to ADR 0012 implementation.
- **[Risk] Selector callbacks could disagree with a kind's schema.** → Invoke
  them only with that definition's validated output and test declared reference
  and owned-path behavior through strict fixture schemas.
- **[Risk] Existing Case values with empty specs no longer satisfy the new Case
  contract.** → This is the intended new architecture; no backward-compatibility
  path or migration is part of Issue #41.
- **[Risk] Unreferenced invalid folders remain unread.** → This is intentional:
  directory presence is not membership, and scanning would violate ADR 0010.

## Migration Plan

No data migration is provided. The change updates the `Case` schema and adds a
new storage module. Rollback is the normal Git revert of this stack layer while
leaving Issue #40 intact.

## Open Questions

None.
