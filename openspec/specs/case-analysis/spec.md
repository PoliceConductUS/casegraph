# case-analysis Specification

## Purpose

TBD - created by archiving change add-analysis-new. Update Purpose after archive.

## Requirements

### Requirement: Create Review Analysis Artifact

The system SHALL provide `casegraph cases analysis new <case-id>` to create one review-only analysis artifact for an existing case workspace.

#### Scenario: Analysis artifact is created

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a zero status
- **THEN** the system creates `./workspace/example-v-example-city/analysis/` when it does not exist
- **THEN** the system creates one YAML analysis file under `./workspace/example-v-example-city/analysis/`
- **THEN** the analysis file contains an opaque `id`
- **THEN** the analysis file name stem matches the `id`
- **THEN** the analysis file records `case_id: example-v-example-city`
- **THEN** the analysis file records `status: draft`
- **THEN** the analysis file records matching `created_at` and `updated_at` ISO timestamps
- **THEN** the analysis file does not contain null values
- **THEN** the command output reports the created analysis ID
- **THEN** the command output reports the created analysis path
- **THEN** the command output states that the main case graph was not changed

#### Scenario: Existing analysis artifact is not overwritten

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** an analysis file already exists at the generated analysis path
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** the existing analysis file is unchanged
- **THEN** the output explains that the analysis file already exists

### Requirement: Populate Analysis From Existing Metadata Only

The system SHALL populate the initial analysis artifact deterministically from repo-local case workspace YAML metadata only.

#### Scenario: Existing records considered are recorded

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the workspace contains graph record YAML files
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the analysis artifact records the source graph record IDs considered
- **THEN** the source graph record IDs include registered evidence record IDs when evidence records exist
- **THEN** the source graph record IDs include imported document or docket record IDs when those records exist
- **THEN** the system does not open external evidence paths
- **THEN** the system does not parse, transcribe, summarize, classify, or inspect file contents

#### Scenario: Review sections are initialized

- **WHEN** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the analysis artifact includes `complaint_expansion`
- **THEN** the analysis artifact includes `evidence_review`
- **THEN** the analysis artifact includes `transcript_requests`
- **THEN** the analysis artifact includes `event_timeline`
- **THEN** the analysis artifact includes `issue_map`
- **THEN** the analysis artifact includes `unsupported_facts`
- **THEN** the analysis artifact includes `suggested_next_steps`
- **THEN** empty review sections are represented as empty arrays or empty structured objects, not null values

#### Scenario: Candidate evidence inputs are listed without support claims

- **WHEN** the workspace contains registered evidence records
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the analysis artifact lists the evidence records as candidate review inputs
- **THEN** the analysis artifact does not claim that any evidence supports a fact, claim, element, authority, or legal conclusion

#### Scenario: Candidate pleading inputs are listed only when determinable

- **WHEN** the workspace contains imported document or docket records
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the analysis artifact lists candidate complaint or pleading inputs only when existing YAML metadata supports that identification
- **THEN** the analysis artifact does not claim complaint or pleading completeness

### Requirement: Preserve Analysis Creation History

The system SHALL preserve provenance for analysis creation under the case workspace `.history/` directory.

#### Scenario: Analysis creation history is recorded

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the system writes a mutation manifest under `./workspace/example-v-example-city/.history/`
- **THEN** the mutation manifest records the command
- **THEN** the mutation manifest records the case ID
- **THEN** the mutation manifest records the created analysis ID
- **THEN** the mutation manifest records the created analysis path
- **THEN** the mutation manifest records the source graph record IDs considered
- **THEN** the mutation manifest records the mutation timestamp

### Requirement: Keep Analysis Separate From Main Case Graph State

The system MUST NOT mutate main case graph state when creating a new analysis artifact.

#### Scenario: Analysis creation does not modify graph records

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the workspace contains graph record YAML files
- **AND** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** no existing graph record YAML file under `./workspace/example-v-example-city/` is modified
- **THEN** no graph edge is created
- **THEN** no accepted fact is created
- **THEN** no accepted claim is created
- **THEN** no evidence record is marked as supporting any fact

#### Scenario: No AI review is claimed

- **WHEN** the user runs `casegraph cases analysis new example-v-example-city`
- **THEN** the analysis artifact does not claim that AI reviewed any file
- **THEN** the analysis artifact does not contain transcript text generated by the system
- **THEN** the analysis artifact does not contain event findings generated by the system
- **THEN** the analysis artifact does not contain legal conclusions generated by the system

### Requirement: Resolve Omitted Case For Analysis

The system SHALL provide `casegraph cases analysis new` only when exactly one valid case exists and SHALL NOT create persistent default case state.

#### Scenario: Analysis is created for the single valid case

- **WHEN** exactly one valid case workspace exists at `./workspace/example-v-example-city`
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a zero status
- **THEN** the system creates one analysis artifact under `./workspace/example-v-example-city/analysis/`
- **THEN** the system does not create a default-case pointer, current-case file, case manifest, or other durable case selection record

#### Scenario: Analysis cannot infer from zero cases

- **WHEN** no valid case workspace exists
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a non-zero status
- **THEN** no analysis artifact is created
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new <case-id>`

#### Scenario: Analysis cannot infer from multiple cases

- **WHEN** multiple valid case workspaces exist
- **AND** the user runs `casegraph cases analysis new`
- **THEN** the command exits with a non-zero status
- **THEN** no analysis artifact is created
- **THEN** the output explains that multiple cases exist
- **THEN** the output lists the available case IDs
- **THEN** the output tells the user to provide `<case-id>` explicitly

### Requirement: Validate Analysis Command Shape

The system MUST reject invalid `casegraph cases analysis new` command shapes without creating partial analysis artifacts.

#### Scenario: Missing case workspace is rejected

- **WHEN** `./workspace/missing-case` does not exist
- **AND** the user runs `casegraph cases analysis new missing-case`
- **THEN** the command exits with a non-zero status
- **THEN** no analysis artifact is created
- **THEN** the output explains that the case workspace does not exist

#### Scenario: Extra analysis token is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the user runs `casegraph cases analysis new example-v-example-city extra`
- **THEN** the command exits with a non-zero status
- **THEN** no analysis artifact is created
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
- **THEN** the output explains that the command creates a review-only analysis artifact
- **THEN** the output explains that the case ID may be omitted only when exactly one valid case exists
