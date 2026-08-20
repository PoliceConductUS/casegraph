## Why

Case workspaces need a first evidence-like document record so the user can anchor analysis to the complaint without introducing a full document management system. The immediate need is only to record where the complaint PDF lives for an existing case workspace.

## What Changes

**Complaint Document Recording**

- From: CaseGraph can create separated case workspaces, but it has no command for recording a document in a case workspace.
- To: CaseGraph provides `casegraph cases add document <case-id> complaint <path-to-pdf>` to create `workspace/<case-id>/complaint.yaml`.
- Reason: The complaint is the first concrete case document the user needs to reference during case analysis.
- Impact: Non-breaking addition to the CLI and workspace file set.

The complaint record is a graph node with `type: node`, `kind: document`, `id: complaint`, and `document_type: complaint`. The command records the external PDF path only after confirming the source exists, is readable, and is a PDF.

The command rejects unsupported document types, missing arguments, extra positional tokens, missing case workspaces, and attempts to add a second complaint. Successful command output guides the user from case creation to complaint recording, then from complaint recording to a future no-argument augmentation report.

## Non-goals

- This change does not parse PDF text or metadata.
- This change does not extract facts, parties, court, jurisdiction, filing dates, claims, laws, decisions, citations, or references.
- This change does not summarize the complaint.
- This change does not identify strengths, weaknesses, missing documents, related cases, or hypotheses.
- This change does not expand the case graph beyond the single complaint document node.
- This change does not create edges or inferred analysis records.

## Capabilities

### New Capabilities

- `case-documents`: Defines how the CLI records document nodes inside case workspaces, starting with complaint documents.

### Modified Capabilities

- `case-workspaces`: Adds post-success guidance from `cases new` to the complaint document command.

## Impact

- CLI parser: add the `cases add document` command shape.
- Workspace writes: create `workspace/<case-id>/complaint.yaml` only when the case workspace exists and no complaint record exists.
- Tests: add CLI acceptance coverage for success, rejected argument shapes, unsupported document types, missing workspaces, and duplicate complaint records.
- Dependencies: no new dependency is expected.
