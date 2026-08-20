## Why

The setup-only analysis root would create structure but not help the user
understand the imported case. The first useful analysis should produce a
source-grounded proposed incident from the complaint while leaving the main case
graph unchanged. This creates a reviewable first loop without expanding into
claims, defenses, strategy, or full case analysis.

## What Changes

**First Analysis Workflow**

- From: `casegraph cases analysis new` creates a generic review artifact or
  setup root.
- To: `casegraph cases analysis new` starts the hard-coded
  `incident-from-complaint` workflow when no current analysis exists, main has no
  incident, and complaint metadata identifies a local or downloadable complaint
  PDF source.
- Reason: The first analysis should answer what incident the complaint appears
  to describe.
- Impact: Larger but more useful first analysis slice.

**Current Analysis Workspace**

- From: Analysis setup centers on one root file.
- To: The command creates `analysis/current/root.yaml` plus
  `analysis/current/incident-from-complaint/` with workflow-owned artifacts.
- Reason: The current analysis needs run-level state, and the workflow needs its
  own reviewable unit of report, change set, source references, and audit
  material.
- Impact: Establishes a branch/worktree-style working graph without changing
  main.

**Complaint Source Preconditions**

- From: Complaint metadata alone may be enough to identify a candidate.
- To: The workflow requires complaint metadata and a local or downloadable
  complaint PDF. If only a download source exists, the command downloads the PDF
  into `analysis/current/incident-from-complaint/artifacts/complaint.pdf`, not
  main. If source metadata contains plain text, the command writes
  `analysis/current/incident-from-complaint/artifacts/<text-node-id>.yaml`; otherwise,
  it adds creating that text artifact to the proposed change set.
- Reason: Proposed graph changes must be source-grounded.
- Impact: The first workflow can start from the PDF while making text extraction
  reviewable instead of silently mutating main.

**Change Set Discipline**

- From: Analysis output lists candidate inputs.
- To: The workflow writes a user-reviewable `change-set.yaml` containing
  proposed graph mutations with review states.
- Reason: Main changes only when approved changes are applied by future apply
  behavior.
- Impact: `analysis new` produces proposed changes but does not approve or apply
  them.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `case-analysis`: Replace setup-only analysis creation with the
  `incident-from-complaint` workflow for `casegraph cases analysis new`.

## Impact

- Affected command: `casegraph cases analysis new`.
- Affected files likely include `src/cases/analysis/new/*`,
  `src/cases/analysis/workflows/incident-from-complaint/*`,
  `src/cases/documents/*`, `src/cases/graph/records.ts`, and
  `test/cli.test.ts`.
- Affected OpenSpec capability: `openspec/specs/case-analysis/spec.md`.
- Potential dependency impact: PDF text extraction may require a dependency if
  implementation creates a markdown/plain text artifact during this workflow; if
  so, implementation must check the latest stable version before adding it.
- No apply, abandon, export, import, status, review, infrastructure, cloud, or
  generic workflow engine behavior is added.
- No authority graph, top-level `authorities/` collection, authority edge, or
  citation-audit behavior is added.
