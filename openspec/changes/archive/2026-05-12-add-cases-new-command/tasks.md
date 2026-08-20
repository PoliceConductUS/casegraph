## 1. CLI Baseline

- [x] 1.1 Add the minimal package structure for a local Node.js CLI.
- [x] 1.2 Add test tooling for command execution and filesystem assertions.
- [x] 1.3 Add an executable `casegraph` entrypoint wired through `package.json`.

## 2. Help Text

- [x] 2.1 Implement `casegraph --help` with the `cases` command group listed.
- [x] 2.2 Implement `casegraph cases --help` with the `new <case-id>` command listed.
- [x] 2.3 Implement `casegraph cases new --help` with workspace location, case separation, case ID format, and checked-in workspace language.

## 3. Workspace Creation

- [x] 3.1 Implement `casegraph cases new <case-id>` to create `./workspace/<case-id>`.
- [x] 3.2 Print the created workspace path after successful creation.
- [x] 3.3 Allow multiple case workspaces to exist side by side.
- [x] 3.4 Avoid creating a default-case pointer, current-case file, or global case selection.
- [x] 3.5 Create `root.yaml` as the root case node.
- [x] 3.6 Print the created root node path after successful creation.
- [x] 3.7 Do not create `case.yaml`.

## 4. Safety Behavior

- [x] 4.1 Reject duplicate workspace creation with a non-zero exit status.
- [x] 4.2 Preserve existing workspace contents when duplicate creation is rejected.
- [x] 4.3 Keep the command independent from database credentials, network access, source connectors, and drafting configuration.
- [x] 4.4 Reject unsafe case IDs without creating a workspace.
- [x] 4.5 Suggest a cleaned case ID when the invalid input contains usable characters.
- [x] 4.6 Avoid suggesting a case ID when the invalid input has no usable characters.
- [x] 4.7 Accept portable court-style IDs with uppercase letters.
- [x] 4.8 Reject Windows reserved device names.
- [x] 4.9 Reject case-insensitive duplicate workspace names.
- [x] 4.10 Reject missing, whitespace-only, leading/trailing whitespace, and accidental extra-argument case IDs.

## 5. Verification

- [x] 5.1 Add tests for root help, cases help, and new-command help.
- [x] 5.2 Add tests for successful workspace creation and reported path.
- [x] 5.3 Add tests for multiple workspace separation.
- [x] 5.4 Add tests for duplicate workspace rejection and unchanged contents.
- [x] 5.5 Add tests for invalid case ID rejection and suggestion behavior.
- [x] 5.6 Add tests for `root.yaml` creation, contents, and filename/id invariant.
- [x] 5.7 Add tests for portable uppercase case IDs, reserved names, and case-insensitive duplicates.
- [x] 5.8 Add tests for missing, whitespace-only, leading/trailing whitespace, and accidental extra-argument case IDs.
- [x] 5.9 Run the full test suite and `npm run openspec:validate`.
