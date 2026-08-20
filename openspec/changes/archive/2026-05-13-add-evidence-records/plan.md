# Add Evidence Records Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** Add metadata-only evidence registration through `casegraph cases add evidence`.

**Architecture:** Keep the new behavior under the existing `cases add` group, with `document` and `evidence` modeled as real nested Commander subcommands. Add a focused evidence command module that resolves the case workspace, validates a readable regular file, hashes file content for a deterministic SHA-256 node ID, writes one evidence YAML node, records the successful mutation in `.history/`, and returns clear next-step output without mutating existing records. Add a small Zod-backed graph record schema layer so `casegraph cases report` can traverse recognized node-reference properties and count unlinked records.

**Tech Stack:** Node.js, TypeScript, Vitest, Zod, filesystem YAML records, existing CUID2 dependency, existing `./casegraph` wrapper.

---

## Task 1: Evidence Command Tests

- [x] **Step 1:** In `test/cli.test.ts`, add a helper that writes a regular non-PDF evidence file.
- [x] **Step 2:** Add a failing test for `casegraph cases add evidence <case-id> <path-to-file>` that asserts one evidence YAML file is created with `type: node`, `kind: evidence`, a SHA-256 content hash ID, hash metadata, source provenance, the provided path, timestamps, and no null values.
- [x] **Step 3:** Assert the success output includes the created node path, node ID, and `casegraph cases report <case-id>`.
- [x] **Step 4:** Add a failing test that a non-PDF regular file is accepted and not copied into the workspace.
- [x] **Step 5:** Add failing tests for omitted-case success, zero-case failure, and multiple-case failure.
- [x] **Step 6:** Add failing tests for missing path, missing file, directory path, missing case workspace, and extra positional tokens.
- [x] **Step 7:** Add failing tests for `casegraph cases --help` and `casegraph cases add --help` listing the evidence command.
- [x] **Step 8:** Run the focused tests and confirm they fail for missing evidence command behavior.

## Task 2: CLI Routing

- [x] **Step 1:** Update `src/cli.ts` help text to include `add evidence <case-id> <path-to-file>`.
- [x] **Step 2:** Add `cases add evidence` as a real nested Commander subcommand.
- [x] **Step 3:** Preserve `cases add document` as a real nested Commander subcommand.
- [x] **Step 4:** Reject invalid evidence command shapes before validating file paths.
- [x] **Step 5:** Run help and invalid-shape tests.

## Task 3: Evidence Node Creation

- [x] **Step 1:** Add a focused module such as `src/cases/add/evidence/command.ts`.
- [x] **Step 2:** Reuse shared case workspace helpers for omitted-case resolution and workspace path display if they exist on the implementation branch.
- [x] **Step 3:** Validate explicit case workspaces using `workspace/<case-id>/root.yaml` as a valid case root.
- [x] **Step 4:** Validate the evidence path with `stat` and read access only; reject missing, unreadable, and directory paths.
- [x] **Step 5:** Generate the evidence ID from the file content SHA-256 hex digest.
- [x] **Step 6:** Write `workspace/<case-id>/<sha256hex>.yaml` with `type`, `kind`, `id`, `path`, `hash`, `created_at`, and `updated_at`.
- [x] **Step 7:** Use exclusive file creation so duplicate evidence content does not overwrite an existing graph node.
- [x] **Step 8:** Format success output with created path, ID, and report guidance.
- [x] **Step 9:** Run focused evidence command tests.
- [x] **Step 10:** Record successful evidence add mutations in `.history/`.

## Task 4: Graph Schema And Report Traversal

- [x] **Step 1:** Add Zod graph node schemas for current `type: node` / `kind` combinations.
- [x] **Step 2:** Define schema-owned reference fields for docket, party, docket entry, and document nodes.
- [x] **Step 3:** Traverse graph records from `root`, including the CourtListener docket node matched by root docket provenance.
- [x] **Step 4:** Update `casegraph cases report` to print `Unlinked records: <count>`.
- [x] **Step 5:** Test that an imported case has no unlinked records and that a newly registered evidence node reports as one unlinked record.

## Task 5: Full Verification

- [x] **Step 1:** Run `npm run format`.
- [x] **Step 2:** Run `npm run lint`.
- [x] **Step 3:** Run `npm test`.
- [x] **Step 4:** Run `npm run typecheck`.
- [x] **Step 5:** Run `npm run build`.
- [x] **Step 6:** Run `npm run openspec:validate`.
- [x] **Step 7:** Run `npm run validate`.
- [x] **Step 8:** Record any validation failures and fix them before reporting completion.
