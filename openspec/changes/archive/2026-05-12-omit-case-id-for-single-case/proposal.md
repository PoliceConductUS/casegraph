## Why

CaseGraph currently requires `<case-id>` for every existing-case command, even when there is only one case. That is safe but repetitive during the current single-case workflow. The next smallest convenience is to allow omission only when exactly one valid case exists, without adding default/current-case state.

## What Changes

**Complaint document command**

- From: The user must run `casegraph cases add document <case-id> complaint <path-to-pdf>`.
- To: The user may also run `casegraph cases add document complaint <path-to-pdf>` when exactly one valid case exists.
- Reason: In a one-case repository, the case ID is unambiguous.
- Impact: Non-breaking addition to the CLI. The explicit shape remains supported.

**Single-case resolution**

- From: CaseGraph has no omitted-case behavior.
- To: Omitted-case behavior is resolved only for explicitly specified command shapes and only when exactly one valid case exists.
- Reason: This avoids a hidden default/current case while improving the single-case workflow.
- Impact: Mutating commands remain fail-fast when there are zero or multiple valid cases.

## Non-goals

- This change does not add `casegraph cases default`, `casegraph cases current`, or `casegraph cases use`.
- This change does not create a default-case pointer, current-case file, manifest, or durable case selection state.
- This change does not make `<case-id>` optional globally.
- This change does not treat arbitrary `workspace/` directories as valid cases.
- This change does not alter complaint document storage, PDF validation, duplicate complaint rejection, or graph expansion behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `case-documents`: Adds an omitted-case command shape for complaint document recording when exactly one valid case exists.
- `case-workspaces`: Defines valid case discovery for omitted-case resolution.

## Impact

- CLI parser: add the exact omitted-case `cases add document complaint <path-to-pdf>` shape.
- Case resolution: enumerate valid cases from `workspace/<case-id>/root.yaml`.
- Tests: cover one valid case, zero valid cases, multiple valid cases, invalid workspace folders, and preservation of hard errors for extra tokens.
- Dependencies: no new dependency is expected.
