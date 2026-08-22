## 1. Machine Registration

- [ ] 1.1 Add focused failing tests for strict `casehomes.yaml` reads,
      canonical real root paths, identical no-op registration, conflicting
      paths, malformed mappings, and atomic publication.
- [ ] 1.2 Implement the smallest injectable registration boundary and make the
      focused tests pass.

## 2. Read-Only Primary Repository Inspection

- [ ] 2.1 Add focused failing tests for exact CaseFolder/CaseHome derivation,
      strict rooted resource loading, Git root/common-dir/branch/state/remotes,
      registration and recovery reports, symlinks, inherited roots, bare repos,
      linked worktrees, and byte/ref immutability.
- [ ] 2.2 Implement exact read-only repository inspection through injectable
      Git and registration boundaries, then make the focused tests pass.

## 3. Local CaseHome Preparation

- [ ] 3.1 Add focused failing tests for missing and nonempty CaseFolders, empty
      CaseHome children, explicitly approved and declined existing non-Git
      CaseHomes, conflicting roots/children, and no commit/remote/registration.
- [ ] 3.2 Implement exact-child Git initialization and strict root writing or
      adoption, then make the focused preparation tests pass.

## 4. Push-Backed Finalization And Existing Registration

- [ ] 4.1 Add focused failing tests for missing push targets, first commit and
      immediate push, post-push revalidation, push/validation/registration
      failures, committed dirty remote-less registration, unborn and untracked
      root rejection, and recovery-state preservation.
- [ ] 4.2 Implement finalization and existing-repository registration, then make
      the focused tests pass using a real local bare remote for push behavior.

## 5. Change Verification

- [ ] 5.1 Run focused repository tests and the complete repository validation,
      then resolve every failure within this change's scope.
- [ ] 5.2 Verify Issue #42 acceptance-criteria coverage, complete the OpenSpec
      verification and retrospective artifacts, and archive the accepted change
      before marking the draft pull request ready.
