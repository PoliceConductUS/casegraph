## Context

CaseGraph currently has an analysis command, but the useful next behavior is not
generic analysis scaffolding. The first workflow should produce a proposed
incident from the complaint, with the main case graph unchanged until later
apply behavior exists.

ADR 0004 keeps graph edges and legally meaningful graph mutations explicit and
source-backed. ADR 0005 establishes `analysis/current/root.yaml` as the
current-analysis entry point and workflow-owned roots under
`analysis/current/<workflow-name>/root.yaml`.

This change uses those decisions for one hard-coded workflow:
`incident-from-complaint`.

## Goals / Non-Goals

**Goals:**

- Start a current analysis from `casegraph cases analysis new`.
- Resume the current analysis from `casegraph cases analysis resume` after
  `analysis/current/root.yaml` exists.
- Run `incident-from-complaint` only when no current analysis exists, main has
  no incident, complaint metadata exists, and a local or downloadable complaint
  PDF source exists.
- Create `analysis/current/root.yaml`.
- Create `analysis/current/incident-from-complaint/root.yaml`.
- Create `analysis/current/incident-from-complaint/change-set.yaml`.
- Create `analysis/current/incident-from-complaint/report.md`.
- Create `analysis/current/incident-from-complaint/workflow-run.yaml`.
- Create `analysis/current/incident-from-complaint/artifacts/extraction.yaml`.
- Produce source-grounded proposed graph changes for the first incident.
- Run the workflow with LangGraph and hard-code the OpenAI Responses API as the
  AI executor for this slice.
- Keep main unchanged.
- Print the combined workflow reports in execution order as default output,
  while keeping audit/internal details out of stdout.

**Non-Goals:**

- Do not implement apply, abandon, export, import, status, or review commands.
- Do not extract claims, defenses, qualified immunity, Monell theories, response
  units, legal standards, motion arguments, settlement value, or litigation
  strategy.
- Do not extract authorities; authority extraction should be a later workflow
  after incident/fact/source context exists.
- Do not approve proposed changes automatically.
- Do not apply proposed changes to main.
- Do not add a generic workflow engine, plugin system, dynamic workflow
  registry, cloud checkpoint store, or AI provider abstraction.
- Do not create authority graphs, the top-level `authorities/` collection,
  authority edges, or citation-audit behavior.

## Decisions

### Use a working graph model

The workflow treats the visible analysis graph as:

```text
main + incident-from-complaint change set
```

Main is the durable case graph. The workflow writes proposed changes into the
current analysis workspace. Main changes only when approved changes are applied
by future apply behavior.

### Require an available complaint PDF source

Complaint metadata alone is not enough for source-grounded incident extraction.
The command must require metadata that identifies the complaint and either a
readable local PDF path or a downloadable source URL. If the local PDF is
missing but a downloadable source exists, `analysis new` downloads the PDF into:

```text
analysis/current/incident-from-complaint/artifacts/complaint.pdf
```

The command does not copy the downloaded PDF into main case graph file storage.
Instead, it records proposed changes for preserving the artifact with the case
files and updating the complaint document path later.

If source metadata already contains plain text, the command writes it into:

```text
analysis/current/incident-from-complaint/artifacts/<text-node-id>.yaml
```

If a markdown/plain text version of the PDF still does not exist, the workflow
should add creating that text artifact to the proposed change set. If attaching
that text to a graph node becomes desirable, the workflow should propose that as
a change; it must not mutate main during `analysis new`.

The download/materialization behavior should live in reusable case document
helpers so the same source-file action can move under import behavior later
without copying workflow-specific code.

### Use LangGraph with hard-coded OpenAI Responses execution

The command remains `casegraph cases analysis new`. Analysis commands may run
workflow definitions stored under:

```text
src/cases/analysis/workflows/
```

This change implements one hard-coded analysis workflow. Its runnable contract
and runner belong under:

```text
src/cases/analysis/workflows/incident-from-complaint/
```

That workflow folder defines the workflow-owned file contracts, review states,
source support kinds, extraction contract, LangGraph runner, and serializers
used when `analysis new` runs `incident-from-complaint`. The OpenAI Responses
API is hard-coded as the AI executor for this change. Later workflows should
get sibling folders under `src/cases/analysis/workflows/` when their OpenSpec
changes define them. A registry, configuration layer, provider abstraction, or
generic workflow runner is not needed before one useful loop exists.

Workflow prompts live under each workflow definition folder in `prompts/` so
they can be tuned with the workflow contract.

The `incident-from-complaint` workflow owns complaint source location and
download/materialization. Once a readable PDF exists, it invokes a reusable
PDF-to-markdown task when markdown does not already exist, then runs incident
extraction. Reusable PDF conversion task code and prompt templates live under:

