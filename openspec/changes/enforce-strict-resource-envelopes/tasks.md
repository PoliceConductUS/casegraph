## 1. Global Resource Identity

- [x] 1.1 Add focused failing tests for valid and invalid CUID2 resource UIDs,
      UID-only references, composite-reference rejection, and duplicate UIDs across
      kinds.
- [x] 1.2 Implement the shared resource UID/reference schema and cross-kind
      uniqueness validator, then make the focused tests pass.

## 2. Strict Kind Definitions And Dispatch

- [x] 2.1 Add focused failing tests for the initial `Case` definition,
      schema-declared status, exact API/kind dispatch, unknown fields at every
      envelope level, and recognized fields in the wrong section.
- [x] 2.2 Implement strict kind definitions, the first `Case` resource, and
      exact registry dispatch without a catch-all resource schema, then make the
      focused tests pass.

## 3. Deterministic Resource Documents

- [ ] 3.1 Add focused failing tests for malformed YAML, deterministic
      serialization, successful round trips, invalid-write refusal, and preserving
      an existing destination.
- [ ] 3.2 Implement the resource document reader/writer boundary with
      pre-write validation, round-trip validation, and exclusive file creation,
      then make the focused tests pass.

## 4. Change Verification

- [ ] 4.1 Run focused resource tests and the complete repository validation,
      then resolve every failure within this change's scope.
- [ ] 4.2 Verify Issue #40 acceptance-criteria coverage, complete the OpenSpec
      verification and retrospective artifacts, and archive the accepted change
      before marking the draft pull request ready.
