# courtlistener-import Specification

## Purpose

TBD - created by archiving change add-courtlistener-docket-import. Update Purpose after archive.

## Requirements

### Requirement: Import CourtListener Docket Command

The system SHALL provide `casegraph cases import courtlistener <docket-id> [--dry-run | --write]` to preview or create a new case workspace from CourtListener REST docket data.

#### Scenario: Dry run is the default

- **WHEN** the user runs `casegraph cases import courtlistener 10000001`
- **THEN** the command fetches the CourtListener docket data needed to describe the planned import
- **THEN** the command reports the derived case ID
- **THEN** the command reports the records that would be created
- **THEN** no case workspace is created

#### Scenario: Explicit dry run does not create workspace

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --dry-run`
- **THEN** the command reports the planned import
- **THEN** no case workspace is created

#### Scenario: Write creates imported case workspace

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system creates a case workspace using a safe case ID derived from the CourtListener docket slug or case name
- **THEN** the system writes current graph records for the imported CourtListener docket data
- **THEN** the command output reports the created workspace path

#### Scenario: Dry run and write are mutually exclusive

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --dry-run --write`
- **THEN** the command exits with a non-zero status
- **THEN** no case workspace is created
- **THEN** the output explains that `--dry-run` and `--write` cannot be used together

#### Scenario: Extra positional tokens are rejected

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 extra --write`
- **THEN** the command exits with a non-zero status
- **THEN** no case workspace is created
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

The system SHALL derive the new case ID from the CourtListener docket slug or case name and SHALL refuse unsafe, missing, or duplicate derived case IDs.

#### Scenario: Case ID is derived from docket slug

- **WHEN** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system creates `workspace/example-v-example-city`

#### Scenario: Derived case ID collision is rejected

- **WHEN** `workspace/example-v-example-city` already exists
- **AND** CourtListener returns docket slug `example-v-example-city`
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the command exits with a non-zero status
- **THEN** the existing workspace is unchanged
- **THEN** the output explains that the case workspace already exists
- **THEN** the output does not create an automatic suffix

#### Scenario: Unsafe derived case ID is rejected

- **WHEN** CourtListener does not return a slug or case name that can be converted into a valid case ID
- **AND** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the command exits with a non-zero status
- **THEN** no case workspace is created
- **THEN** the output explains that no safe case ID could be derived

### Requirement: Preserve CourtListener Request History

The system SHALL preserve raw CourtListener request and response records for each write import under `workspace/<case-id>/.history/<mutation-id>/`.

#### Scenario: Mutation history is written

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the system creates `workspace/<case-id>/.history/index.yaml`
- **THEN** the system creates `workspace/<case-id>/.history/<mutation-id>/manifest.yaml`
- **THEN** `<mutation-id>` is a compact CUID2-based mutation ID
- **THEN** `index.yaml` records the mutation ID, start time, command, and status
- **THEN** `manifest.yaml` records the mutation ID, full command argv, request IDs, request files, start time, completion time, and status

#### Scenario: Request files preserve full request and response

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** each CourtListener REST request is written as `<request-id>.yaml` in the mutation folder
- **THEN** each request file records request method, URL, redacted headers, response status, response headers, and full response body

#### Scenario: Mutation order is preserved by history index

- **WHEN** the case workspace contains multiple history mutations
- **THEN** `workspace/<case-id>/.history/index.yaml` lists mutations in execution order
- **THEN** graph record source references use mutation IDs rather than timestamps for compact references

### Requirement: Record Source References On Imported Graph Records

The system SHALL record `sources[]` arrays on imported graph records that reference mutation ID, request ID, and source response path.

#### Scenario: Docket record references source response

- **WHEN** the user runs `casegraph cases import courtlistener 10000001 --write`
- **THEN** the imported docket graph record contains a `sources` array
- **THEN** one source entry references the mutation ID
- **THEN** one source entry references the docket request ID
- **THEN** one source entry references the response path containing the CourtListener docket record

#### Scenario: Composite imported record can reference multiple sources

- **WHEN** an imported graph record is derived from more than one CourtListener response
- **THEN** its `sources` array contains one entry per source response used

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
