# Report Imported Case State Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Add a read-only `casegraph cases report` command that prints the imported court docket as a chronological legal docket.

**Architecture:** Keep reporting under the existing `cases` command group. Add a focused report module that resolves a case workspace, reads only local YAML graph records, extracts docket entry and related document fields, and formats a plain text legal docket without mutating files.

**Tech Stack:** Node.js, TypeScript, Vitest, filesystem YAML records, existing `./casegraph` wrapper.

---

## Task 1: Report Command Tests

- [x] **Step 1:** In `test/cli.test.ts`, add a fixture helper that creates a valid imported-style case workspace with `root.yaml` plus sample `docket`, `docket_entry`, `document`, `party`, and `attorney` YAML records.
- [x] **Step 2:** Add a failing test for `casegraph cases report <case-id>` that asserts zero exit status and chronological legal docket output.
- [x] **Step 3:** Add a failing test that the same report output includes related imported document references under visible docket entries.
- [x] **Step 4:** Add failing tests for omitted-case behavior: exactly one valid case reports successfully, zero cases fails with create-case guidance, and multiple cases fails with available case IDs.
- [x] **Step 5:** Add failing tests for a missing explicit case, an extra positional token, and `casegraph cases report --help`.
- [x] **Step 6:** Add a failing test that snapshots the case workspace file list and file contents before and after report execution to prove the report is read-only.
- [x] **Step 7:** Run the focused tests and confirm they fail for missing report command behavior.

## Task 2: CLI Routing And Help

- [x] **Step 1:** In `src/cli.ts`, add `report <case-id>` to cases help text.
- [x] **Step 2:** Add report-specific help text, either in a new report command module or near the route if the implementation stays small.
- [x] **Step 3:** Extend command dispatch to recognize `cases report`.
- [x] **Step 4:** Reject extra report arguments with the required command shape.
- [x] **Step 5:** Wire `casegraph cases report --help` to return report help with a zero exit status.
- [x] **Step 6:** Run the report help and invalid-shape tests.

## Task 3: Case Resolution

- [x] **Step 1:** Reuse the existing valid-case detection behavior from complaint document recording or extract a shared helper if direct reuse would duplicate logic.
- [x] **Step 2:** Implement explicit case workspace validation for `casegraph cases report <case-id>`.
- [x] **Step 3:** Implement omitted-case resolution for `casegraph cases report`.
- [x] **Step 4:** Ensure omitted-case resolution does not create any durable default/current case state.
- [x] **Step 5:** Run the explicit and omitted case resolution tests.

## Task 4: Report Reader And Formatter

- [x] **Step 1:** Add a focused report module such as `src/cases/report/command.ts`.
- [x] **Step 2:** Implement a small YAML record reader that reads only top-level fields needed for the report: `type`, `kind`, `id`, `date_filed`, `entry_number`, `description`, `recap_documents`, `docket_entry`, `document_number`, and `document_type`.
- [x] **Step 3:** Extract docket entry records and sort them by filed date, then entry number.
- [x] **Step 4:** Attach visible related imported document references under each docket entry.
- [x] **Step 5:** Report when no docket entries are present without inferring facts, claims, evidence support, authority support, or legal conclusions.
- [x] **Step 6:** Format the report deterministically with stable section order and stable wording for tests.
- [x] **Step 7:** Run the imported docket report tests.

## Task 5: Full Verification

- [x] **Step 1:** Run `npm run format`.
- [x] **Step 2:** Run `npm run lint`.
- [x] **Step 3:** Run `npm test`.
- [x] **Step 4:** Run `npm run typecheck`.
- [x] **Step 5:** Run `npm run build`.
- [x] **Step 6:** Run `npm run openspec:validate`.
- [x] **Step 7:** Run `npm run validate`.
- [x] **Step 8:** Record any validation failures and fix them before reporting completion.
