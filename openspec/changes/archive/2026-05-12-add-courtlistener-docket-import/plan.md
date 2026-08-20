# CourtListener Docket Import Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task-by-task.

**Goal:** Add a narrow CourtListener REST import command that bootstraps a new
case workspace, preserves raw request history, and records source-backed graph
properties without creating legal-analysis edges.

**Architecture:** Keep the CLI direct. Add small import-focused functions for
argument parsing, token handling, CourtListener requests, mutation history
writing, case ID derivation, and graph record serialization. Avoid source
connector abstractions.

**Tech Stack:** Node.js, TypeScript, Vitest, YAML file output, CourtListener
REST, `@paralleldrive/cuid2`.

---

## Task 1: Dependencies And CLI Shape

- [ ] **Step 1:** Add failing CLI tests in `test/cli.test.ts` for missing docket ID, extra positional tokens, `--dry-run --write`, missing token, dry-run default, and help output.
- [ ] **Step 2:** Run the focused tests and confirm they fail for missing import command behavior.
- [ ] **Step 3:** Install `@paralleldrive/cuid2@3.3.0`.
- [ ] **Step 4:** Update `src/cli.ts` to parse `cases import courtlistener <docket-id> [--dry-run | --write]`.
- [ ] **Step 5:** Add command help text for root/cases/import prefixes if needed by tests.
- [ ] **Step 6:** Implement argument validation and token presence checks without printing token values.
- [ ] **Step 7:** Run focused CLI tests and commit this task when green.

## Task 2: CourtListener REST Client

- [ ] **Step 1:** Add tests for a request helper using a fake fetch implementation or injected fetch function.
- [ ] **Step 2:** Implement the minimal CourtListener request helper in `src/cli.ts` or a focused import module if file size demands it.
- [ ] **Step 3:** Ensure request records include method, URL, redacted headers, response status, response headers, and full JSON response body.
- [ ] **Step 4:** Add paginated fetch tests for `next` traversal.
- [ ] **Step 5:** Implement fetches for docket detail, docket entries, parties, attorneys, and RECAP documents.
- [ ] **Step 6:** Add visible handling for non-200 responses and rate-limit responses.
- [ ] **Step 7:** Run focused tests and commit this task when green.

## Task 3: Mutation History

- [ ] **Step 1:** Add tests for CUID2 mutation ID generation shape and history file creation.
- [ ] **Step 2:** Implement mutation ID generation with `m_` prefix and compact CUID2 body.
- [ ] **Step 3:** Implement `.history/index.yaml` creation and ordered mutation append.
- [ ] **Step 4:** Implement `.history/<mutation-id>/manifest.yaml` with full argv, request file mappings, timestamps, and status.
- [ ] **Step 5:** Implement one request YAML file per request ID in the mutation folder.
- [ ] **Step 6:** Add tests that no persisted history file contains the token value.
- [ ] **Step 7:** Run focused tests and commit this task when green.

## Task 4: Workspace And Graph Records

- [ ] **Step 1:** Add tests for deriving a safe case ID from CourtListener slug/name.
- [ ] **Step 2:** Add tests for unsafe derived IDs and existing workspace rejection without auto-suffixing.
- [ ] **Step 3:** Implement case ID derivation using existing case ID validation rules where practical.
- [ ] **Step 4:** Add tests for `--write` creating workspace and `root.yaml` with `sources[]`.
- [ ] **Step 5:** Implement root case creation for CourtListener import without default/current case state.
- [ ] **Step 6:** Add tests for imported docket, party, attorney, docket-entry, and RECAP document graph record properties.
- [ ] **Step 7:** Implement imported graph record serialization with `sources[]` arrays.
- [ ] **Step 8:** Run focused tests and commit this task when green.

## Task 5: Filing-Level Citations

- [ ] **Step 1:** Add tests proving docket records do not contain docket-level citation relationships.
- [ ] **Step 2:** Add tests proving RECAP document `cites` arrays are preserved as filing/document properties.
- [ ] **Step 3:** Add tests for successful citation lookup preservation when plain text is available.
- [ ] **Step 4:** Add tests for rate-limit or unavailable citation lookup reporting without claiming full success.
- [ ] **Step 5:** Implement citation property preservation and optional citation lookup under the chosen boundary.
- [ ] **Step 6:** Add tests proving no edge files or edge records are created.
- [ ] **Step 7:** Run focused tests and commit this task when green.

## Task 6: Verification

- [ ] **Step 1:** Run `npm run validate`.
- [ ] **Step 2:** If validation fails, fix defects with regression tests before proceeding.
- [ ] **Step 3:** Record validation results and any known limitations in `verify.md`.
- [ ] **Step 4:** Review OpenSpec artifacts for obsolete history paths and ensure history path is `workspace/<case-id>/.history/`.
- [ ] **Step 5:** Commit the final verification update.
