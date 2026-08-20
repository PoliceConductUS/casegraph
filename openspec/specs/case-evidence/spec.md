# case-evidence Specification

## Purpose

CaseGraph records external evidence files as auditable graph nodes in existing case workspaces without copying, parsing, summarizing, classifying, transcribing, or linking the evidence to facts.

## Requirements

### Requirement: Add Evidence Record

The system SHALL provide `casegraph cases add evidence <case-id> <path-to-file>` to record an external evidence file as a graph node in an existing case workspace.

#### Scenario: Evidence record is created

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/bwc-officer-example.mp4`
- **THEN** the system creates one new YAML file under `./workspace/example-v-example-city/`
- **THEN** the file name stem is the SHA-256 hex digest of the evidence file content
- **THEN** the YAML contains `type: node`
- **THEN** the YAML contains `kind: evidence`
- **THEN** the YAML contains an `id` matching the file name stem
- **THEN** the YAML records `/records/bwc-officer-example.mp4` as the evidence path
- **THEN** the YAML records SHA-256 hash metadata
- **THEN** the YAML contains matching `created_at` and `updated_at` ISO timestamps
- **THEN** the YAML contains source provenance pointing to the evidence add mutation
- **THEN** the YAML does not contain null values
- **THEN** the system writes a mutation manifest under `.history/`
- **THEN** the system records the evidence add command, evidence path, hash metadata, and created evidence node ID in history
- **THEN** the command output reports the created evidence node path
- **THEN** the command output reports the created evidence node ID
- **THEN** the command output tells the user to run `casegraph cases report example-v-example-city`

#### Scenario: Registered evidence is reported as unlinked until referenced

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/bwc-officer-example.mp4`
- **AND** no graph record reachable from `root` references the created evidence node ID through a recognized node-reference property
- **WHEN** the user runs `casegraph cases report example-v-example-city`
- **THEN** the report includes `Evidence records: 1`
- **THEN** the report includes `Unlinked records: 1`
- **THEN** the report does not claim the evidence supports any fact, claim, or legal conclusion

### Requirement: Model Graph Record References

The system SHALL define typed graph record schemas for current `type: node` / `kind` combinations and SHALL use schema-declared node-reference properties when traversing graph records.

#### Scenario: Report traverses recognized node-reference properties

- **WHEN** a case workspace contains valid graph node YAML files for `case`, `docket`, `party`, `attorney`, `docket_entry`, `document`, and `evidence`
- **AND** a node is reachable from `root` through a recognized node-reference property
- **AND** the user runs `casegraph cases report example-v-example-city`
- **THEN** the reachable node is not counted as an unlinked record
- **THEN** the report counts a valid node as unlinked when it is present in the workspace but not reachable from `root`

#### Scenario: Evidence path is recorded only

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/bwc-officer-example.mp4`
- **THEN** the system records `/records/bwc-officer-example.mp4` in the evidence node
- **THEN** the system does not copy the evidence file into the case workspace
- **THEN** the system hashes the file content only for evidence identity
- **THEN** the system does not parse, summarize, classify, transcribe, or inspect the file type
- **THEN** the system does not extract facts, link evidence to facts, create claims, create authorities, create analysis records, or create graph edges

#### Scenario: Duplicate evidence content is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** `/other-records/copy-of-bwc-officer-example.mp4` exists, is readable, is a regular file, and has the same SHA-256 content hash
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/bwc-officer-example.mp4`
- **WHEN** the user runs `casegraph cases add evidence example-v-example-city /other-records/copy-of-bwc-officer-example.mp4`
- **THEN** the second command exits with a non-zero status
- **THEN** no second evidence node is created
- **THEN** the output explains that the evidence already exists

### Requirement: Resolve Omitted Case For Evidence

The system SHALL provide `casegraph cases add evidence <path-to-file>` only when exactly one valid case exists and SHALL NOT create persistent default case state.

#### Scenario: Evidence is added to the single valid case

- **WHEN** exactly one valid case workspace exists at `./workspace/example-v-example-city`
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence /records/bwc-officer-example.mp4`
- **THEN** the command exits with a zero status
- **THEN** the system creates one evidence node under `./workspace/example-v-example-city/`
- **THEN** the system does not create a default-case pointer, current-case file, case manifest, or other durable case selection record

#### Scenario: Evidence cannot infer from zero cases

- **WHEN** no valid case workspace exists
- **AND** the user runs `casegraph cases add evidence /records/bwc-officer-example.mp4`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new <case-id>`

#### Scenario: Evidence cannot infer from multiple cases

- **WHEN** multiple valid case workspaces exist
- **AND** the user runs `casegraph cases add evidence /records/bwc-officer-example.mp4`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains that multiple cases exist
- **THEN** the output lists the available case IDs
- **THEN** the output tells the user to provide `<case-id>` explicitly

### Requirement: Validate Evidence File Path

The system SHALL refuse to record evidence unless `<path-to-file>` exists, is readable, and is a regular file.

#### Scenario: Missing evidence path is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/missing.mp4` does not exist
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/missing.mp4`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains that the evidence file is not readable

#### Scenario: Directory evidence path is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/evidence-folder` is a directory
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/evidence-folder`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains that the evidence path is not a readable file

#### Scenario: Non-PDF evidence file is accepted

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/notes.txt` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/notes.txt`
- **THEN** the command exits with a zero status
- **THEN** the system creates one evidence node
- **THEN** the system does not reject the file because it is not a PDF

### Requirement: Validate Evidence Command Shape

The system MUST reject invalid `casegraph cases add evidence` command shapes without recording partial success.

#### Scenario: Missing evidence path is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** the user runs `casegraph cases add evidence example-v-example-city`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains the required command shape

#### Scenario: Extra evidence token is rejected

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists as a valid case root
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence example-v-example-city /records/bwc-officer-example.mp4 extra`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains the required command shape
- **THEN** the system does not silently ignore the extra token

#### Scenario: Missing case workspace is rejected

- **WHEN** `./workspace/missing-case` does not exist
- **AND** `/records/bwc-officer-example.mp4` exists, is readable, and is a regular file
- **AND** the user runs `casegraph cases add evidence missing-case /records/bwc-officer-example.mp4`
- **THEN** the command exits with a non-zero status
- **THEN** no evidence node is created
- **THEN** the output explains that the case workspace does not exist

### Requirement: Provide Evidence Add Help

The system SHALL include the evidence add command in `casegraph cases --help` and `casegraph cases add --help`.

#### Scenario: Cases help lists evidence add command

- **WHEN** the user runs `casegraph cases --help`
- **THEN** the output lists `add evidence <case-id> <path-to-file>`

#### Scenario: Add help lists evidence add command

- **WHEN** the user runs `casegraph cases add --help`
- **THEN** the command exits with a zero status
- **THEN** the output lists `casegraph cases add evidence <case-id> <path-to-file>`
