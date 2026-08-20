## MODIFIED Requirements

### Requirement: Create Review Analysis Artifact

The system SHALL provide `casegraph cases analysis new <case-id>` to create a current analysis workspace and run the `incident-from-complaint` workflow when the main case graph has no incident and a local or downloadable complaint PDF source is identified.

#### Scenario: Incident-from-complaint workflow is created

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** no current analysis exists at `./workspace/example-v-example-city/analysis/current/`
- **AND** the main case graph does not contain an incident node
- **AND** the main case graph contains complaint metadata
- **AND** the complaint metadata identifies a readable local complaint PDF or a downloadable complaint PDF source
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a zero status
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/root.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/root.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/change-set.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/report.md`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/workflow-run.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/artifacts/extraction.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/artifacts/<text-node-id>.yaml`
- **THEN** the command output states that analysis was created
- **THEN** the command output reports the incident label
- **THEN** the command output states that the main case graph was unchanged
- **THEN** the command output includes the combined workflow reports in execution order
- **THEN** the command output tells the user to review or edit `analysis/current/incident-from-complaint/change-set.yaml`
- **THEN** the command output does not mention commands that are not implemented

#### Scenario: Current analysis root already exists

- **WHEN** `./workspace/example-v-example-city/analysis/current/root.yaml` already exists
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no new analysis workflow is created
- **THEN** the output says `Analysis not created.`
- **THEN** the output explains that a current analysis already exists
- **THEN** the output tells the user to run `casegraph cases analysis resume example-v-example-city`
- **THEN** the output does not include audit details, workflow internals, checkpoint identifiers, or verbose artifact lists

#### Scenario: Incident already exists in main

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the main case graph contains a graph node with `kind: incident`
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis workflow is created
- **THEN** the output says `Analysis not created.`
- **THEN** the output explains that main already has an incident
- **THEN** the output says no next analysis workflow is defined yet
- **THEN** the main case graph remains unchanged

#### Scenario: No complaint source exists

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the main case graph has no incident node
- **AND** no complaint metadata exists in the main case graph
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis workflow is created
- **THEN** the output says `Analysis not created.`
- **THEN** the output explains that no complaint source was found
- **THEN** the output tells the user to add or identify a complaint source and rerun `casegraph cases analysis new`

#### Scenario: Complaint PDF is unavailable

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the main case graph has no incident node
- **AND** complaint metadata exists in the main case graph
- **AND** the complaint PDF is missing or unreadable
- **AND** the complaint metadata does not identify a downloadable complaint PDF source
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no proposed incident change set is created
- **THEN** the output says `Analysis not created.`
- **THEN** the output explains that the complaint PDF is unavailable
- **THEN** the main case graph remains unchanged

### Requirement: Extract Incident From Complaint Source

The system SHALL use existing main case graph metadata to identify the complaint source, materialize complaint text into the workflow run, run the hard-coded OpenAI Responses-backed LangGraph `incident-from-complaint` workflow, and produce extracted incident artifacts without extracting unrelated legal analysis.

`analysis new` and `analysis resume` SHALL NOT mutate the main case graph. They may only write analysis worktree artifacts and proposed changes. Main case graph mutation is reserved for a future `analysis apply` command.

#### Scenario: Current analysis root records change stack

- **WHEN** the user runs `casegraph cases analysis new example-v-example-city`
- **AND** the command creates a current analysis
- **THEN** `analysis/current/root.yaml` records the analysis ID
- **THEN** `analysis/current/root.yaml` records `case_id: example-v-example-city`
- **THEN** `analysis/current/root.yaml` records a `main_graph` snapshot with a whole-graph hash
- **THEN** `analysis/current/root.yaml` records a `main_graph` snapshot with each main graph record ID and hash
- **THEN** `analysis/current/root.yaml` records the ordered change stack as `main` followed by `incident-from-complaint`
- **THEN** `analysis/current/root.yaml` records a `runs` list
- **THEN** each command invocation run has an opaque ID
- **THEN** each command invocation run records the command operation
- **THEN** each command invocation run records a path to `analysis/current/<run-id>.yaml`
- **THEN** each command invocation run records status and timestamps
- **THEN** `analysis/current/root.yaml` records the workflow path `incident-from-complaint/root.yaml`
- **THEN** `analysis/current/root.yaml` records created and updated timestamps
- **THEN** `analysis/current/root.yaml` does not contain null values

