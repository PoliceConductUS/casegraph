## Design Summary

Issue #40 establishes the first strict CaseGraph resource boundary without
migrating legacy workspaces or defining the later storage layout. Every resource
reader and writer dispatches on the exact pair
`casegraph.policeconduct.org/v1alpha1` plus a registered kind. The selected kind
owns a strict Zod schema for the complete envelope; there is no generic
catch-all resource schema.

The first production kind is `Case`. At this foundation layer it contains only
the required global `metadata.uid` and an empty strict `spec`. Later OpenSpec
changes will add membership and public case identity fields. Tests may register
strict fixture kinds to prove optional, schema-declared `status` behavior
without inventing additional production resource kinds.

Resource UIDs use the existing CUID2 dependency and one branded scalar type.
The same type represents node IDs, legal-effect edge IDs, and resource
references. A uniqueness validator rejects repeated UIDs without introducing
node/edge namespaces. Writers validate before creating a file, refuse to
overwrite an existing resource, emit deterministic YAML, and prove the emitted
document reads back through the same selected kind definition.

## Alternatives Considered

### Approach A: Registered strict kind definitions

- **Approach:** Register each concrete kind with one complete strict schema and
  one reader/writer pair. A small dispatcher inspects only `apiVersion` and
  `kind`, then delegates full validation to that registered definition.
- **Advantages:** Matches ADR 0009 and Issue #40 exactly; later kinds remain
  independently owned; unknown fields cannot bypass the selected schema.
- **Disadvantages:** Every new resource kind must add and register its own
  definition.

### Approach B: One discriminated catch-all resource union

- **Approach:** Define a central union that accepts common envelope fields and
  branches into kind-specific spec fragments.
- **Advantages:** One apparent schema entry point and less explicit registry
  code.
- **Disadvantages:** Centralizes ownership, encourages permissive common fields,
  and becomes the generic catch-all schema that Issue #40 forbids.
- **Why not selected:** It weakens the one-kind/one-schema boundary and makes
  unrelated kinds change together.

### Approach C: Independent kind modules with no dispatcher

- **Approach:** Expose only functions such as `readCaseResource` and require
  callers to know the kind before reading.
- **Advantages:** Smallest amount of initial code.
- **Disadvantages:** Files cannot be resolved by UID alone because callers must
  already know the kind; unknown versions and kinds lack one deterministic
  failure boundary.
- **Why not selected:** It conflicts with global-UID resolution and the required
  `apiVersion`/`kind` selection behavior.

## Agreed Approach

Use Approach A. It is the smallest design that satisfies strict kind ownership,
deterministic dispatch, global UID references, and future storage resolution
without predefining later kinds or migration behavior.

## Key Decisions

- The API version is exactly `casegraph.policeconduct.org/v1alpha1`.
- Concrete schemas accept only `apiVersion`, `kind`, `metadata`, `spec`, and
  schema-declared `status`.
- `metadata` contains only `uid` until a concrete kind explicitly adds another
  field through OpenSpec.
- A resource UID and a resource reference use the same validated CUID2 scalar.
- Duplicate UIDs fail in one namespace regardless of resource kind.
- The writer is create-only in this issue. Refusing overwrite makes UID
  immutability observable without defining mutation behavior prematurely.
- Determinism is byte-level: writing the same validated resource produces the
  same YAML bytes.
- Legacy `CaseHome`, `CaseLocator`, flat graph records, migration, storage
  folders, and mutation commands remain unchanged.

## Open Questions

None. Later changes own `Case.spec` membership, UID-folder storage, Git-backed
CaseHomes, and GitHub repository identity.
