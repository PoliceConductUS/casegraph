# Omit Case ID For Single Case Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task if the work is split across agents. For a single worker, follow the TDD steps in order.

**Goal:** Allow complaint document recording to omit `<case-id>` only when exactly one valid case exists.

**Architecture:** Keep command parsing explicit. Add a small valid-case resolver that enumerates `workspace/<case-id>/root.yaml` and counts only valid root case nodes. Reuse the existing complaint document writer after resolving the omitted case ID.

**Tech Stack:** TypeScript CLI in `src/cli.ts`, Vitest acceptance tests in `test/cli.test.ts`, OpenSpec validation.

---

## Task 1: Test Single-Case Resolution

- [ ] **Step 1:** In `test/cli.test.ts`, add a helper if useful to create a valid case root under `workspace/<case-id>/root.yaml` using the current root node shape.
- [ ] **Step 2:** Add a failing acceptance test for `casegraph cases add document complaint <path-to-pdf>` with exactly one valid case. Assert it creates `workspace/<case-id>/complaint.yaml`.
- [ ] **Step 3:** Run:

  ```bash
  npm test -- --run test/cli.test.ts -t "single valid case"
  ```

  Confirm the failure is the missing omitted-case command behavior.

- [ ] **Step 4:** Add failing tests for zero valid cases and multiple valid cases. Assert non-zero exit, no complaint record, and clear guidance.
- [ ] **Step 5:** Add failing tests proving stray directories and invalid `root.yaml` files are not counted as valid cases.
- [ ] **Step 6:** Add a failing end-to-end regression test that:
  - runs `casegraph cases new case-one`,
  - adds a complaint with `casegraph cases add document complaint <first-pdf>`,
  - runs `casegraph cases new case-two`,
  - attempts `casegraph cases add document complaint <second-pdf>`,
  - asserts the second omitted-case add is rejected, says multiple cases exist, says `<case-id>` is required, and does not create `workspace/case-two/complaint.yaml`.

- [ ] **Step 7:** Add a failing test that `casegraph cases add document complaint <path-to-pdf> extra` is a hard error.

## Task 2: Implement Explicit Omitted-Case Command Shape

- [ ] **Step 1:** In `src/cli.ts`, add parser handling for exactly four tokens after `cases add document`: `complaint <path-to-pdf>`.
- [ ] **Step 2:** Add a small `findValidCases(cwd)` helper that reads `workspace/`, filters directories, and validates `root.yaml` contains `type: node`, `kind: case`, and `id: root`.
- [ ] **Step 3:** Add a resolver for the omitted-case form:
  - zero valid cases -> non-zero error with `casegraph cases new <case-id>` guidance,
  - one valid case -> return that case ID,
  - multiple valid cases -> non-zero error listing case IDs and requiring explicit `<case-id>`.

- [ ] **Step 4:** Route the resolved case ID into the existing complaint document path so existing duplicate, PDF, YAML, and next-step output behavior stays shared.
- [ ] **Step 5:** Ensure no default/current/use files are written. Add explicit assertions in tests for likely file names already used in existing tests.
- [ ] **Step 6:** Run focused tests:

  ```bash
  npm test -- --run test/cli.test.ts -t "casegraph cases add document"
  ```

## Task 3: Validate

- [ ] **Step 1:** Run:

  ```bash
  npm run openspec:validate
  ```

- [ ] **Step 2:** Run:

  ```bash
  npm run validate
  ```

- [ ] **Step 3:** Mark completed tasks in `openspec/changes/omit-case-id-for-single-case/tasks.md` only after the corresponding tests and implementation pass.

- [ ] **Step 4:** Commit the implementation with:

  ```bash
  git add src/cli.ts test/cli.test.ts openspec/changes/omit-case-id-for-single-case
  git commit -m "feat(cli): omit case id for single case"
  ```
