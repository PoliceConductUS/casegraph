# case-reports Specification

## Purpose

TBD - created by archiving change report-imported-case-state. Update Purpose after archive.

## Requirements

### Requirement: Report Legal Docket Chronology

The system SHALL provide `casegraph cases report <case-id>` to print a read-only legal docket for an existing case workspace.

#### Scenario: Imported docket entries are reported chronologically

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the workspace contains CourtListener-imported docket entry graph records
- **AND** the user runs `casegraph cases report example-v-example-city`
- **THEN** the command exits with a zero status
- **THEN** the output identifies the report as a legal docket
- **THEN** the output lists docket entries ordered by filed date and then entry number
- **THEN** each visible docket entry reports its filed date, entry number when present, and docket action text
- **THEN** each visible docket entry row is no longer than 80 characters
- **THEN** docket action text that would make a row exceed 80 characters is truncated visibly
- **THEN** the command does not create, modify, or delete files in the case workspace

#### Scenario: Related imported documents are shown when visible

- **WHEN** an imported docket entry references imported document records
- **AND** the user runs `casegraph cases report example-v-example-city`
- **THEN** the output reports the related imported document references under that docket entry
- **THEN** the output does not claim document completeness beyond current records

#### Scenario: Missing docket entries are reported

- **WHEN** a valid case workspace contains no docket entry records
- **AND** the user runs `casegraph cases report example-v-example-city`
- **THEN** the command exits with a zero status
- **THEN** the output reports that no docket entries are present
- **THEN** the output does not infer facts, claims, evidence support, authority support, or legal conclusions

#### Scenario: Missing next-step categories are reported after the docket

- **WHEN** an imported case workspace has no evidence records
- **AND** the workspace has no accepted fact records
- **AND** the workspace has no accepted claim records
- **AND** the workspace has no support analysis records
- **AND** the user runs `casegraph cases report example-v-example-city`
- **THEN** the output reports the missing next-step categories after the legal docket
- **THEN** the output reports that no evidence records are present
- **THEN** the output reports that no accepted facts are present
- **THEN** the output reports that no accepted claims are present
- **THEN** the output reports that no support analysis is present
- **THEN** the output does not infer facts, claims, evidence support, authority support, or legal conclusions

### Requirement: Resolve Omitted Case For Report

The system SHALL provide `casegraph cases report` only when exactly one valid case exists and SHALL NOT create persistent default case state.

#### Scenario: Report uses the single valid case

- **WHEN** exactly one valid case workspace exists
- **AND** the user runs `casegraph cases report`
- **THEN** the command exits with a zero status
- **THEN** the output reports the legal docket for that single case workspace
- **THEN** the system does not create a default-case pointer, current-case file, case manifest, or other durable case selection record

#### Scenario: Report cannot infer from zero cases

- **WHEN** no valid case workspace exists
- **AND** the user runs `casegraph cases report`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new <case-id>`

#### Scenario: Report cannot infer from multiple cases

- **WHEN** multiple valid case workspaces exist
- **AND** the user runs `casegraph cases report`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that multiple cases exist
- **THEN** the output lists the available case IDs
- **THEN** the output tells the user to provide `<case-id>` explicitly

### Requirement: Validate Report Command Shape

The system MUST reject invalid `casegraph cases report` command shapes without reporting partial success.

#### Scenario: Missing case workspace is rejected

- **WHEN** `./workspace/missing-case` does not exist
- **AND** the user runs `casegraph cases report missing-case`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that the case workspace does not exist

#### Scenario: Extra report tokens are rejected

- **WHEN** the user runs `casegraph cases report example-v-example-city extra`
- **THEN** the command exits with a non-zero status
- **THEN** no report is printed
- **THEN** the output identifies `extra` as an unexpected argument
- **THEN** the output explains the required command shape
- **THEN** the system does not silently ignore the extra token

### Requirement: Provide Case Report Help

The system SHALL include the report command in `casegraph cases --help` and SHALL provide clean help output for `casegraph cases report --help`.

#### Scenario: Cases help lists report command

- **WHEN** the user runs `casegraph cases --help`
- **THEN** the output lists `report <case-id>`

#### Scenario: Report help is available

- **WHEN** the user runs `casegraph cases report --help`
- **THEN** the command exits with a zero status
- **THEN** the output explains that the command prints a read-only legal docket
- **THEN** the output explains that the case ID may be omitted only when exactly one valid case exists