#### Scenario: Command invocation run result is recorded

- **WHEN** `casegraph cases analysis new example-v-example-city` or `casegraph cases analysis resume example-v-example-city` reaches a current analysis workflow run
- **THEN** the command creates `analysis/current/<run-id>.yaml`
- **THEN** the run result records the run ID
- **THEN** the run result records the case ID
- **THEN** the run result records the operation
- **THEN** the run result records workflow `incident-from-complaint`
- **THEN** the run result records status and timestamps
- **THEN** a completed run result records the report path
- **THEN** a failed run result records the failure reason

#### Scenario: Workflow root records workflow state

- **WHEN** the command creates `analysis/current/incident-from-complaint/root.yaml`
- **THEN** the workflow root records the workflow name `incident-from-complaint`
- **THEN** the workflow root records the workflow status
- **THEN** the workflow root records the complaint source used
- **THEN** the workflow root references `change-set.yaml`
- **THEN** the workflow root references `report.md`
- **THEN** the workflow root references `workflow-run.yaml`
- **THEN** the workflow root references `artifacts/extraction.yaml`
- **THEN** the workflow root records an ordered task list
- **THEN** each task run path uses `tasks/<task-name>/<task-run-id>/root.yaml`
- **THEN** the workflow root records history entries for workflow creation and completion or pause
- **THEN** the workflow root does not contain null values

#### Scenario: Workflow run artifact records the execution

- **WHEN** the command creates `analysis/current/incident-from-complaint/workflow-run.yaml`
- **THEN** the workflow run artifact records the analysis ID
- **THEN** the workflow run artifact records the case ID
- **THEN** the workflow run artifact records workflow `incident-from-complaint`
- **THEN** the workflow run artifact records workflow version `1`
- **THEN** the workflow run artifact records executor engine `langgraph`
- **THEN** the workflow run artifact records AI executor `openai-responses`
- **THEN** the workflow run artifact records status and timestamps
- **THEN** the workflow run artifact records the complaint text input artifact
- **THEN** the workflow run artifact records the extraction, change set, and report output artifacts

#### Scenario: Resume reuses a completed workflow run

- **GIVEN** `analysis/current/incident-from-complaint/` already contains the completed workflow output artifacts
- **WHEN** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command does not call the AI extractor again
- **THEN** the command does not rewrite the completed workflow output artifacts
- **THEN** the command prints the existing workflow report
- **THEN** stderr says the existing completed workflow run was used

#### Scenario: Resume rejects incomplete workflow output artifacts

- **GIVEN** `analysis/current/incident-from-complaint/` contains one or more workflow output artifacts but not all required completed output artifacts
- **WHEN** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command fails
- **THEN** the command lists the missing workflow output artifacts
- **THEN** the command does not rewrite existing workflow output artifacts

#### Scenario: AI extraction artifact is created

- **WHEN** the workflow runs
- **THEN** the workflow calls the OpenAI Responses API through a LangGraph workflow node
- **THEN** the command writes verbose progress to stderr for the workflow start, LangGraph execution, OpenAI model name, OpenAI prompt, OpenAI output, validation, artifact writes, and completion
- **THEN** the AI extraction contract uses `incident` for the incident object and does not expose analysis review terms such as `proposed` in the AI response shape
- **THEN** the workflow validates the OpenAI output against the TypeScript extraction contract
- **THEN** the workflow rejects extracted factual answers that lack source locations unless the answer is explicitly unknown or not found in the complaint
- **THEN** the workflow writes the exact prompt sent to OpenAI to `analysis/current/incident-from-complaint/tasks/extract-incident/<task-run-id>/artifacts/prompt.md`
- **THEN** the workflow writes the raw OpenAI Responses API body to `analysis/current/incident-from-complaint/tasks/extract-incident/<task-run-id>/artifacts/prompt-response.json`
- **THEN** before calling OpenAI, the workflow checks `.cache/case-analysis/extract-incident/<task-run-id>/<prompt-hash>.json` for an exact cached response
- **THEN** when an exact cached response exists, the workflow uses the cached response and does not call OpenAI
- **THEN** when no exact cached response exists, the workflow calls OpenAI and writes the raw response body to `.cache/case-analysis/extract-incident/<task-run-id>/<prompt-hash>.json`
- **THEN** the prompt hash includes the model, schema name, JSON schema, and exact prompt/input
- **THEN** the workflow writes `analysis/current/incident-from-complaint/tasks/extract-incident/<task-run-id>/root.yaml`
- **THEN** the workflow writes `analysis/current/incident-from-complaint/tasks/extract-incident/<task-run-id>/report.md`
- **THEN** the system writes the validated extraction to `analysis/current/incident-from-complaint/artifacts/extraction.yaml`
- **THEN** `change-set.yaml` is generated from the validated extraction
- **THEN** `report.md` is generated from the validated extraction and proposed changes

