## MODIFIED Requirements

### Requirement: Create Case Workspace

The system SHALL provide `casegraph cases new <case-id> --home <directory>
[--yes]` and SHALL create a strict `CaseHome` at the selected home and a
strict `CaseLocator` locator under the CaseGraph configuration home.

#### Scenario: Home is required

- **WHEN** the user runs `casegraph cases new example-v-example-city` without
  `--home`
- **THEN** the command exits with a non-zero status
- **THEN** no directory, package, or locator is created
- **THEN** the output explains that `--home <directory>` is required

#### Scenario: New home directory is approved

- **WHEN** the user runs `casegraph cases new example-v-example-city --home /cases/example-v-example-city`
- **AND** the home directory does not exist
- **AND** the user approves creating it and its `root.yaml`
- **THEN** the system creates the directory
- **THEN** the system creates `/cases/example-v-example-city/root.yaml` as a
  `policeconduct.org/casegraph/v1alpha1` `CaseHome`
- **THEN** the package has `metadata.name: example-v-example-city`
- **THEN** the package has an empty `spec.packagePath`
- **THEN** the package has `spec.graphRoot` with `type: node`, `kind: case`, and
  `id: root`
- **THEN** the system creates the matching `CaseLocator` locator only after
  the package validates

#### Scenario: Empty existing home is approved

- **WHEN** the selected home is an existing empty directory without
  `root.yaml`
- **AND** the user approves creating the package
- **THEN** the system creates the `CaseHome` and matching `CaseLocator`
- **THEN** the system leaves the selected directory as the case home

#### Scenario: Creation is declined

- **WHEN** the selected home or `root.yaml` does not exist
- **AND** the user declines its creation
- **THEN** the command exits with a non-zero status
- **THEN** the system does not create the declined item or a locator

#### Scenario: Yes approves creation prompts

- **WHEN** the user runs `casegraph cases new example-v-example-city --home /cases/example-v-example-city --yes`
- **AND** the selected home does not exist
- **THEN** the system creates the directory, `CaseHome`, and
  `CaseLocator` without an interactive creation prompt
- **THEN** `--yes` does not authorize package-path repairs or writes to shared
  packages

#### Scenario: Nonempty uninitialized home is rejected

- **WHEN** the selected home is a nonempty directory without `root.yaml`
- **THEN** the command exits with a non-zero status
- **THEN** the existing directory contents are unchanged
- **THEN** no locator is created

#### Scenario: Existing matching package is attached

- **WHEN** the selected home contains a valid `CaseHome` whose
  `metadata.name` matches the case ID
- **AND** no matching locator exists
- **THEN** the system does not rewrite the package
- **THEN** the system creates a `CaseLocator` locator whose `spec.home` is the
  canonical absolute package-root path

#### Scenario: Successful creation explains the next complaint step

- **WHEN** the command creates or attaches the case successfully
- **THEN** the output reports the selected case home and locator
- **THEN** the output tells the user to add the complaint document with
  `casegraph cases add document example-v-example-city complaint <path-to-pdf>`

### Requirement: Keep Case Workspaces Separated

The system SHALL keep case workspaces separated by case ID and SHALL NOT require
or create a single default case.

#### Scenario: Multiple external case homes can exist

- **WHEN** a valid locator and package exist for `case-one`
- **AND** the user creates `case-two` with a different home
- **THEN** the system creates a separate locator and package for `case-two`
- **THEN** the system leaves `case-one` unchanged

#### Scenario: Root graph identity is scoped by case package

- **WHEN** `case-one` and `case-two` each have a valid `CaseHome`
- **THEN** each package may contain `spec.graphRoot.id: root`
- **THEN** both root node IDs are valid because graph node IDs are scoped by
  case package

#### Scenario: No default case is created

- **WHEN** a case is created or attached
- **THEN** the system does not create a default-case pointer, current-case file,
  or global case selection

### Requirement: Resolve Single Existing Case

The system SHALL resolve an omitted `<case-id>` only for commands that
explicitly specify an omitted-case form and only when exactly one valid
`CaseLocator` locator resolves to a valid `CaseHome`.

#### Scenario: Valid case is discovered from typed locator and package

