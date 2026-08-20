## Context

CaseGraph can create case workspaces, import CourtListener docket records, report current case state, and register external evidence records. The next useful workflow is to create reviewable analysis working material from those existing records without changing the accepted graph.

The command must fit the current CLI shape under `casegraph cases`, preserve strict argument validation, and use the existing omitted-case rule only when exactly one valid case exists. The case workspace remains the storage boundary. Graph records stay in repo-local YAML files, and provenance for case-affecting commands stays under `.history/`.

ADR 0004 reserves graph edges for explicitly defined legal-analysis relationships. This change does not define those relationships. It creates only a review artifact that can later be accepted, merged, or applied by a separate change.

## Goals / Non-Goals

**Goals:**

- Add `casegraph cases analysis new <case-id>`.
- Allow `casegraph cases analysis new` only when exactly one valid case exists.
- Create one review-only analysis YAML artifact under `workspace/<case-id>/analysis/<analysis-id>.yaml`.
- Record the source graph record IDs considered by the analysis setup.
- Include deterministic sections for complaint expansion, evidence review, transcript requests, event timeline, issue map, unsupported facts, and suggested next steps.
- Preserve command provenance in `.history/`.
- Make command output clear that the accepted graph was not changed.
- Define a Zod model for the persisted analysis artifact shape.

**Non-Goals:**

- Do not call an AI provider.
- Do not transcribe audio or video.
- Do not inspect, parse, summarize, or classify file contents.
- Do not extract accepted facts or claims.
- Do not create or mutate graph records or edges.
- Do not mark evidence as supporting facts.
- Do not add `analysis apply`, `analysis merge`, or `analysis accept`.
- Do not add support-matrix reporting, authority matching, legal research, aliases, or a workflow engine.

## Decisions

### Store analysis outside graph node files

Analysis artifacts live under `workspace/<case-id>/analysis/` rather than as accepted graph nodes. This keeps proposed working material separate from accepted case state and makes it clear that generated content still requires review.

### Make the first artifact metadata-only

`analysis new` reads repo-local YAML records and lists candidate inputs. Registered evidence becomes candidate evidence for review. CourtListener document or docket metadata may become candidate complaint or pleading inputs only when determinable from existing record fields. The command does not open external evidence paths and does not infer facts.

### Use a structured artifact shape

The persisted analysis record should have a Zod model with explicit fields:

- `id`
- `case_id`
- `type`
- `kind`
- `status`
- `created_at`
- `updated_at`
- `source_record_ids`
- `complaint_expansion`
- `evidence_review`
- `transcript_requests`
- `event_timeline`
- `issue_map`
- `unsupported_facts`
- `suggested_next_steps`

The implementation should omit null placeholders. Empty arrays are acceptable when they communicate that a section exists but has no entries yet.

### Record command provenance

Creating an analysis artifact is a case-workspace mutation, so the command should create a `.history/` mutation manifest recording the command, timestamp, case ID, analysis ID, output path, and source record IDs considered.

### Keep future AI semantics explicit but inactive

The artifact reserves vocabulary for future BWC review labels: `observed_event`, `claimed_reason`, `possible_legal_issue`, `contradiction_candidate`, and `needs_human_review`. This change only records the shape and intent; it must not claim any AI review occurred.

## Risks / Trade-offs

- **[Risk] The first artifact may feel sparse.** → Mitigation: command output and artifact sections should explain that this is review scaffolding and point to the next manual inspection step.
- **[Risk] Candidate complaint detection may be incomplete from docket metadata.** → Mitigation: report only candidates determinable from existing YAML records and avoid claiming completeness.
- **[Risk] Analysis shape may become too broad.** → Mitigation: keep the first schema limited to the sections required by complaint expansion and BWC review setup.
- **[Risk] Users may treat analysis output as accepted graph state.** → Mitigation: store it outside graph node files, use `status: draft`, and print that no accepted graph records changed.

## Migration Plan

This is an additive CLI capability. No existing graph records or case workspaces need migration.

Rollback is deleting the new command implementation, tests, and OpenSpec change. Existing workspaces remain valid because this change does not alter accepted graph record shape.

## Open Questions

- The analysis ID should use the existing local opaque ID convention available in the codebase.
- A future change must define how a user accepts, applies, merges, or rejects analysis artifacts.