#### Scenario: Configured AI API key is unavailable

- **WHEN** the complaint PDF and complaint markdown are available
- **AND** `OPENAI_API_KEY` is not available to the command environment
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status before AI extraction
- **THEN** the command output explains that `OPENAI_API_KEY` is unavailable
- **THEN** the command output tells the user to set `OPENAI_API_KEY`
- **THEN** the command output tells the user to resume the analysis after `OPENAI_API_KEY` is available
- **THEN** the command does not write `analysis/current/incident-from-complaint/artifacts/extraction.yaml`
- **THEN** the main case graph remains unchanged

#### Scenario: Missing local PDF is materialized into the workflow run

- **WHEN** the complaint source has no readable local PDF path
- **AND** the complaint source metadata identifies a downloadable PDF source
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command downloads the PDF to `analysis/current/incident-from-complaint/artifacts/complaint.pdf`
- **THEN** the `incident-from-complaint` workflow root references `artifacts/complaint.pdf`
- **THEN** the change set includes a proposed change to preserve the downloaded PDF with the case files
- **THEN** the change set includes a proposed change to update the complaint document file path
- **THEN** the main case graph remains unchanged

#### Scenario: Existing source text is materialized into the workflow run

- **WHEN** the complaint source metadata includes plain text for the complaint
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command writes `analysis/current/incident-from-complaint/artifacts/<text-node-id>.yaml`
- **THEN** the `incident-from-complaint` workflow root references `artifacts/<text-node-id>.yaml`
- **THEN** the command does not attach that text to a main case graph node

#### Scenario: PDF-to-markdown workflow runs before incident extraction

- **WHEN** the user runs `casegraph cases analysis new example-v-example-city`
- **AND** the command creates a current analysis
- **THEN** the `incident-from-complaint` workflow locates the complaint source before extracting the incident
- **THEN** the `incident-from-complaint` workflow downloads a missing complaint PDF into its workflow artifacts when source metadata provides a download URL
- **THEN** the `incident-from-complaint` workflow invokes reusable `pdf-to-markdown` task behavior when complaint markdown does not exist
- **THEN** the reusable `pdf-to-markdown` task converts the resolved complaint PDF and does not locate or download the complaint source
- **THEN** the reusable `pdf-to-markdown` task first probes native text from the first two PDF pages before extracting the full document natively
- **THEN** when native extraction from the resolved PDF is not usable, the reusable `pdf-to-markdown` task prompts for an original complaint PDF before OCR when interactive input is available
- **THEN** when the user enters an original complaint PDF path that does not exist or is unreadable, the command reports that problem and prompts again
- **THEN** when the user enters a readable original complaint PDF path whose native text is still not usable, the command reports that problem and prompts again
- **THEN** the task continues to OCR only when the user submits a blank original complaint PDF path
- **THEN** when the user provides a readable original complaint PDF path, the task copies it to `analysis/current/incident-from-complaint/artifacts/original-complaint.pdf`
- **THEN** when native extraction from `artifacts/original-complaint.pdf` is usable, the task writes `analysis/current/incident-from-complaint/artifacts/<text-node-id>.yaml` from that original PDF without running OCR
- **THEN** when the original PDF is copied into the workflow artifacts, the change set includes a proposed change to attach the original PDF as an alternate source for the complaint document
- **THEN** the reusable `pdf-to-markdown` task renders PDF pages and runs local OCR when native text is unavailable, header-only, or garbled
- **THEN** the reusable `pdf-to-markdown` task runs configured vision extraction when OCR does not produce usable text
- **THEN** each extraction method attempt is recorded with status and reason
- **THEN** `artifacts/<text-node-id>.yaml` is a YAML node with `kind: markdown`, an opaque `id`, metadata, and a `text` property containing the extracted complaint text
- **THEN** the change set includes a proposed parent document update with `alternate_representations` keyed by the text artifact node ID
- **THEN** the `incident-from-complaint` workflow consumes the extracted complaint text from that `text` property
- **THEN** the task run has an opaque ID and is recorded under `analysis/current/incident-from-complaint/tasks/pdf-to-markdown/<task-run-id>/root.yaml`
- **THEN** task run IDs are assigned when the current analysis root is first created
- **THEN** `analysis resume` reuses the task run IDs recorded in `analysis/current/root.yaml`
- **THEN** the command stores complaint PDF and markdown artifacts under `analysis/current/incident-from-complaint/artifacts/`
- **THEN** `incident-from-complaint` consumes the markdown artifact produced by that reusable task
- **THEN** each workflow definition is stored under `src/cases/analysis/workflows/<workflow-name>/`
- **THEN** prompt templates for a workflow are stored under that workflow definition folder