- **WHEN** the CaseGraph configuration home contains one valid `CaseLocator`
- **AND** its `spec.home` resolves to a matching valid `CaseHome`
- **THEN** the system treats its `metadata.name` as a valid existing case for
  omitted-case resolution

#### Scenario: Invalid locator is not a valid case

- **WHEN** a configuration-home directory contains a missing, malformed,
  unknown, or schema-invalid `root.yaml`
- **THEN** the system does not treat that directory as a valid case

#### Scenario: Missing or invalid package is not a valid case

- **WHEN** a valid `CaseLocator` points to a missing or invalid
  `CaseHome`
- **THEN** the system does not treat that locator as a valid case

#### Scenario: No valid case cannot be inferred

- **WHEN** no valid case exists
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new
<case-id> --home <directory>`

#### Scenario: Multiple valid cases cannot be inferred

- **WHEN** valid cases `case-one` and `case-two` exist
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the command exits with a non-zero status
- **THEN** the output lists both case IDs and requests an explicit `<case-id>`

#### Scenario: No persistent default case is created

- **WHEN** exactly one valid case exists
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the system does not create any durable case-selection record

### Requirement: Prevent Overwrite

The system SHALL refuse to overwrite an existing case locator or a selected
home package.

#### Scenario: Existing locator is not overwritten

- **WHEN** a locator already exists for `example-v-example-city`
- **AND** the user runs `cases new` with that case ID
- **THEN** the command exits with a non-zero status
- **THEN** the existing locator and case home are unchanged

#### Scenario: Mismatched home package is not overwritten

- **WHEN** the selected home contains a `CaseHome` with another
  `metadata.name`
- **THEN** the command exits with a non-zero status
- **THEN** the existing package is unchanged
- **THEN** no locator is created

### Requirement: Reject Invalid Case IDs

The system SHALL reject case IDs that are not safe cross-platform folder names
and SHALL suggest a cleaned case ID without creating it. A valid case ID MUST be
exactly one command argument, contain only ASCII letters, numbers, hyphens, or
underscores, and MUST NOT be empty, whitespace, `.` or `..`, a Windows reserved
device name, or a case-insensitive duplicate locator name.

#### Scenario: Court-style case ID is accepted

- **WHEN** the user runs `casegraph cases new 1-26-CV-00001 --home /cases/1-26-CV-00001`
- **AND** creation is approved
- **THEN** the system creates matching `CaseLocator` and `CaseHome`
  documents named `1-26-CV-00001`

#### Scenario: Invalid case ID is rejected with suggestion

- **WHEN** the user provides `Example v. Example City / 2025` as the case ID
- **THEN** the command exits with a non-zero status
- **THEN** no package or locator is created
- **THEN** the output suggests `Example-v-Example-City-2025`

#### Scenario: Missing or extra case ID arguments are rejected

- **WHEN** the user omits the case ID or supplies unexpected positional tokens
- **THEN** the command exits with a non-zero status
- **THEN** no package or locator is created
- **THEN** the extra tokens are a hard error rather than ignored input

#### Scenario: Case-insensitive locator duplicate is rejected

- **WHEN** a locator named `Case-One` exists
- **AND** the user runs `cases new case-one --home /cases/case-one`
- **THEN** the command exits with a non-zero status
- **THEN** the existing locator and home are unchanged

### Requirement: Provide CLI Help

The system SHALL provide useful help for the root, `cases`, `cases new`,
`packages`, and `packages add` command levels.

#### Scenario: New command help describes explicit home

- **WHEN** the user runs `casegraph cases new --help`
- **THEN** the output shows `cases new <case-id> --home <directory> [--yes]`
- **THEN** the output explains the creation prompts and external case home

#### Scenario: Packages help is available

- **WHEN** the user runs `casegraph packages --help`
- **THEN** the output lists `add <case-id> <path>...`

#### Scenario: Packages add help defines exact arguments

- **WHEN** the user runs `casegraph packages add --help`
- **THEN** the output explains that one or more directory paths are required
- **THEN** the output explains ordered, atomic addition to
  `spec.packagePath`

### Requirement: Keep First Command Scope Small

The system SHALL NOT add graph editing, source connectors, database setup,
report generation, citation auditing, drafting integration, default-case
behavior, or shared-package write authorization as part of case creation.

#### Scenario: Creating a case initializes only its package contract

- **WHEN** the user creates a case
- **THEN** the system creates only the selected directory, `CaseHome`, and
  `CaseLocator` required for the case
- **THEN** the system does not require network access, database credentials,
  source connectors, or drafting configuration
- **THEN** the system does not create a separate case manifest

### Requirement: Create Case Workspace From CourtListener Import

The system SHALL allow a CourtListener write import to create a new external
case package when the derived case ID is valid and unused and an explicit home
is supplied.

#### Scenario: Imported case requires home

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
  without `--home`
- **THEN** the command exits with a non-zero status before writing files
- **THEN** the output explains that `--home <directory>` is required for a
  write import

#### Scenario: Imported package and locator are created

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write
--home /cases/example-v-example-city`
- **AND** creation is approved
- **THEN** the system creates a matching `CaseHome` and `CaseLocator`
- **THEN** imported graph records and history are written under the selected
  case home