```text
src/cases/analysis/tasks/pdf-to-markdown/
```

For this change, that reusable task is invoked by `incident-from-complaint`
and writes artifacts into
`analysis/current/incident-from-complaint/artifacts/`; it is not a separate
entry in the current analysis change stack and does not locate or download
complaint sources.

The task uses a three-step extraction ladder:

1. Probe native text from the first two PDF pages, then extract the full PDF
   natively when the probe is usable.
2. Render PDF pages and run local Tesseract OCR when native text is unavailable,
   header-only, or garbled.
3. Run configured OpenAI vision extraction over rendered page images when OCR
   does not produce usable text.

Every extraction attempt is recorded with status and reason in the task
artifacts. Escalation is visible; it is not a silent fallback.

Each reusable task run is recorded under the owning workflow:

```text
analysis/current/incident-from-complaint/tasks/pdf-to-markdown/<task-run-id>/root.yaml
```

Task run IDs are opaque `cuid2` values. The task name is stored separately from
the ID and in the folder path.

The AI-facing extraction contract should use neutral domain names. For example,
the extracted incident object is `incident`, not `proposed_incident`; CaseGraph
owns review/change-set semantics after the extraction crosses back into the
analysis workspace.

### Write a change set, not main case graph records

`change-set.yaml` is the reviewable representation of proposed graph mutations.
Initial review state is `proposed`. The command does not approve, discard,
conflict, or apply changes except where a deterministic validation failure needs
to prevent creation.

The incident narrative belongs inside the proposed incident record as an
ordered embedded `events` array. Array order defines the sequence. The workflow
must not create separate incident-event, timeline-event, statement, action, or
movement nodes for that narrative in this slice. Event actors carry
event-specific roles such as observer, overheard, speaker, target, arrestee, or
arresting-actor. Graph edges remain reserved for legal-relevance connections,
not ordinary narrative ordering or actor participation.

### Keep output action-oriented

Stdout should answer:

- what was created
- what was proposed
- whether main changed
- what the user should review next
- the combined workflow reports in execution order

Stdout should not print workflow internals, checkpoint identifiers, verbose
artifact lists, empty counts, internal IDs, or audit details.

For this early slice, stderr should be intentionally verbose so a user can see
that long-running work is still active. It should show command/workflow steps,
the current workflow name, artifact writes, the OpenAI model, the prompt sent to
OpenAI, and the raw OpenAI output content. This is
deliberately noisy and can be made quieter in a later change after the workflow
is easier to trust.

### Create the current root before workflow materialization

`analysis/current/root.yaml` is the durable current-analysis entry point. The
`new` command must write that file before complaint text materialization and AI
workflow execution. Once the root exists, a later `new` must refuse to start a
second current analysis and direct the user to `resume`.

Preconditions that prove no workflow can start, such as no case workspace, an
existing main incident, missing complaint metadata, or no local/downloadable PDF
source, still fail before creating the root. Failures after the root is written,
such as unusable PDF text extraction, leave the root in place so `resume` can
continue the same analysis after the missing source/text problem is fixed.

## Risks / Trade-offs

- **[Risk] PDF text extraction expands scope.** -> Require only the PDF for this
  workflow. Write markdown/plain text only when source metadata already provides
  text; otherwise represent missing markdown/plain text as a proposed change.
  Add a dependency only if tests require immediate text extraction and the latest
  stable version is checked.
- **[Risk] Scanned complaint PDFs may expose only ECF headers through the PDF
  text layer.** -> Reject header-only text extraction instead of feeding bad
  markdown to AI. OCR can be added in a later change.
- **[Risk] The workflow may over-extract legal strategy.** -> Keep tests focused
  on incident-only output and explicitly reject claims/defenses/theories.
- **[Risk] Proposed changes may look accepted.** -> Use review states and output
  that says main is unchanged.
- **[Risk] Source references may be vague.** -> Require every proposed change to
  include source support and distinguish quote, paraphrase, summary, inference,
  and missing-source observation. Every source material identified by the
  workflow must become either a pinpointed source-reference change or a proposed
  data-request node with enough agency/request context for review.

## Migration Plan

Update the `case-analysis` spec and tests first, then replace the analysis-new
implementation. Existing generated analysis artifacts are not migrated.

Rollback is reverting this change's OpenSpec artifacts, tests, and implementation
edits.

## Resolved Questions

- Existing complaint document records may identify a local PDF with `path`.
  Source metadata may identify a downloadable PDF with `sources[].download_url`.
- `analysis new` may create `artifacts/<text-node-id>.yaml` only from existing source
  text metadata. PDF text extraction remains a proposed change when text is not
  already available.
