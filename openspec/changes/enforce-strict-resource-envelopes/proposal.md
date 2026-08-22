## Why

CaseGraph currently has strict readers for legacy workspace documents, but it
does not have the ADR 0009 boundary required by the new CaseHome architecture.
Without one registered schema per resource kind, invented or misplaced fields
can enter the graph and global UID resolution cannot rely on a validated
envelope. Issue #40 supplies that foundation before UID-folder storage and
GitHub-backed CaseHomes are implemented.

## What Changes

- Add one exact CaseGraph resource API version and one validated CUID2 resource
  UID/reference type.
- Add a registry that dispatches to a complete strict schema and reader/writer
  pair by exact `apiVersion` and `kind`.
- Add the first concrete `Case` resource kind with only `metadata.uid` and a
  strict empty `spec` at this layer.
- Reject unknown or misplaced fields, unknown versions and kinds, invalid UIDs,
  and duplicate UIDs.
- Create deterministic YAML without overwriting an existing resource.
- Leave legacy workspace documents and commands unchanged; no compatibility or
  migration path is added.

## Capabilities

### New Capabilities

- `case-resources`: Strict kind-specific CaseGraph resource envelopes, global
  UID/reference validation, deterministic resource readers/writers, and
  duplicate-UID rejection.

### Modified Capabilities

None.

## Impact

- Adds a focused `src/resources/` feature package and colocated tests.
- Uses the existing `@paralleldrive/cuid2`, `yaml`, and `zod` dependencies.
- Establishes the reader/writer API consumed by later Issue #41 and Issue #45
  changes.
- Does not change current CLI behavior, legacy `CaseHome`/`CaseLocator`
  documents, filesystem layout, or dependencies.