#### Scenario: Header-only PDF text extraction is rejected

- **WHEN** the complaint PDF text layer contains only court headers, page markers, or other non-body text
- **AND** no usable complaint text metadata exists
- **AND** OCR and configured vision extraction do not produce usable text
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** `analysis/current/root.yaml` exists because the current analysis was started before workflow materialization failed
- **THEN** no AI extraction is run
- **THEN** the output explains that the complaint PDF text is unavailable after native text, OCR, and vision extraction attempts
- **THEN** the output tells the user to run `casegraph cases analysis resume example-v-example-city` after usable complaint text or extraction support exists

### Requirement: Resume Current Analysis

The system SHALL provide `casegraph cases analysis resume <case-id>` to continue the current analysis identified by `analysis/current/root.yaml`.

#### Scenario: Current analysis resumes from root

- **WHEN** `./workspace/example-v-example-city/analysis/current/root.yaml` exists
- **AND** the root records workflow `incident-from-complaint`
- **AND** the current main graph matches the root `main_graph` snapshot
- **AND** the main case graph has no incident node
- **AND** complaint metadata identifies a local or downloadable complaint PDF source
- **AND** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command exits with a zero status
- **THEN** the system creates any missing `incident-from-complaint` workflow artifacts required by this change
- **THEN** the command output states that analysis was resumed
- **THEN** the command output includes the combined workflow reports in execution order
- **THEN** the main case graph remains unchanged

#### Scenario: Resume refuses when main graph changed

- **WHEN** `./workspace/example-v-example-city/analysis/current/root.yaml` exists
- **AND** the current main graph does not match the root `main_graph` snapshot
- **AND** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** the output says `Analysis not resumed.`
- **THEN** the output explains that the main graph changed since the analysis started
- **THEN** the output lists the changed main graph record IDs
- **THEN** the output tells the user to review or abandon the current analysis before starting a new one
- **THEN** the command does not update `analysis/current/root.yaml`
- **THEN** the main case graph remains unchanged

#### Scenario: No current analysis root exists

- **WHEN** `./workspace/example-v-example-city/analysis/current/root.yaml` does not exist
- **AND** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** the output says `Analysis not resumed.`
- **THEN** the output explains that no current analysis exists
- **THEN** the output tells the user to run `casegraph cases analysis new example-v-example-city`

#### Scenario: Docket entry document relationship is proposed

- **WHEN** the complaint source is tied to a docket entry
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the change set includes a proposed change to record the docket entry `documents` relationship
- **THEN** the proposed relationship identifies the complaint document as the complaint
- **THEN** the main docket entry record remains unchanged

#### Scenario: Report answers the incident question

