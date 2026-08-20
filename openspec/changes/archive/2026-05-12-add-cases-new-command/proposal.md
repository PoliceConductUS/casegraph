## Why

The user has more than one active case and needs immediate separation between case graphs and analysis. The first useful CaseGraph behavior is creating a repo-local workspace for a named case without implying any broader graph, database, or drafting system exists yet.

## What Changes

- Add a CLI command contract for `casegraph cases new <case-id>`.
- Create a case workspace under `./workspace/<case-id>`.
- Require case workspaces to remain separated by case ID.
- Require helpful command help at the root, `cases`, and `cases new` levels.
- Prevent overwriting an existing case workspace.
- Keep workspace contents allowed to be checked into the repository.
- Exclude default-case selection, graph editing, database setup, and source connectors from this change.

## Capabilities

### New Capabilities

- `case-workspaces`: Creating and separating repo-local case workspaces by case ID.

### Modified Capabilities

None.

## Impact

- A future implementation will add the initial CLI package structure and executable entrypoint.
- A future implementation will add filesystem behavior for creating `workspace/<case-id>`.
- A future implementation will add tests for command help, workspace creation, duplicate prevention, and case separation.
- No existing runtime behavior changes because the project has no implemented CLI yet.
