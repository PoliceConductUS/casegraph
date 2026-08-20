## ADDED Requirements

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

### Requirement: Keep Case Workspaces Separated

The system SHALL keep case workspaces separated by case ID and SHALL NOT require or create a single default case.

#### Scenario: Multiple case workspaces can exist

- **WHEN** `./workspace/case-one` already exists
- **AND** the user runs `casegraph cases new case-two`
- **THEN** the system creates `./workspace/case-two`
- **THEN** the system leaves `./workspace/case-one` unchanged

#### Scenario: Root node identity is scoped by case workspace

- **WHEN** `./workspace/case-one/root.yaml` exists with `id: root`
- **AND** the user runs `casegraph cases new case-two`
- **THEN** the system creates `./workspace/case-two/root.yaml` with `id: root`
- **THEN** both root node IDs are valid because node IDs are unique within a case workspace

#### Scenario: No default case is created

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the system creates `./workspace/example-v-example-city`
- **THEN** the system does not create a default-case pointer, current-case file, or global case selection

### Requirement: Prevent Overwrite

The system SHALL refuse to create a case workspace when `./workspace/<case-id>` already exists.

#### Scenario: Existing workspace is not overwritten

- **WHEN** `./workspace/example-v-example-city` already exists
- **AND** the user runs `casegraph cases new example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** the command output explains that the workspace already exists
- **THEN** the existing workspace contents are unchanged

### Requirement: Reject Invalid Case IDs

The system SHALL reject case IDs that are not safe cross-platform folder names and SHALL suggest a cleaned case ID without creating the suggested workspace. A valid case ID MUST be provided as exactly one command argument and MUST contain only ASCII letters, numbers, hyphens, or underscores. A valid case ID MUST NOT be empty, all whitespace, `.` or `..`, a Windows reserved device name, or a case-insensitive duplicate of an existing case workspace.

#### Scenario: Court-style case ID is accepted

- **WHEN** the user runs `casegraph cases new 1-26-CV-00001`
- **THEN** the system creates `./workspace/1-26-CV-00001`
- **THEN** the system creates `./workspace/1-26-CV-00001/root.yaml`

#### Scenario: Invalid case ID is rejected with suggestion

- **WHEN** the user runs `casegraph cases new "Example v. Example City / 2025"`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is not a safe folder name
- **THEN** the output suggests `Example-v-Example-City-2025`
- **THEN** the system does not create the suggested workspace unless the user reruns the command with that ID

#### Scenario: Missing case ID is rejected

- **WHEN** the user runs `casegraph cases new`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is required

#### Scenario: Extra case ID arguments are rejected

- **WHEN** the user runs `casegraph cases new Example v Example City`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID must be provided as one argument
- **THEN** the output suggests `Example-v-Example-City`
- **THEN** the system treats the extra tokens as a hard error instead of ignoring them
- **THEN** the system does not create `./workspace/Example`

#### Scenario: Leading and trailing whitespace is rejected with suggestion

- **WHEN** the user runs `casegraph cases new "  1-26-CV-00001  "`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is not a safe folder name
- **THEN** the output suggests `1-26-CV-00001`

#### Scenario: Whitespace-only case ID is rejected without suggestion

- **WHEN** the user runs `casegraph cases new "   "`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is not a safe folder name
- **THEN** the output does not suggest a case ID

#### Scenario: Case ID with no usable characters is rejected without suggestion

- **WHEN** the user runs `casegraph cases new "///"`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is not a safe folder name
- **THEN** the output does not suggest a case ID

#### Scenario: Windows reserved device name is rejected

- **WHEN** the user runs `casegraph cases new CON`
- **THEN** the command exits with a non-zero status
- **THEN** no workspace is created
- **THEN** the output explains that the case ID is not a safe folder name

#### Scenario: Case-insensitive duplicate is rejected

- **WHEN** `./workspace/Case-One` already exists
- **AND** the user runs `casegraph cases new case-one`
- **THEN** the command exits with a non-zero status
- **THEN** the command output explains that the workspace already exists

### Requirement: Provide CLI Help

The system SHALL provide useful help for `casegraph --help`, `casegraph cases --help`, and `casegraph cases new --help`.

#### Scenario: Root help is available

- **WHEN** the user runs `casegraph --help`
- **THEN** the output lists the `cases` command group

#### Scenario: Cases help is available

- **WHEN** the user runs `casegraph cases --help`
- **THEN** the output lists the `new <case-id>` command

#### Scenario: New command help is available

- **WHEN** the user runs `casegraph cases new --help`
- **THEN** the output explains that the command creates a repo-local case workspace
- **THEN** the output states that workspaces are separated by case ID
- **THEN** the output states that case IDs use letters, numbers, hyphens, and underscores
- **THEN** the output states that workspaces may be checked into this repository

### Requirement: Keep First Command Scope Small

The system SHALL NOT add case graph editing, source connectors, database setup, report generation, citation auditing, drafting integration, or default-case behavior as part of this command.

#### Scenario: Creating a case does not initialize graph features

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the system creates only the workspace structure and `root.yaml` required for a separated case workspace
- **THEN** the system does not require database credentials, network access, source connector configuration, or drafting configuration

#### Scenario: Case manifest is not created

- **WHEN** the user runs `casegraph cases new example-v-example-city`
- **THEN** the system does not create `./workspace/example-v-example-city/case.yaml`
