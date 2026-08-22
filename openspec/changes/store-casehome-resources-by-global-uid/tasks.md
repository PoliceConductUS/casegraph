## 1. Kind Storage Semantics And Case Membership

- [x] 1.1 Add focused failing tests for `Case.spec.resources`, strict unknown
      fields, node/legal-effect-edge categories, and typed reference and
      owned-path selectors.
- [x] 1.2 Extend resource kind definitions and the production `Case` contract
      with the smallest typed storage semantics, then make the focused tests
      pass.

## 2. Rooted Global-UID Membership

- [ ] 2.1 Add focused failing tests for canonical root and UID-folder loading,
      root/non-root resources, common node/edge resolution, transitive exact
      membership, cycles, and unreferenced resolution refusal.
- [ ] 2.2 Implement the eager rooted CaseHome snapshot and global-UID resolver,
      then make the focused membership tests pass.

## 3. Storage Rejection And Owned Paths

- [ ] 3.1 Add focused failing tests for typed `files/` and `audits/` paths,
      undeclared files, missing resources, folder/UID mismatches, duplicate root
      UIDs, invalid envelopes, and every owned-path escape form.
- [ ] 3.2 Implement canonical storage diagnostics and owned-path containment,
      then make the focused rejection tests pass.

## 4. Change Verification

- [ ] 4.1 Run focused storage tests and the complete repository validation,
      then resolve every failure within this change's scope.
- [ ] 4.2 Verify Issue #41 acceptance-criteria coverage, complete the OpenSpec
      verification and retrospective artifacts, and archive the accepted change
      before marking the draft pull request ready.
