## Why

CaseGraph can import a case, report what is present, and register evidence, but it does not yet create a reviewable analysis workspace from those records. This change adds the first analysis-run command so complaint expansion and BWC review can start as auditable working material without mutating accepted graph state.

## What Changes

**Analysis creation command**

- From: There is no command for starting a case analysis run.
- To: `casegraph cases analysis new <case-id>` creates one review-only analysis artifact under `workspace/<case-id>/analysis/`.
- Reason: The user needs a concrete artifact to inspect after import/report/evidence registration and before any accepted graph changes.
- Impact: Non-breaking additive CLI behavior.

**Omitted case handling**

- From: Omitted case ID behavior exists only for commands that explicitly define it.
- To: `casegraph cases analysis new` resolves the case only when exactly one valid case exists.
- Reason: This keeps the new command consistent with existing report and evidence workflows.
- Impact: No persistent default/current case is created.

**Analysis artifact semantics**

- From: Evidence records and imported docket records exist, but there is no review staging artifact for complaint expansion or BWC analysis.
- To: The new artifact lists source graph records considered, candidate pleading/document inputs when determinable, candidate evidence records, and empty review sections for transcript requests, event timeline, issue map, unsupported facts, and suggested next steps.
- Reason: Analysis must remain auditable and reviewable before it can affect accepted graph state.
- Impact: The command creates analysis and history files only; it does not modify graph records.

## Capabilities

### New Capabilities

- `case-analysis`: Creates review-only case analysis artifacts from existing case workspace metadata.

### Modified Capabilities

None.

## Impact

- Adds a `cases analysis new` Commander subcommand.
- Adds a persisted analysis artifact model and tests.
- Adds `.history/` provenance for analysis creation.
- Reads existing case workspace YAML records, including evidence and imported document metadata.
- Does not add runtime dependencies unless implementation proves one is necessary.
