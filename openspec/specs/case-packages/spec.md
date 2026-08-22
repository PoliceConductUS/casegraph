# case-packages Specification

## Purpose

TBD - created by archiving change support-external-case-package-paths. Update Purpose after archive.

## Requirements

### Requirement: Declare Ordered Package Search Roots

The system SHALL store a case's ordered package search roots in
`CaseHome.spec.packagePath`.

#### Scenario: Relative entry resolves from case home

- **WHEN** `spec.packagePath` contains a relative directory path
- **THEN** the system resolves it from the directory containing the
  `CaseHome` root

#### Scenario: Absolute entry remains absolute

- **WHEN** `spec.packagePath` contains an absolute directory path
- **THEN** the system resolves that exact directory

#### Scenario: Order is preserved

- **WHEN** a package contains multiple package-path entries
- **THEN** the system preserves their declared order
- **THEN** order does not grant write ownership

### Requirement: Add Package Search Roots

The system SHALL provide `casegraph packages add <case-id> <path>...` to add one
or more directories to `CaseHome.spec.packagePath` atomically.

#### Scenario: One package path is added

- **WHEN** the user runs `casegraph packages add example-v-example-city ../authorities`
- **AND** the path resolves to an existing directory
- **THEN** the `CaseHome` writer appends its stored path to
  `spec.packagePath`
- **THEN** the output reports the case package changed

#### Scenario: Multiple package paths retain supplied order

- **WHEN** the user supplies multiple existing directory paths
- **THEN** the writer appends every path in supplied order in one update

#### Scenario: Missing path rejects entire batch

- **WHEN** any supplied path does not resolve to an existing directory
- **THEN** the command exits with a non-zero status
- **THEN** `spec.packagePath` is unchanged

#### Scenario: Duplicate path rejects entire batch

- **WHEN** any supplied path resolves to the same directory as an existing or
  another supplied entry
- **THEN** the command exits with a non-zero status
- **THEN** `spec.packagePath` is unchanged

#### Scenario: Missing or extra command arguments are rejected

- **WHEN** the user omits the case ID, omits all paths, or supplies tokens
  outside `add <case-id> <path>...`
- **THEN** the command exits with a non-zero status
- **THEN** no package is changed

#### Scenario: Stored path is relative when representable

- **WHEN** an added directory can be represented relative to the case home
- **THEN** the writer stores a relative path
- **THEN** the stored value resolves back to the supplied directory

### Requirement: Keep Package Search Roots Read Only

The system SHALL NOT infer managed-write authority from package-path membership,
package-path order, or filesystem permissions.

#### Scenario: Writable search-root directory remains unmanaged

- **WHEN** a directory is on `spec.packagePath` and the filesystem permits
  writes
- **THEN** CaseGraph treats the directory as read-only for managed writes

#### Scenario: No authorization field or command exists in this change

- **WHEN** this change is applied
- **THEN** `CaseHome` has no managed-write authorization field
- **THEN** the CLI has no command that grants shared-package write authority
- **THEN** adding such authority requires a later typed schema change
