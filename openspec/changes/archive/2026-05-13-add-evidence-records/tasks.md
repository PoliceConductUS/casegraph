## 1. Evidence Command Tests

- [x] 1.1 Add failing tests for explicit `casegraph cases add evidence <case-id> <path-to-file>` success with a non-PDF regular file.
- [x] 1.2 Add failing tests for omitted-case success when exactly one valid case exists.
- [x] 1.3 Add failing tests for zero-case and multiple-case omitted forms.
- [x] 1.4 Add failing tests for missing path, unreadable or missing file, directory path, missing case workspace, and extra positional tokens.
- [x] 1.5 Add failing tests for evidence help output under `casegraph cases --help` and `casegraph cases add --help`.

## 2. Evidence Implementation

- [x] 2.1 Add `cases add evidence` as a real Commander subcommand while preserving existing `cases add document` behavior as a real subcommand.
- [x] 2.2 Reuse shared case workspace resolution for omitted case IDs and explicit workspace validation.
- [x] 2.3 Implement readable regular-file validation without PDF or file-type checks.
- [x] 2.4 Generate the evidence node ID from the file content SHA-256 hex digest.
- [x] 2.5 Write one `kind: evidence` YAML node whose file name stem matches `id` and whose hash metadata records the SHA-256 digest.
- [x] 2.6 Print the created node path, node ID, and next report command.
- [x] 2.7 Reject duplicate evidence content when the SHA-256 evidence node already exists.
- [x] 2.8 Preserve successful evidence add commands in `.history/` and link the evidence node to that mutation.

## 3. Graph Schema And Report Traversal

- [x] 3.1 Add Zod graph record schemas for current `type: node` / `kind` combinations.
- [x] 3.2 Define schema-owned node-reference properties for current graph node kinds.
- [x] 3.3 Traverse graph records from `root` through recognized node-reference properties.
- [x] 3.4 Update `casegraph cases report` to print `Unlinked records: <count>`.
- [x] 3.5 Cover evidence records counting as unlinked until referenced.

## 4. Validation

- [x] 4.1 Run focused evidence command tests.
- [x] 4.2 Run `npm run validate`.
- [x] 4.3 Fix any failures with the smallest scoped change and rerun validation.