- **THEN** `spec.graphRoot` contains source references to the import mutation

#### Scenario: Imported case does not create default selection

- **WHEN** a CourtListener write import succeeds
- **THEN** the system does not create a default-case pointer, current-case file,
  or global case selection

#### Scenario: Existing imported locator is not overwritten

- **WHEN** a locator already exists for the derived case ID
- **THEN** the command exits with a non-zero status
- **THEN** the locator and selected home are unchanged

## ADDED Requirements

### Requirement: Load External Case Workspace

The system SHALL load every existing case operation through the typed
`CaseLocator` and `CaseHome` readers and SHALL validate all package search
roots before running the requested operation.

#### Scenario: Envelope is strictly validated

- **WHEN** either root has a wrong `apiVersion`, wrong `kind`, missing
  `metadata.name`, invalid `spec`, or unknown field
- **THEN** loading fails before the requested operation
- **THEN** the error identifies the invalid file and expected document type

#### Scenario: Locator and package names must match

- **WHEN** the requested case ID, locator `metadata.name`, locator directory,
  and package `metadata.name` do not all match
- **THEN** loading fails before the requested operation

#### Scenario: Home must be canonical package-root path

- **WHEN** `CaseLocator.spec.home` is not an absolute path ending in
  `root.yaml`
- **THEN** loading fails before the requested operation

#### Scenario: Package paths are validated on every load

- **WHEN** all `CaseHome.spec.packagePath` entries resolve to existing
  directories
- **THEN** the requested operation may proceed with those ordered search roots

#### Scenario: Missing package path is repaired interactively

- **WHEN** a package-path entry does not resolve
- **AND** the user supplies an existing replacement directory
- **AND** the user confirms the displayed old and new stored values
- **THEN** the `CaseHome` writer atomically replaces that entry
- **THEN** loading resumes only after the rewritten package validates

#### Scenario: Unresolved package path blocks operation

- **WHEN** a package-path entry does not resolve
- **AND** the session is non-interactive, the user declines, or a replacement
  is invalid
- **THEN** loading fails before the requested operation
- **THEN** the error identifies the missing entry and package root to edit

#### Scenario: Write operation requires writable case home

- **WHEN** a case-specific write operation loads a valid package whose home is
  not writable
- **THEN** loading fails before the requested operation writes any file

### Requirement: Use One Reader And Writer Per Document Type

The system SHALL have one strict reader/writer for `CaseLocator` and one
strict reader/writer for `CaseHome`.

#### Scenario: CaseLocator is handled only by its owner

- **WHEN** CaseGraph reads, creates, validates, or rewrites a `CaseLocator`
- **THEN** the operation uses the `CaseLocator` reader/writer
- **THEN** no generic or legacy YAML path accepts the document

#### Scenario: CaseHome is handled only by its owner

- **WHEN** CaseGraph reads, creates, validates, or rewrites a `CaseHome`
- **THEN** the operation uses the `CaseHome` reader/writer
- **THEN** no other module directly serializes or mutates the package envelope
