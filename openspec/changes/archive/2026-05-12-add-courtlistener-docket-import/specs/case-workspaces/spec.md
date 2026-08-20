## ADDED Requirements

### Requirement: Create Case Workspace From CourtListener Import

The system SHALL allow a CourtListener docket import write to create a new case workspace when the derived case ID is valid and unused.

#### Scenario: Imported case workspace is repo-local

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write` from the repository root
- **THEN** the system creates `./workspace/example-v-example-city`
- **THEN** the system does not create a workspace in the user's home directory or another global location

#### Scenario: Imported root case node is created

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system creates `./workspace/example-v-example-city/root.yaml`
- **THEN** `root.yaml` contains `type: node`
- **THEN** `root.yaml` contains `kind: case`
- **THEN** `root.yaml` contains `id: root`
- **THEN** `root.yaml` contains matching `created_at` and `updated_at` ISO timestamps
- **THEN** `root.yaml` contains a `sources` array referencing the CourtListener import mutation
- **THEN** `root.yaml` does not contain null values

#### Scenario: Imported workspace does not create default case

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system creates `./workspace/example-v-example-city`
- **THEN** the system does not create a default-case pointer, current-case file, or global case selection

#### Scenario: Existing imported workspace is not overwritten

- **WHEN** `./workspace/example-v-example-city` already exists
- **AND** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the command exits with a non-zero status
- **THEN** the command output explains that the workspace already exists
- **THEN** the existing workspace contents are unchanged
