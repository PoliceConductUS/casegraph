## MODIFIED Requirements

### Requirement: Import CourtListener Docket Command

The system SHALL provide `casegraph cases import courtlistener <docket-id>
[--dry-run | --write] [--home <directory>] [--yes]` to preview or create a case
package from CourtListener REST docket data. `--home` SHALL be required with
`--write` and SHALL NOT be required for a dry run.

#### Scenario: Dry run is the default and needs no home

- **WHEN** the user runs `casegraph cases import courtlistener 10000001`
- **THEN** the command fetches the CourtListener data needed to describe the
  planned import
- **THEN** the command reports the derived case ID and planned records
- **THEN** no package, locator, or case file is created

#### Scenario: Explicit dry run does not create case files

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --dry-run`
- **THEN** the command reports the planned import
- **THEN** no package, locator, or case file is created

#### Scenario: Write requires an explicit home

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the command exits with a non-zero status
- **THEN** no package, locator, or case file is created
- **THEN** the output explains that `--home <directory>` is required

#### Scenario: Write creates imported external package

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write
--home /cases/example-v-example-city`
- **AND** creation is approved
- **THEN** the system creates the case package using a safe case ID derived from
  the CourtListener docket
- **THEN** the system creates the matching machine-local locator
- **THEN** the system writes current graph records under the selected home
- **THEN** the output reports the selected home

#### Scenario: Dry run and write are mutually exclusive

- **WHEN** the user supplies both `--dry-run` and `--write`
- **THEN** the command exits with a non-zero status
- **THEN** no case file is created

#### Scenario: Extra positional tokens are rejected

- **WHEN** the user supplies unexpected positional tokens
- **THEN** the command exits with a non-zero status
- **THEN** no case file is created
- **THEN** the output explains the required command shape

### Requirement: Derive Imported Case ID

The system SHALL derive the new case ID from the CourtListener docket slug or
case name and SHALL refuse unsafe, missing, or duplicate derived case IDs.

#### Scenario: Case ID names both envelopes

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** a write import succeeds
- **THEN** the new `CaseLocator.metadata.name` is
  `example-v-example-city`
- **THEN** the new `CaseHome.metadata.name` is `example-v-example-city`

#### Scenario: Derived case ID collision is rejected

- **WHEN** a case-insensitive matching locator already exists
- **AND** CourtListener derives that case ID
- **THEN** the command exits with a non-zero status
- **THEN** the existing locator and package are unchanged
- **THEN** the system does not create an automatic suffix

#### Scenario: Unsafe derived case ID is rejected

- **WHEN** CourtListener does not return a slug or case name convertible to a
  valid case ID
- **THEN** the command exits with a non-zero status
- **THEN** no package or locator is created

### Requirement: Preserve CourtListener Request History

The system SHALL preserve raw CourtListener request and response records for
each write import under `<case-home>/.history/<mutation-id>/`.

#### Scenario: Mutation history is written under selected home

- **WHEN** a write import succeeds
- **THEN** the system creates `<case-home>/.history/index.yaml`
- **THEN** the system creates
  `<case-home>/.history/<mutation-id>/manifest.yaml`
- **THEN** each request record is written in that mutation directory
- **THEN** no history is written under the CaseGraph configuration home

### Requirement: Record Source References On Imported Graph Records

The system SHALL record `sources[]` arrays on imported graph records and on the
`CaseHome.spec.graphRoot` when applicable, referencing mutation ID, request
ID, and source response path.

#### Scenario: Package graph root references import source

- **WHEN** a CourtListener write import creates a case package
- **THEN** `CaseHome.spec.graphRoot.sources` references the import mutation
  and docket request

#### Scenario: Imported record references source response

- **WHEN** an imported graph record is written under the selected home
- **THEN** its `sources` array identifies every CourtListener response used to
  derive that record
