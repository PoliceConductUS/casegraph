# ADR 0005: Analysis Worktree Directory

## Status

Accepted.

## Context

CaseGraph analysis work is moving earlier than originally expected. The first
analysis workflow should still stay small, local, inspectable, and tied to one
case workspace, but it will need more than one durable file.

A legal analysis workflow can naturally produce more than one reviewable file,
including:

- incident reports
- proposed change sets
- source references
- citation audit notes
- generated text artifacts proposed from source PDFs
- plain-language summaries

Putting all of that under one `analysis/current.yaml` file would make the file
too large, blur authoritative state with generated artifacts, and make future
review or application behavior harder to keep auditable.

The user needs one obvious entry point for the current analysis run, and each
workflow inside that run also needs one obvious entry point. The current
analysis and each workflow should be directories because they can produce
multiple durable files.

## Decision

CaseGraph will use:

```text
analysis/current/root.yaml
analysis/current/<workflow-name>/root.yaml
```

instead of:

```text
analysis/current.yaml
```

`analysis/current/root.yaml` is the authoritative entry point for the current
analysis run. It records run-level state such as analysis ID, case ID, status,
workflow order, workflow timing, and references to workflow directories.

For example, an incident-discovery workflow based on complaint metadata may use:

```text
analysis/current/incident-from-complaint/root.yaml
```

Each workflow owns its directory under `analysis/current/`, and that workflow
directory owns its `root.yaml` and any supporting files it needs.

The workflow-owned `root.yaml` is the only authoritative entry point for that
current analysis workflow. Other workflow files are discovered through
references from that `root.yaml`, not by ad hoc directory scanning.

The current-analysis `root.yaml` should include these top-level concepts as they
become needed:

```yaml
analysis_id:
case_id:
status:
created_at:
updated_at:
workflows:
history:
```

Example:

```yaml
analysis_id: analysis_2026_05_17_001
case_id: example-v-example-city
status: draft
created_at: "2026-05-17T14:30:00-05:00"
updated_at: "2026-05-17T14:35:00-05:00"
workflows:
  - name: incident-from-complaint
    path: incident-from-complaint/root.yaml
    status: draft
    started_at: "2026-05-17T14:30:00-05:00"
    completed_at: "2026-05-17T14:35:00-05:00"
history:
  - event: analysis_created
    at: "2026-05-17T14:30:00-05:00"
```

The workflow-owned `root.yaml` tracks authoritative analysis state and
references supporting files. It should include these top-level concepts as they
become needed:

```yaml
analysis_id:
case_id:
status:
workflow:
based_on:
selection_reason:
candidates:
review:
application:
artifacts:
history:
```

Candidate artifacts should not be crammed into `root.yaml` once they grow.
The workflow-owned `root.yaml` should reference supporting files:

```yaml
analysis_id: analysis_2026_05_17_001
case_id: example-v-example-city
status: draft
workflow:
  engine: langgraph
  name: incident-from-complaint
  version: 1
artifacts:
  change_set: change-set.yaml
  incident_report: incident-report.md
review:
  approved_candidate_ids: []
  rejected_candidate_ids: []
application:
  applied: false
history:
  - event: analysis_created
    at: "2026-05-17T14:30:00-05:00"
```

For now, AI integration may be hard-coded to the first concrete analysis need.
CaseGraph does not need a generic workflow engine, plugin system, configurable
AI provider layer, or dynamic workflow registry before the first useful loop
works. A selected LangGraph workflow may be named directly by the command code
and recorded in `root.yaml`.

Analysis commands remain command-specific, such as `casegraph cases analysis
new`. Workflow definitions that analysis tasks can run should live as sibling
folders under `src/cases/analysis/workflows/<workflow-name>/`. For the first
workflow, the contract path is
`src/cases/analysis/workflows/incident-from-complaint/contract.ts`.

The only directory convention reserved now is that candidate outputs may live
under an `artifacts/` directory inside the workflow directory when the workflow
needs generated files. The rest of the workflow-owned directory structure is
left to the workflow's future OpenSpec requirements.

`casegraph cases analysis new` creates `analysis/current/`, writes
`analysis/current/root.yaml`, creates the selected workflow directory under
`analysis/current/`, writes that workflow's `root.yaml`, runs the selected
LangGraph workflow when the current OpenSpec change requires it, writes
generated supporting files under the workflow directory, and updates both root
files' status and history.

## Non-Decisions

This ADR does not define:

- the full LangGraph workflow implementation
- a generic workflow engine
- a dynamic workflow registry
- a provider abstraction for AI models
- the exact schema for every candidate artifact
- the complete schema for `analysis/current/root.yaml`
- the complete schema for workflow-owned root files
- the complete internal directory layout under each workflow directory
- the internal directory layout under `analysis/archive/<analysis-id>/`
- whether multiple current workflow directories may exist at the same time
- the review UI or command for approving individual candidates
- automatic application of AI output to the main case graph
- a supersede command
- remote sync, backup, encryption, or publishing behavior

Those decisions require concrete OpenSpec changes.

## Consequences

The current analysis run has a stable, inspectable entry point, and each
workflow has its own stable, inspectable entry point, without forcing all
analysis state into one file.

Future commands can move or archive the entire current analysis directory as one
unit, while preserving workflow-level roots for audit.

Generated candidate artifacts can arrive earlier without introducing a
speculative workflow platform.

The cost is that `analysis new` becomes more than a root-file creation command
once the current OpenSpec change requires the hard-coded workflow to run. That
behavior must be made explicit in OpenSpec before implementation.

Because `analysis/current/root.yaml` is the authoritative entry point for the
current analysis run, future code should start there. Because the workflow-owned
`root.yaml` is the authoritative entry point for a workflow, future code must
not treat unreferenced files in a workflow directory as authoritative workflow
state.
