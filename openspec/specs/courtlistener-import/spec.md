# courtlistener-import Specification

## Purpose

TBD - created by archiving change add-courtlistener-docket-import. Update Purpose after archive.

## Requirements

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

### Requirement: Authenticate CourtListener Requests

The system SHALL read the CourtListener API token from `COURTLISTENER_API_TOKEN` and MUST NOT print or persist the token.

#### Scenario: Missing token is rejected

- **WHEN** `COURTLISTENER_API_TOKEN` is not set
- **AND** the user runs `casegraph cases import courtlistener 10000001 --dry-run`
- **THEN** the command exits with a non-zero status
- **THEN** no case workspace is created
- **THEN** the output explains that `COURTLISTENER_API_TOKEN` is required

#### Scenario: Token is not printed

- **WHEN** `COURTLISTENER_API_TOKEN` is set
- **AND** the user runs `casegraph cases import courtlistener 10000001 --dry-run`
- **THEN** stdout does not contain the token value
- **THEN** stderr does not contain the token value

#### Scenario: Token is redacted from request history

- **WHEN** `COURTLISTENER_API_TOKEN` is set
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** every persisted request record that includes an authorization header records it as `redacted`
- **THEN** no persisted file under the case workspace contains the token value

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

### Requirement: Import First-Order CourtListener Records

The system SHALL import first-order CourtListener docket data as current graph records without creating legal analysis records.

#### Scenario: Imported graph IDs are opaque local IDs

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** each generated imported graph record has an opaque local ID that does not encode source system, source model, source record ID, or graph type
- **THEN** each generated imported graph record is written to `<id>.yaml`
- **THEN** CourtListener source system, source model, and source record ID are recorded in `sources[]`
- **THEN** CourtListener source record IDs are not recorded as top-level graph record identity properties

#### Scenario: Imported graph records use explicit minimal mappings

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** current graph records include only properties explicitly listed in the CourtListener docket import mapping
- **THEN** unmapped CourtListener response fields remain preserved in `.history` request files
- **THEN** adding a newly needed imported graph property requires changing the explicit mapping or explicit importer code

#### Scenario: Docket metadata is imported

- **WHEN** CourtListener returns docket metadata for docket `10000001`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the imported graph records include court reference, case name, docket number, filed date when available, jurisdiction type when available, nature of suit when available, and PACER case ID when available

#### Scenario: Parties are imported with roles as properties

- **WHEN** CourtListener returns parties for docket `10000001`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** imported party records preserve CourtListener party names
- **THEN** party roles are recorded as properties

#### Scenario: Attorneys are imported with representations as properties

- **WHEN** CourtListener returns attorneys for docket `10000001`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** imported attorney records preserve CourtListener attorney names and available contact fields
- **THEN** representation relationships are recorded as properties

#### Scenario: Docket entries and RECAP documents are imported

- **WHEN** CourtListener returns docket entries and RECAP documents for docket `10000001`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** imported records preserve docket entry numbers, filed dates, descriptions, document numbers, attachment numbers, availability, local filepath values, plain text when returned by CourtListener, local graph record references, and source references

### Requirement: Preserve Filing-Level Citation Data

The system SHALL preserve CourtListener citation data at filing or RECAP document scope and MUST NOT model a docket as citing authorities.

#### Scenario: RECAP document cites are recorded as properties

- **WHEN** CourtListener returns a RECAP document with a `cites` array
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the imported filing or document record preserves those cited authority IDs as properties
- **THEN** the system does not create an edge for those citations

#### Scenario: Docket is not modeled as citing authority

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** no imported docket record contains a docket-level citation relationship
- **THEN** no output describes the docket as citing an authority

#### Scenario: Citation lookup results are preserved when available

- **WHEN** CourtListener citation lookup succeeds for a text-bearing RECAP document
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the imported filing or document record preserves citation mention data as properties or source-backed references
- **THEN** the system does not create citation edges

#### Scenario: Citation lookup rate limit is visible

- **WHEN** CourtListener citation lookup returns a rate limit response for a text-bearing RECAP document
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the request response is preserved in mutation history
- **THEN** the command output reports that citation lookup was incomplete
- **THEN** the import does not report full citation lookup success

### Requirement: Avoid Unspecified Import Features

The system SHALL NOT add unspecified source, analysis, refresh, undo, or graph-edge behavior as part of CourtListener docket import.

#### Scenario: No unsupported integrations are added

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system does not use PACER direct login
- **THEN** the system does not use CourtListener MCP
- **THEN** the system does not read Google Drive, OneDrive, S3, Gmail, Outlook, local folders, BWC videos, transcripts, policies, or local PDFs
- **THEN** the system does not scrape CourtListener HTML

#### Scenario: No analysis records are created

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system does not extract facts
- **THEN** the system does not generate legal claims, issues, arguments, hypotheses, strengths, weaknesses, or missing-document analysis
- **THEN** the system does not create graph edge records

#### Scenario: No refresh or undo behavior is added

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system does not create before snapshots
- **THEN** the system does not create after snapshots
- **THEN** the system does not create an undo command
- **THEN** the system does not refresh an existing workspace