- **WHEN** the command creates `analysis/current/incident-from-complaint/report.md`
- **THEN** the report is titled `Incident From Complaint Report`
- **THEN** the default report uses terse headings, key-value bullets, lists, and trees instead of explanatory prose
- **THEN** the report includes sections for `Incident`, `Date and Time`, `Location`, `Actors`, `Sequence of Events`, `Statements`, `Source Materials`, `Change Review Tree`, `Proposed Changes`, `Uncertainties and Review Items`, and `Next Review Actions`
- **THEN** the report answers what incident the complaint appears to describe
- **THEN** the report identifies the incident label
- **THEN** the report gives the shortest plain-English description supported by available source locations
- **THEN** the report says whether the complaint appears to describe one incident, possibly multiple incidents, or an unknown number of incidents
- **THEN** the report identifies the complaint source locations supporting the incident conclusion
- **THEN** the report identifies the alleged date and time when available
- **THEN** the report labels time certainty as `exact`, `approximate`, `relative`, `inferred`, `unknown`, or `conflicting`
- **THEN** the report identifies alleged locations, location specificity, movement between locations, missing/vague locations, and source references when available
- **THEN** the report identifies apparent actors, roles, identity certainty, actor category, and source support when available
- **THEN** the report identifies directly alleged, inferred, and uncertain incident events from the ordered `events` array when available
- **THEN** the report renders the ordered event sequence as a table with columns for time, label, actors, description, and locations
- **THEN** the event table omits an event ID column unless event IDs are part of the extracted event contract
- **THEN** the ordered `events` array is the only default report section for incident actions, movements, custody, transport, search, force, and other incident event narrative
- **THEN** the report identifies important alleged statements, speakers, recipients, quote/paraphrase status, context, and source support when available
- **THEN** the report identifies available, referenced, likely missing, unknown, and verification-needed source materials when available
- **THEN** the report includes a scannable graph-delta tree
- **THEN** the change tree groups proposed mutations as new nodes, node property updates, artifact promotions, or future edges
- **THEN** the change tree lists target node, target property, action, value, source locator, and missing or incomplete review item when available
- **THEN** the default report does not include the base graph snapshot or base graph hash
- **THEN** the report summarizes the proposed changes and which changes need review
- **THEN** the report identifies unclear, inferred, conflicting, or review-needed facts
- **THEN** the report ends with concrete next review actions
- **THEN** unknown values are reported as unknown or not found rather than guessed
- **THEN** the report does not include workflow internals, checkpoint identifiers, audit logs, claims, defenses, Monell theories, legal standards, motion arguments, settlement value, or litigation strategy

#### Scenario: Proposed incident includes minimum review fields

- **WHEN** the workflow creates the `add-incident` proposed change
- **THEN** the proposed incident includes a label
- **THEN** the proposed incident includes a summary
- **THEN** the proposed incident includes a date value or `unknown`
- **THEN** the proposed incident includes a time value or `unknown`
- **THEN** the proposed incident includes a location value or `unknown`
- **THEN** the proposed incident includes actors or an empty list
- **THEN** the proposed incident includes an ordered `events` array
- **THEN** each incident event includes a type, time, location, actors, description, support, source locations, and optional statement or review note
- **THEN** each event actor includes an ID, role, and optional target ID
- **THEN** incident events do not include a sequence field because array order defines the sequence
- **THEN** the proposed incident includes sources
- **THEN** the proposed incident does not include authorities because authority extraction belongs to a later analysis workflow
- **THEN** the proposed incident includes a review note

#### Scenario: Missing markdown text is proposed

- **WHEN** the complaint source is an available local or downloaded PDF
- **AND** a markdown/plain text version of the complaint PDF does not exist
- **AND** the workflow creates `change-set.yaml`
- **THEN** the change set includes a proposed change to create a markdown/plain text version of the complaint PDF
- **THEN** the proposed change records an initial review state of `proposed`
- **THEN** the proposed change references the complaint PDF source
- **THEN** the workflow does not attach markdown/plain text to a main case graph node
- **THEN** any future graph-node text attachment is represented only as a proposed change in `change-set.yaml`

### Requirement: Keep Analysis Separate From Main Case Graph State

The system MUST NOT mutate main case graph state when running `incident-from-complaint`.

#### Scenario: Analysis new does not modify main

- **WHEN** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** no existing main case graph record YAML file under `./workspace/example-v-example-city/` outside `analysis/` is modified
- **THEN** no main case graph node is created
- **THEN** no graph edge is created
- **THEN** no accepted incident is created
- **THEN** no accepted fact is created
- **THEN** no accepted claim is created
- **THEN** no evidence record is marked as supporting any fact

#### Scenario: Workflow does not perform full case analysis

- **WHEN** the workflow produces analysis artifacts
- **THEN** the artifacts do not extract claims
- **THEN** the artifacts do not extract defenses
- **THEN** the artifacts do not extract qualified immunity arguments
- **THEN** the artifacts do not extract Monell theories
- **THEN** the artifacts do not extract opponent positions
- **THEN** the artifacts do not extract response units
- **THEN** the artifacts do not extract legal standards
- **THEN** the artifacts do not extract motion arguments
- **THEN** the artifacts do not extract settlement value
- **THEN** the artifacts do not extract litigation strategy

### Requirement: Resolve Omitted Case For Analysis

The system SHALL provide `casegraph cases analysis new` only when exactly one valid case exists and SHALL NOT create persistent default case state.

