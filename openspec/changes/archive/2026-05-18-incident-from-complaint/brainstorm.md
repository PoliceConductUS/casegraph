## Design Summary

CaseGraph should replace the setup-only analysis proposal with one small first
analysis workflow: `incident-from-complaint`.

The workflow runs from `casegraph cases analysis new` only when no current
analysis exists, the main case graph has no incident, and complaint metadata
plus a local or downloadable complaint PDF source are present. Its narrow job is to
answer one question:

```text
What incident does the complaint appear to describe?
```

The workflow creates a current analysis workspace and workflow folder, then
produces an incident report, source-grounded proposed graph changes, source
references, and citation/source audit material. The main case graph remains
unchanged.

## Alternatives Considered

### Approach A: Setup-only current analysis root

- **Approach**: Create only `analysis/current/root.yaml` with metadata-derived
  context and wait for later commands to do useful extraction.
- **Pros**:
  - Very small implementation.
  - Low risk of overclaiming from complaint content.
- **Cons**:
  - Leaves the user with scaffolding rather than a reviewable analysis outcome.
  - Does not answer the first useful question about the case.
- **Why not adopted**: It is smaller, but not useful enough. The first workflow
  should produce a reviewable proposed incident change set.

### Approach B: First real workflow: `incident-from-complaint`

- **Approach**: Have `analysis new` run one hard-coded workflow when the main
  graph has no incident and complaint metadata plus a local or downloadable complaint PDF
  exist. The workflow produces an incident report and proposed change set without
  changing main.
- **Pros**:
  - Gives the user a concrete reviewable output immediately.
  - Preserves the main/working graph boundary.
  - Keeps scope narrow to incident discovery from the complaint.
  - Establishes source discipline early.
- **Cons**:
  - Bigger than a setup-only change.
  - Must handle the case where no markdown/plain text version of the PDF exists.
- **Why adopted**: It creates the first useful analysis loop without becoming
  full case analysis.

### Approach C: Full complaint analysis

- **Approach**: Extract claims, defendants, defenses, theories, issues,
  litigation posture, and incident information from the complaint in one pass.
- **Pros**:
  - More complete complaint understanding.
- **Cons**:
  - Too broad for the first workflow.
  - Risks mixing factual incident extraction with legal strategy.
  - Creates too many candidate graph concepts before the incident foundation is
    reviewed.
- **Why not adopted**: The first workflow should answer only what incident the
  complaint appears to describe.

## Agreed Approach

Adopt Approach B.

`casegraph cases analysis new` starts a new current analysis only when:

- no current analysis exists
- the main case graph has no incident
- complaint metadata exists
- a local or downloadable complaint PDF source exists

The workflow creates:

```text
analysis/current/root.yaml
analysis/current/incident-from-complaint/root.yaml
analysis/current/incident-from-complaint/change-set.yaml
analysis/current/incident-from-complaint/report.md
```

It may create additional workflow-owned supporting files when required by the
implementation, but those files are not authoritative unless referenced by a
root or change-set file.

If a markdown/plain text version of the complaint PDF does not exist, the
workflow adds creating that text artifact to the proposed change set. If
extracted complaint text should later be attached to a graph node, that also
must be represented as a proposed change in the working graph/change set.
`analysis new` must not attach it to the main case graph directly.

## Key Decisions

- Use kebab-case for workflow folder and file names.
- Model the working graph as `main + incident-from-complaint change set`.
- Keep one current analysis at a time.
- Treat workflow output as proposed changes until later apply behavior exists.
- Require every proposed change to trace to a source reference.
- Label direct quotes, paraphrases, summaries, inferences, and missing-source
  observations distinctly.
- Do not print audit details, workflow internals, or verbose file trees in
  default command output.
- Do not mention commands that are not implemented.

## Open Questions

- The implementation must confirm whether the first workflow creates the
  markdown/plain text artifact immediately or only proposes that change for
  review.
- The exact schema for change-set entries should be finalized in tests before
  implementation.
