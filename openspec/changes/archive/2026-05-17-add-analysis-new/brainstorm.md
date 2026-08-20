## Design Summary

CaseGraph needs its first analysis-run workflow, but the first version should stay strict: create reviewable analysis working material from existing case records without changing the accepted graph. The command should let the user run `casegraph cases analysis new <case-id>` after importing a CourtListener case and registering evidence, then inspect a deterministic YAML artifact under the case workspace.

The analysis artifact is not AI output yet. It is a structured staging record that identifies candidate complaint or pleading inputs from imported docket/document metadata, candidate evidence inputs from registered evidence records, and empty review sections for later complaint expansion and body-worn-camera review. It must make clear that no transcript, event extraction, legal conclusion, fact support, or graph mutation has occurred.

The future body-worn-camera workflow should treat AI as an investigation aid. Its outputs should remain reviewable artifacts until accepted by a separate future command. The useful future artifact categories are timestamped transcript, neutral event timeline, and issue map. Issue labels should frame review candidates such as `observed_event`, `claimed_reason`, `possible_legal_issue`, `contradiction_candidate`, and `needs_human_review`; they should not assert legal conclusions.

## Alternatives Considered

### Approach A: Metadata-Only Analysis Artifact

- **Approach**: Add `casegraph cases analysis new <case-id>` to create a deterministic YAML analysis record from existing graph metadata only. It lists candidate source records and placeholder review sections but performs no content inspection or AI work.
- **Pros**:
  - Smallest behavior that creates the analysis workflow surface.
  - Preserves auditability by separating proposed analysis from accepted graph state.
  - Avoids pretending that files were reviewed when only metadata exists.
  - Fits current case workspace, evidence, report, history, and omitted-case conventions.
- **Cons**:
  - Does not yet produce transcripts, events, facts, or issue findings.
  - The first artifact is mostly scaffolding, so immediate legal insight is limited.
- **Why adopted**: This matches the current implementation maturity and keeps the next step reversible and testable.

### Approach B: Local Content Inspection During Analysis Creation

- **Approach**: Have `analysis new` inspect PDFs/videos/transcripts when creating the artifact and populate complaint expansion or BWC review sections.
- **Pros**:
  - More immediately useful if source files are readable and supported.
  - Could start producing timeline and transcript work products sooner.
- **Cons**:
  - Introduces file parsing, media handling, and error cases before the analysis artifact contract is stable.
  - Risks silent overclaiming if parsing is partial or ambiguous.
  - Requires dependency and provider decisions that are not needed for the first analysis-run workflow.
- **Why not adopted**: It violates the current smallest-useful-step constraint and expands scope beyond metadata-only analysis creation.

### Approach C: Direct Graph Mutation From Analysis

- **Approach**: Have analysis creation add facts, claims, support links, or graph edges directly.
- **Pros**:
  - Could make reports show supported facts sooner.
  - Reduces one manual workflow step.
- **Cons**:
  - Blurs proposed analysis with accepted graph state.
  - Conflicts with the audit model and ADR guidance that analysis edges need explicit legal meaning.
  - Makes erroneous extraction harder to unwind.
- **Why not adopted**: Acceptance, merge, or apply behavior belongs in a separate future change after reviewable artifacts exist.

## Agreed Approach

Adopt Approach A. `casegraph cases analysis new <case-id>` creates one review-only analysis YAML artifact under `workspace/<case-id>/analysis/<analysis-id>.yaml`, records provenance in `.history/`, and prints the artifact path and analysis ID. The artifact records metadata about the case records considered and includes deterministic placeholder sections for complaint expansion, evidence review, transcript requests, event timeline, issue map, unsupported facts, and suggested next steps.

The command follows current CLI conventions: real Commander subcommand, strict positional argument validation, existing case workspace required, omitted case ID allowed only when exactly one valid case exists, and no persistent default case.

## Key Decisions

- Analysis artifacts are working material, not accepted graph records.
- `analysis new` does not mutate existing graph YAML records.
- `analysis new` does not create graph edges or mark evidence as supporting facts.
- The first implementation is deterministic and based only on repo-local YAML metadata.
- Evidence records are candidate inputs only; registering or listing evidence does not prove anything.
- Complaint or pleading candidates are inferred only from existing imported metadata when determinable.
- AI provider integration, transcription, parsing, classification, legal research, and analysis application are explicitly out of scope.
- New persisted analysis shapes should use Zod models so future analysis artifacts have clear structure.

## Open Questions

- The exact generated analysis ID format should follow the existing local ID helper or convention available in the codebase during implementation.
- The initial artifact may include empty arrays for review sections to preserve shape, but implementation should avoid null placeholders.
- A future change still needs to define `analysis apply`, `analysis merge`, or `analysis accept` before any analysis can update accepted graph state.
