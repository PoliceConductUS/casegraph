## 1. Typed Envelope Contracts

- [ ] 1.1 Add the current stable `yaml` runtime dependency.
- [ ] 1.2 Add strict `CaseLocator` schema, reader, and writer tests.
- [ ] 1.3 Implement the single `CaseLocator` reader/writer.
- [ ] 1.4 Add strict `CaseHome` schema, reader, and writer tests.
- [ ] 1.5 Implement the single `CaseHome` reader/writer, including atomic
      validated updates.

## 2. External Workspace Creation And Loading

- [ ] 2.1 Add failing tests for `cases new --home`, prompts, `--yes`, existing
      packages, and overwrite rejection.
- [ ] 2.2 Implement external case creation and locator registration.
- [ ] 2.3 Add failing tests for typed case loading, omitted-case discovery,
      package-path validation, repair, and write preconditions.
- [ ] 2.4 Implement the shared external workspace loader and migrate existing
      case operations to it.

## 3. Package Path Command

- [ ] 3.1 Add failing CLI and document tests for `packages add` argument shape,
      order, duplicate rejection, invalid-batch rollback, and relative storage.
- [ ] 3.2 Implement `casegraph packages add <case-id> <path>...` through the
      `CaseHome` writer.
- [ ] 3.3 Prove package-path membership and filesystem permissions do not grant
      managed-write authority.

## 4. CourtListener Import Migration

- [ ] 4.1 Add failing tests for `--write --home`, creation prompts, dry-run
      behavior, and selected-home output.
- [ ] 4.2 Migrate write imports, history, graph records, and root source
      references to the selected `CaseHome`.

## 5. Validation And Completion

- [ ] 5.1 Run focused tests after every red-green implementation step.
- [ ] 5.2 Run repository-wide formatting, lint, tests, typecheck, build, and
      strict OpenSpec validation.
- [ ] 5.3 Record final evidence and known limitations in `verify.md`.
- [ ] 5.4 Run the required retrospective, archive the accepted OpenSpec change
      on this branch, revalidate, and synchronize the stack.
