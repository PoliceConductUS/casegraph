# case-documents Specification

## Purpose

Define how CaseGraph records document nodes inside case workspaces.

## Requirements

### Requirement: Record Complaint Document

The system SHALL provide `casegraph cases add document <case-id> complaint <path-to-pdf>` to record a complaint document node in an existing case workspace. The system SHALL also provide `casegraph cases add document complaint <path-to-pdf>` when exactly one valid case exists.

#### Scenario: Complaint document record is created

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** `/records/complaint.pdf` exists, is readable, and starts with the PDF signature
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf`
- **THEN** the system creates `./workspace/example-v-example-city/complaint.yaml`
- **THEN** `complaint.yaml` contains `type: node`
- **THEN** `complaint.yaml` contains `kind: document`
- **THEN** `complaint.yaml` contains `id: complaint`
- **THEN** `complaint.yaml` contains `document_type: complaint`
- **THEN** `complaint.yaml` records `/records/complaint.pdf` as the document path
- **THEN** the command output reports the created complaint document path
- **THEN** the command output tells the user to run `casegraph cases augment` with no arguments to report directly referenced items that are not yet in the graph

#### Scenario: Complaint document record is created for the single valid case

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid root case node
- **AND** no other valid case exists
- **AND** `/records/complaint.pdf` exists, is readable, and starts with the PDF signature
- **AND** the user runs `casegraph cases add document complaint /records/complaint.pdf`
- **THEN** the system creates `./workspace/example-v-example-city/complaint.yaml`
- **THEN** `complaint.yaml` records `/records/complaint.pdf` as the document path
- **THEN** the command output reports the created complaint document path

#### Scenario: Omitted case ID becomes invalid after a second case is created

- **WHEN** the user runs `casegraph cases new case-one`
- **AND** `/records/first-complaint.pdf` exists, is readable, and starts with the PDF signature
- **AND** the user runs `casegraph cases add document complaint /records/first-complaint.pdf`
- **AND** the user runs `casegraph cases new case-two`
- **AND** `/records/second-complaint.pdf` exists, is readable, and starts with the PDF signature
- **AND** the user runs `casegraph cases add document complaint /records/second-complaint.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that multiple cases exist
- **THEN** the output tells the user to provide `<case-id>` explicitly
- **THEN** no complaint document is created for `case-two`

#### Scenario: External PDF path is recorded only

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** `/records/complaint.pdf` exists, is readable, and starts with the PDF signature
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf`
- **THEN** the system records `/records/complaint.pdf` in `./workspace/example-v-example-city/complaint.yaml`
- **THEN** the system does not copy the PDF into the case workspace
- **THEN** the system does not parse or hash the PDF contents
- **THEN** the system does not extract facts, references, citations, parties, court, jurisdiction, filing dates, claims, laws, or decisions
- **THEN** the system does not summarize the complaint or create analysis records

### Requirement: Validate Complaint PDF Path

The system SHALL refuse to record a complaint document unless `<path-to-pdf>` exists, is readable as a regular file, and is a PDF file.

#### Scenario: Missing PDF argument is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** `/records/missing.pdf` does not exist
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/missing.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains that the complaint PDF is not readable

#### Scenario: Directory PDF path is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** `/records/complaint.pdf` is a directory
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains that the complaint PDF is not a readable file

#### Scenario: Non-PDF file is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** `/records/complaint.pdf` exists and is readable but does not start with the PDF signature
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains that only PDF files are supported

### Requirement: Restrict Initial Document Scope

The system SHALL support only the `complaint` document type for `casegraph cases add document` until a later specification adds more document types.

#### Scenario: Unsupported document type is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** the user runs `casegraph cases add document example-v-example-city motion /records/motion.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** no document YAML file is created
- **THEN** the output explains that only `complaint` is supported

#### Scenario: Missing document type is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** the user runs `casegraph cases add document example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no document YAML file is created
- **THEN** the output explains the required command shape

### Requirement: Provide Complaint Document Help

The system SHALL include the complaint document command in `casegraph cases --help` and SHALL provide clean help output for complaint document command prefixes.

#### Scenario: Cases help lists complaint document command

- **WHEN** the user runs `casegraph cases --help`
- **THEN** the output lists `add document <case-id> complaint <path-to-pdf>`

#### Scenario: Add command help exits successfully

- **WHEN** the user runs `casegraph cases add --help`
- **THEN** the command exits with a zero status
- **THEN** the output explains `casegraph cases add document <case-id> complaint <path-to-pdf>`

#### Scenario: Add document command help exits successfully

- **WHEN** the user runs `casegraph cases add document --help`
- **THEN** the command exits with a zero status
- **THEN** the output explains `casegraph cases add document <case-id> complaint <path-to-pdf>`

### Requirement: Require Existing Case Workspace

The system SHALL refuse to record a complaint document when `./workspace/<case-id>` does not already exist.

#### Scenario: Missing case workspace is rejected

- **WHEN** `./workspace/missing-case` does not exist
- **AND** the user runs `casegraph cases add document missing-case complaint /records/complaint.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** no case workspace is created
- **THEN** no complaint document record is created
- **THEN** the output explains that the case workspace does not exist

### Requirement: Prevent Complaint Overwrite

The system SHALL refuse to add a complaint document when `./workspace/<case-id>/complaint.yaml` already exists.

#### Scenario: Existing complaint is not overwritten

- **WHEN** `./workspace/example-v-example-city/complaint.yaml` already exists
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/replacement.pdf`
- **THEN** the command exits with a non-zero status
- **THEN** the existing complaint record is unchanged
- **THEN** the output explains that the complaint document already exists

### Requirement: Reject Unexpected Complaint Command Tokens

The system SHALL treat unexpected extra positional tokens for `casegraph cases add document` as hard errors and SHALL NOT silently ignore them.

#### Scenario: Extra token after path is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf extra`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains the required command shape
- **THEN** the system does not proceed using only `/records/complaint.pdf`

#### Scenario: Missing PDF path is rejected

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** the user runs `casegraph cases add document example-v-example-city complaint`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains the required command shape

#### Scenario: Extra token after omitted-case path is rejected

- **WHEN** exactly one valid case exists
- **AND** the user runs `casegraph cases add document complaint /records/complaint.pdf extra`
- **THEN** the command exits with a non-zero status
- **THEN** no complaint document record is created
- **THEN** the output explains the required command shape
- **THEN** the system does not proceed using only `/records/complaint.pdf`

### Requirement: Avoid Unspecified Graph Features

The system SHALL NOT create edge storage, parent fields, remove commands, inferred analysis records, or generic document mutation behavior as part of complaint document recording.

#### Scenario: Complaint record does not create graph edges

- **WHEN** `./workspace/example-v-example-city` exists
- **AND** the user runs `casegraph cases add document example-v-example-city complaint /records/complaint.pdf`
- **THEN** the system creates `./workspace/example-v-example-city/complaint.yaml`
- **THEN** `complaint.yaml` does not contain a `parent` field
- **THEN** the system does not create edge files
- **THEN** the system does not create a remove command or remove marker
- **THEN** the system does not create nodes for extracted facts, legal references, missing documents, related cases, strengths, weaknesses, or hypotheses