#### Scenario: Analysis is created for the single valid case

- **WHEN** exactly one valid case workspace exists at `./workspace/example-v-example-city`
- **AND** no current analysis exists
- **AND** the main case graph has no incident node
- **AND** complaint metadata identifies a local or downloadable complaint PDF source
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a zero status
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/root.yaml`
- **THEN** the system creates `./workspace/example-v-example-city/analysis/current/incident-from-complaint/root.yaml`
- **THEN** the system does not create a default-case pointer, current-case file, case manifest, or other durable case selection record

#### Scenario: Analysis cannot infer from zero cases

- **WHEN** no valid case workspace exists
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis is created
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new <case-id>`

#### Scenario: Analysis cannot infer from multiple cases

- **WHEN** multiple valid case workspaces exist
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis is created
- **THEN** the output explains that multiple cases exist
- **THEN** the output lists the available case IDs
- **THEN** the output tells the user to provide `<case-id>` explicitly

### Requirement: Validate Analysis Command Shape

The system MUST reject invalid `casegraph cases analysis new` command shapes without creating partial analysis workflow files.

#### Scenario: Missing case workspace is rejected

- **WHEN** `./workspace/missing-case` does not exist
- **AND** the user runs `casegraph cases analysis new missing-case`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis is created
- **THEN** the output explains that the case workspace does not exist

#### Scenario: Extra analysis token is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the user runs `casegraph cases analysis new example-v-example-city extra`
- **THEN** the command exits with a non-zero status
- **THEN** no current analysis is created
- **THEN** the output identifies `extra` as an unexpected argument
- **THEN** the output explains the required command shape
- **THEN** the system does not silently ignore the extra token

### Requirement: Provide Analysis Help

The system SHALL include the analysis command group and new command in CLI help.

#### Scenario: Cases help lists analysis command

- **WHEN** the user runs `casegraph cases --help`
- **THEN** the output lists the `analysis` command group

#### Scenario: Analysis help lists new command

- **WHEN** the user runs `casegraph cases analysis --help`
- **THEN** the command exits with a zero status
- **THEN** the output lists `new <case-id>`

#### Scenario: Analysis new help is available

- **WHEN** the user runs `casegraph cases analysis new --help`
- **THEN** the command exits with a zero status
- **THEN** the output explains that the command starts the `incident-from-complaint` workflow
- **THEN** the output explains that the workflow proposes an incident change set without changing main
- **THEN** the output explains that the case ID may be omitted only when exactly one valid case exists

## ADDED Requirements

### Requirement: Produce Incident Change Set

The system SHALL write `analysis/current/incident-from-complaint/change-set.yaml` as the user-reviewable representation of proposed graph mutations.

#### Scenario: Change set contains proposed incident changes

- **WHEN** the workflow creates `change-set.yaml`
- **THEN** the change set records the workflow name `incident-from-complaint`
- **THEN** the change set records changes needed to propose the first incident
- **THEN** every change has an initial review state of `proposed`
- **THEN** every change records one or more source task run IDs that produced or informed the change
- **THEN** the command does not automatically set any change to `approved`
- **THEN** the command does not automatically set any change to `applied`

#### Scenario: Change set uses allowed review states

- **WHEN** a change in `change-set.yaml` has a review state
- **THEN** the review state is one of `proposed`, `approved`, `discarded`, `conflicted`, or `applied`

#### Scenario: Change set is incident scoped

- **WHEN** the workflow creates proposed changes
- **THEN** proposed changes may include adding an incident
- **THEN** proposed changes may include adding actors
- **THEN** proposed changes may include adding source references
- **THEN** proposed changes may include adding data requests for source material needed to verify the incident
- **THEN** proposed changes do not include separate timeline-event, statement, action, movement, or incident-event nodes for the incident narrative
- **THEN** proposed changes do not include claims, defenses, legal standards, motion arguments, or litigation strategy

### Requirement: Enforce Source Discipline

The system SHALL require every proposed graph change from `incident-from-complaint` to trace back to a source.

#### Scenario: Proposed changes require source references

- **WHEN** `change-set.yaml` includes a proposed graph change
- **THEN** the proposed change records at least one source reference
- **THEN** the source reference identifies a complaint locator when based on the complaint
- **THEN** the complaint locator uses the best available paragraph number, page number, section heading, or docket attachment reference
- **THEN** the proposed change distinguishes direct quote, paraphrase, summary, inference, or missing-source observation
- **THEN** durable change type values and support kind values use kebab case

