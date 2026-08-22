## 1. Machine Registration

- [ ] 1.1 Add focused failing tests for strict `casehomes.yaml` reads,
      canonical real root paths, identical no-op registration, conflicting
      ID/path pairs, inverse root/ID conflicts, malformed mappings, unchanged
      bytes on every rejection, regular registry/root entries, new `0600` and
      replacement-mode preservation, inter-process guard contention and latest
      snapshot serialization, truthful `retained`, `absent/ownership-lost`, or
      `unknown` guard cleanup state, foreign-replacement preservation, dual
      primary-plus-cleanup diagnostic preservation, and exclusive atomic
      publication without retry.
- [ ] 1.2 Implement the smallest injectable registration boundary and make the
      focused tests pass within cooperative-writer scope without changing
      unrelated CaseHome behavior.

## 2. Read-Only Primary Repository Inspection

- [ ] 2.1 Add focused failing tests for exact CaseFolder/CaseHome derivation,
      strict rooted resource loading, Git root/common-dir/branch/state/remotes,
      registration and recovery reports, symlinks, inherited non-primary roots,
      bare repos, every `.git`-file checkout, CLI/import boundaries, and byte/ref
      immutability.
- [ ] 2.2 Implement exact read-only repository inspection through injectable
      Git and registration boundaries, then make the focused tests pass.

## 3. Local CaseHome Preparation

- [ ] 3.1 Add focused failing tests for missing and nonempty CaseFolders, empty
      CaseHome children, explicitly approved and declined existing non-Git
      CaseHomes with complete rooted graphs, rejection of nonempty new
      membership, inherited outer-owned-state and pre-existing-status
      preservation plus only a conditional natural nested-child status delta,
      outer-ignore suppression, adoption of already-present child content, Git
      availability before paths, init/write/reopen failures, malformed
      portable-config and lock preservation, and no commit/remote/registration.
- [ ] 3.2 Implement exact-child Git initialization and strict root writing or
      adoption, then make the focused preparation tests pass.

## 4. Push-Backed Finalization And Existing Registration

- [ ] 4.1 Add focused failing tests for missing push targets, first commit and
      immediate push, staging/commit/commit-ID/push failures, separate post-push
      resource and Git failures, registration failure, exact state inventory,
      committed dirty remote-less registration, unborn and untracked root
      rejection, array-aware remote-mutation prohibition, and recovery-state
      preservation.
- [ ] 4.2 Implement finalization and existing-repository registration, then make
      the focused tests pass using a real local bare remote for push behavior.

## 5. Change Verification

- [ ] 5.1 Run focused repository tests and the complete repository validation,
      then resolve every failure within this change's scope.
- [ ] 5.2 Verify Issue #42 acceptance-criteria coverage, complete the OpenSpec
      verification and retrospective artifacts including the Task 1
      inter-process, entry-type, permission, guard-cleanup, and compound-failure
      evidence, including truthful `retained`, `absent/ownership-lost`, or
      `unknown` classification, and archive the accepted change before marking
      the draft pull request ready.
