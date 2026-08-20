## 1. Report Command Tests

- [x] 1.1 Add failing CLI tests for `casegraph cases report <case-id>` on a CourtListener-imported workspace.
- [x] 1.2 Add failing CLI tests for omitted-case report behavior with exactly one valid case, zero valid cases, and multiple valid cases.
- [x] 1.3 Add failing CLI tests for missing case workspace, extra positional tokens, and report help output.
- [x] 1.4 Add a failing test that report execution does not create, modify, or delete case workspace files.
- [x] 1.5 Replace count-oriented report expectations with failing tests for chronological legal docket output.
- [x] 1.6 Add a failing test that docket entry rows are capped at 80 characters with visible text truncation.
- [x] 1.7 Add a failing test that missing next-step categories appear after the legal docket.

## 2. Report Implementation

- [x] 2.1 Add `cases report` parsing and help text in the existing CLI command structure.
- [x] 2.2 Reuse or extract the valid-case resolver so report omission follows the existing exactly-one-case rule.
- [x] 2.3 Implement a small workspace record reader for the YAML fields needed by this report.
- [x] 2.4 Implement deterministic counts for case root, docket, docket entries, documents, parties, attorneys, and visible CourtListener provenance.
- [x] 2.5 Implement missing-category output for evidence records, accepted facts, accepted claims, and support analysis.
- [x] 2.6 Implement visible citation lookup state reporting without claiming completeness beyond current records.
- [x] 2.7 Replace count-oriented report formatting with chronological docket entry formatting.
- [x] 2.8 Include related imported document references under visible docket entries.
- [x] 2.9 Truncate the docket action text column so docket entry rows do not exceed 80 characters.
- [x] 2.10 Restore the missing next-step categories summary after the legal docket.

## 3. Validation

- [x] 3.1 Run focused report command tests.
- [x] 3.2 Run `npm run validate`.
- [x] 3.3 Fix any failures with the smallest scoped change and rerun validation.