#### Scenario: Unsupported answers are rejected

- **WHEN** OpenAI extracts a factual answer
- **AND** the answer is not `unknown` or `not found in complaint`
- **AND** the answer does not include a complaint source location
- **THEN** the workflow rejects the extraction
- **THEN** the workflow does not create a proposed graph change from that answer
- **THEN** the workflow does not report that answer as supported

#### Scenario: Missing sources are not proof

- **WHEN** the workflow identifies source material that appears referenced, implied, or needed but unavailable
- **THEN** the workflow creates a proposed `add-data-request` change
- **THEN** the proposed data request records the source material name
- **THEN** the proposed data request records whether the source is directly referenced, likely exists, unknown, or needed to verify the incident
- **THEN** the proposed data request records the target agency when determinable, or `unknown`
- **THEN** the proposed data request records request text when determinable
- **THEN** the proposed data request records the complaint location supporting the need for the source
- **THEN** the proposed data request does not treat the missing source as proof

#### Scenario: Source material completion gate

- **WHEN** the workflow extracts a source material needed for the incident analysis
- **THEN** the workflow creates either an `add-source-reference` change for an available source material with a pinpoint complaint locator
- **OR** the workflow creates an `add-data-request` change for unavailable, referenced, likely existing, unknown, or verification-needed source material
- **THEN** the analysis is not ready for future apply behavior unless every extracted source material is represented by one of those proposed changes

### Requirement: Use Action-Oriented Analysis Output

The system SHALL keep default `analysis new` output focused on immediate user action.

#### Scenario: Successful output omits audit details

- **WHEN** `analysis new` creates the `incident-from-complaint` workflow
- **THEN** default output includes what was created
- **THEN** default output includes what incident was proposed
- **THEN** default output says the main case graph was unchanged
- **THEN** default output includes the combined workflow reports in execution order
- **THEN** default output tells the user to review or edit `analysis/current/incident-from-complaint/change-set.yaml`
- **THEN** stdout does not include checkpoint identifiers, LangGraph details, source-reference file paths, citation-audit file paths, log paths, empty counts, internal IDs, full file trees, or full source inventories

#### Scenario: Verbose progress is visible while analysis runs

- **WHEN** `analysis new` runs
- **THEN** the command writes progress messages to stderr
- **THEN** progress messages identify the current command or workflow step
- **THEN** progress messages include the current workflow name `incident-from-complaint` during workflow execution
- **THEN** progress messages include OpenAI model, prompt, and output details for the hard-coded OpenAI Responses extraction
- **THEN** stdout remains reserved for the final combined report and main-unchanged result

### Requirement: Define Analysis Working Graph

The system SHALL define the analysis working graph as the main case graph plus ordered proposed change sets in the current analysis.

#### Scenario: First workflow change stack

- **WHEN** `incident-from-complaint` creates a current analysis
- **THEN** the current analysis root records the change stack order as `main` followed by `incident-from-complaint`
- **THEN** the working graph is defined as `main + incident-from-complaint change set`
- **THEN** the workflow root records the working graph input snapshot consumed by the workflow
- **THEN** the workflow root records the working graph output snapshot produced by the workflow
- **THEN** the workflow input snapshot matches the main graph snapshot for the first workflow
- **THEN** later workflows may depend on graph objects proposed by earlier workflows only after a future OpenSpec change defines those workflows

#### Scenario: Workflow input drift stops resume

- **WHEN** a current analysis contains one or more workflow runs
- **AND** a workflow input snapshot no longer matches the reconstructed working graph state at that point in the change stack
- **AND** the user runs `casegraph cases analysis resume example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** the output says `Analysis not resumed.`
- **THEN** the output explains which workflow input changed
- **THEN** the output says rerun and recovery behavior is not implemented yet
- **THEN** the command does not update `analysis/current/root.yaml`
- **THEN** the main case graph remains unchanged

## REMOVED Requirements

### Requirement: Preserve Analysis Creation History

**Reason**: History for this workflow belongs in `analysis/current/root.yaml`, the workflow root, and the change set. A separate `.history` mutation manifest for `analysis new` would create durable audit behavior outside the approved first workflow shape.

**Migration**: Implementation should remove `.history` creation from `analysis new`. Future apply/archive behavior can define main graph mutation history when approved changes are applied.
