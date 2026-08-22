## Context

ADR 0009 requires a Kubernetes-style envelope whose exact API version and kind
select a complete strict schema. ADR 0010 gives nodes and legal-effect edges one
global UID namespace and requires references to carry only that UID. Current
workspace readers implement older `CaseHome` and `CaseLocator` contracts; this
change creates the new resource boundary alongside them and does not migrate or
reinterpret those documents.

## Goals / Non-Goals

**Goals:**

- Validate the complete root, metadata, spec, and optional status envelope
  through the selected kind definition.
- Provide one CUID2 resource UID/reference type shared by every kind.
- Dispatch unknown YAML deterministically by exact API version and kind.
- Reject duplicate UIDs across kinds.
- Create deterministic resource YAML that reads back through the same kind
  definition.

**Non-Goals:**

- Define resource-folder storage, graph membership, traversal, mutation, or
  migration.
- Replace legacy `CaseHome` or `CaseLocator` behavior.
- Define package `config.yaml` or future node and legal-effect taxonomies.
- Add another dependency or a Kubernetes runtime.

## Decisions

### Build strict envelopes from kind-owned shapes

`defineResourceKind` accepts a literal kind plus kind-owned Zod object shapes
for `spec` and optional `status`. It constructs the complete strict envelope,
including strict root and metadata objects. This guarantees strictness at every
level without trusting each caller to repeat the common boundary correctly.

There is no generic resource schema. A resource registry contains concrete kind
definitions and selects exactly one definition from the raw YAML's
`apiVersion` and `kind`. The registry then delegates full parsing and canonical
serialization to that definition.

### Keep the first production kind minimal

The initial registry contains only `Case`. Its `spec` is a strict empty object
for Issue #40. Issue #41 will add typed membership, and Issue #45 will add the
canonical public case name. Test-only definitions exercise schema-declared
`status` without creating premature production kinds.

### Separate UID validity from UID uniqueness

`ResourceUidSchema` validates one CUID2 and brands the resulting string.
Resource references parse through the same schema. A separate uniqueness
function accepts validated resources and rejects the first repeated UID,
regardless of kind. Storage and traversal layers can call it without adding a
node/edge discriminator.

### Make the current writer create-only

The writer validates the selected kind, constructs canonical YAML, reads that
YAML back through the same definition, and creates the destination with
exclusive-write semantics. It never overwrites an existing resource. This
makes UID immutability observable now while leaving mutation semantics for the
later Git-operation changes that own them.

### Keep errors at the resource boundary

Malformed YAML, missing dispatch fields, unknown API versions, unknown kinds,
strict-schema failures, duplicate UIDs, and existing destinations fail with an
error identifying the resource path or UID. No invalid or partial resource is
reported as written.

## File Responsibilities

- `src/resources/resource-uid.ts`: global UID/reference schema and uniqueness
  validation.
- `src/resources/resource-kind.ts`: strict kind-definition factory and types.
- `src/resources/resource-document.ts`: registry dispatch plus file read/write
  boundary.
- `src/resources/case/case-resource.ts`: first concrete `Case` definition and
  default registry wiring.
- Colocated `*.test.ts` files: focused RED/GREEN coverage for each contract.

## Risks / Trade-offs

- **[Risk] `Case.spec` is intentionally incomplete at this layer.** → Keep it
  empty and strict; extend it only through Issue #41 and Issue #45 OpenSpec
  deltas.
- **[Risk] Test fixture kinds could be mistaken for product taxonomy.** → Keep
  fixtures inside tests and export only `Case` as a production kind.
- **[Risk] Central dispatch could drift into a catch-all schema.** → The
  dispatcher reads only the two selector strings; every other field is
  validated solely by the selected concrete definition.
- **[Trade-off] Create-only writing does not support resource updates.** →
  Updating resources belongs to later Git-backed mutation contracts and is not
  silently approximated here.

## Migration Plan

No migration runs. The new modules are additive and initially unused by legacy
commands. If the change must be rolled back, remove the new capability spec and
`src/resources/` package; existing workspace behavior is unchanged.

## Open Questions

None.
