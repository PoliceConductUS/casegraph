## MODIFIED Requirements

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
