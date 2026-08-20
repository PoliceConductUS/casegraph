## 1. Tests

- [x] 1.1 Update `casegraph cases analysis new` tests for successful `incident-from-complaint` creation.
- [x] 1.2 Add precondition tests for existing current analysis, existing main incident, missing complaint metadata, and unavailable complaint PDF.
- [x] 1.3 Add tests for `analysis/current/root.yaml` recording analysis ID, case ID, main source basis, workflow order, workflow path, and timestamps.
- [x] 1.4 Add tests for `analysis/current/incident-from-complaint/root.yaml` recording workflow name, status, complaint source, artifact references, and history.
- [x] 1.5 Add tests for `change-set.yaml` containing proposed incident-scoped graph mutations with allowed review states.
- [x] 1.6 Add tests for `report.md` answering the incident question without claims, defenses, legal standards, or litigation strategy.
- [x] 1.7 Add tests for source discipline: every proposed change has a source reference and data-request observations do not count as proof.
- [x] 1.8 Add regression tests proving main case graph records are unchanged by `analysis new`.
- [x] 1.9 Update help and output tests so default output is action-oriented and does not mention unimplemented commands.
- [x] 1.10 Add tests for downloading a missing complaint PDF into workflow artifacts and proposing durable graph/file updates.
- [x] 1.11 Add tests for the required question-driven incident report sections and source-grounding language.
- [x] 1.12 Add tests for workflow-run and extraction artifacts.
- [x] 1.13 Add tests that default output includes the combined workflow reports rather than "read this file" instructions.
- [x] 1.14 Add tests that unavailable source materials produce proposed data-request changes instead of loose missing-source notes.
- [x] 1.15 Add tests that incident narrative events are embedded on the proposed incident instead of emitted as separate graph-node changes.
- [x] 1.16 Add tests that `analysis new` reports verbose running progress to stderr while keeping stdout as the final report.
- [x] 1.17 Add tests that header-only PDF text extraction is rejected instead of sent to AI.
- [x] 1.18 Add tests that a partial `analysis/current/` directory is not overwritten.

## 2. Current Analysis Model

- [x] 2.1 Replace the generated analysis artifact model with a current analysis root model for `analysis/current/root.yaml`.
- [x] 2.2 Add a workflow root model for `analysis/current/incident-from-complaint/root.yaml`.
- [x] 2.3 Add a change-set model with review states `proposed`, `approved`, `discarded`, `conflicted`, and `applied`.
- [x] 2.4 Add serialization for current root, workflow root, and change set without null values.

## 3. Complaint Source Handling

- [x] 3.1 Detect complaint metadata from existing main case graph records.
- [x] 3.2 Detect whether the complaint metadata identifies an available complaint PDF.
- [x] 3.3 If a markdown/plain text version of the complaint PDF does not exist, add creating that artifact to the proposed change set.
- [x] 3.4 If the complaint PDF is unavailable, fail before creating partial workflow output.
- [x] 3.5 Represent any future graph-node text attachment only as a proposed change, not a main graph mutation.
- [x] 3.6 Download a missing local complaint PDF into the workflow run when source metadata provides a downloadable PDF URL.
- [x] 3.7 Create workflow-local complaint markdown from existing source text metadata when available.
- [x] 3.8 Propose graph/file updates for downloaded complaint artifacts without mutating main.

## 4. Incident-From-Complaint Workflow

- [x] 4.1 Detect that main has no incident before starting the workflow.
- [x] 4.2 Build the initial working graph as `main + incident-from-complaint change set`.
- [x] 4.3 Produce proposed changes for incident-scoped concepts only.
- [x] 4.4 Produce source references for every proposed change.
- [x] 4.5 Produce data-request changes when the complaint references or implies unavailable materials.
- [x] 4.6 Produce a concise `report.md` for human review.
- [x] 4.7 Structure `report.md` around the required report questions.
- [x] 4.8 Include minimum proposed incident review fields in the add-incident change.
- [x] 4.9 Run `incident-from-complaint` through LangGraph with hard-coded OpenAI Responses AI extraction.
- [x] 4.10 Write `workflow-run.yaml` for each workflow run.
- [x] 4.11 Write validated AI extraction to `artifacts/extraction.yaml`.
- [x] 4.12 Generate proposed changes from the validated extraction.
- [x] 4.13 Use `report.md` as the workflow report file name.
- [x] 4.14 Represent every extracted source material as either an `add-source-reference` change or an `add-data-request` change.
- [x] 4.15 Embed ordered incident events under the proposed incident and stop proposing separate timeline/action event nodes.
- [x] 4.16 Keep analysis review terms such as `proposed` out of the AI response contract.

## 5. Command Behavior

- [x] 5.1 Change `casegraph cases analysis new` to create only the current analysis and `incident-from-complaint` workflow outputs.
- [x] 5.2 Refuse to run when a current analysis already exists.
- [x] 5.3 Refuse to run when main already has an incident.
- [x] 5.4 Refuse to run when no complaint source exists.
- [x] 5.5 Refuse to run when the complaint PDF is unavailable.
- [x] 5.6 Keep default output short, action-oriented, and free of audit/internal details.
- [x] 5.7 Remove `.history` mutation manifest writing from `analysis new`.
- [x] 5.8 Emit verbose progress for command steps, workflow execution, AI prompts, and artifact writes.
- [x] 5.9 Reject unusable extracted PDF text before running AI extraction.
- [x] 5.10 Refuse to start when any current analysis directory already exists.
- [x] 5.11 Change `analysis new` to use `analysis/current/root.yaml` as the current-analysis lock and create that root before workflow materialization.
- [x] 5.12 Add `casegraph cases analysis resume` to continue the current analysis from `analysis/current/root.yaml`.
- [x] 5.13 Add reusable `pdf-to-markdown` behavior and invoke it inside `incident-from-complaint` when complaint markdown is needed.
- [x] 5.14 Store workflow prompt templates under each workflow definition folder.

## 6. Validation

- [x] 6.1 Run `npm run format`.
- [x] 6.2 Run `npm run lint`.
- [x] 6.3 Run `npm test`.
- [x] 6.4 Run `npm run typecheck`.
- [x] 6.5 Run `npm run build`.
- [x] 6.6 Run `npm run openspec:validate`.
- [x] 6.7 Run `npm run validate`.
