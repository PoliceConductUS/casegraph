## MODIFIED Requirements

### Requirement: Create Case Workspace

The system SHALL provide `casegraph cases new <case-id>` to create a case workspace at `./workspace/<case-id>` for the provided case ID.

#### Scenario: New case workspace is created

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the system creates `./workspace/example-v-example-city`
- **THEN** the command output reports the created workspace path

#### Scenario: Root case node is created

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the system creates `./workspace/example-v-example-city/root.yaml`
- **THEN** `root.yaml` contains `type: node`
- **THEN** `root.yaml` contains `kind: case`
- **THEN** `root.yaml` contains `id: root`
- **THEN** `root.yaml` contains matching `created_at` and `updated_at` ISO timestamps
- **THEN** `root.yaml` does not contain null values
- **THEN** the command output reports the created root node path

#### Scenario: Case workspace is repo-local

- **WHEN** the user runs `casegraph cases new alpha-case` from the repository root
- **THEN** the system creates `./workspace/alpha-case`
- **THEN** the system does not create a workspace in the user's home directory or another global location

#### Scenario: Successful case creation explains the next complaint step

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the command output tells the user to add the complaint document with `casegraph cases add document example-v-example-city complaint <path-to-pdf>`
