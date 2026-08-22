# case-resources Specification

## Purpose

TBD - created by archiving change enforce-strict-resource-envelopes. Update Purpose after archive.

## Requirements

### Requirement: Select One Strict Kind-Specific Resource Contract

The system SHALL select exactly one registered CaseGraph resource definition
from the literal `apiVersion` and `kind` fields and SHALL validate the complete
resource through that definition's strict reader/writer pair. The initial API
version MUST be `casegraph.policeconduct.org/v1alpha1`, and the system MUST NOT
use a generic catch-all resource schema.

#### Scenario: Case resource with membership is accepted

- **WHEN** a resource contains API version
  `casegraph.policeconduct.org/v1alpha1`, kind `Case`, one valid
  `metadata.uid`, and a `spec.resources` array of valid resource UIDs
- **THEN** the registered `Case` resource definition accepts the resource
- **THEN** the resulting resource contains only `apiVersion`, `kind`,
  `metadata`, and `spec`

#### Scenario: Schema-declared status is accepted

- **WHEN** a registered resource definition explicitly declares a strict
  `status` schema
- **AND** a resource satisfies that definition's root, metadata, spec, and
  status schemas
- **THEN** the selected definition accepts `status`

#### Scenario: Status is rejected when the selected kind does not declare it

- **WHEN** a `Case` resource includes `status`
- **THEN** validation fails because the `Case` definition does not declare
  `status`

#### Scenario: Unknown API version is rejected

- **WHEN** a resource uses an API version other than
  `casegraph.policeconduct.org/v1alpha1`
- **THEN** resource selection fails with an error identifying the unknown API
  version and resource path

#### Scenario: Unknown kind is rejected

- **WHEN** a resource uses the initial API version and an unregistered kind
- **THEN** resource selection fails with an error identifying the unknown kind
  and resource path

### Requirement: Reject Unknown And Misplaced Resource Fields

The selected resource definition MUST reject unknown root fields, unknown
metadata fields, unknown spec fields, unknown status fields, and recognized
fields placed in the wrong envelope section.

#### Scenario: Unknown root field is rejected

- **WHEN** an otherwise valid resource contains a root field other than
  `apiVersion`, `kind`, `metadata`, `spec`, or schema-declared `status`
- **THEN** strict validation fails

#### Scenario: Unknown metadata field is rejected

- **WHEN** an otherwise valid `Case` resource contains a metadata field other
  than `uid`
- **THEN** strict validation fails

#### Scenario: Unknown Case spec field is rejected

- **WHEN** an otherwise valid `Case` resource contains a spec field other than
  `resources`
- **THEN** strict validation fails

#### Scenario: Unknown status field is rejected

- **WHEN** a resource kind declares `status` and the resource contains a status
  field not declared by that kind
- **THEN** strict validation fails

#### Scenario: Recognized field in wrong section is rejected

- **WHEN** a valid resource UID is placed at the resource root instead of at
  `metadata.uid`
- **THEN** strict validation fails

### Requirement: Use One Global Resource UID Namespace

The system MUST validate every `metadata.uid` as a CUID2, MUST use the same UID
type for nodes and legal-effect edges, and MUST reject duplicate UIDs without
creating kind-specific namespaces.

#### Scenario: Valid resource UID is accepted

- **WHEN** `metadata.uid` is the valid CUID2
  `tz4a98xxat96iws9zmbrgj3a`
- **THEN** resource UID validation succeeds

#### Scenario: Invalid resource UID is rejected

- **WHEN** `metadata.uid` is missing, empty, or not a valid CUID2
- **THEN** resource validation fails

#### Scenario: Duplicate resource UID is rejected across kinds

- **WHEN** two validated resources of the same or different kinds use the same
  `metadata.uid`
- **THEN** uniqueness validation fails and identifies the duplicate UID

### Requirement: Represent Resource References With Only The Resource UID

The system SHALL parse a resource reference through the same global UID
contract as `metadata.uid` and SHALL NOT require a case ID, node/edge
discriminator, resource kind, or filesystem path.

#### Scenario: UID-only reference is accepted

- **WHEN** a resource reference is the valid CUID2 string
  `tz4a98xxat96iws9zmbrgj3a`
- **THEN** reference validation succeeds without any other identity field

#### Scenario: Composite or path reference is rejected

- **WHEN** a resource reference is an object containing a case ID, kind, or
  filesystem path instead of one CUID2 string
- **THEN** reference validation fails

### Requirement: Create Deterministic Round-Trippable Resource YAML

Each registered writer SHALL validate its resource before creating the target,
SHALL produce deterministic YAML, and SHALL produce a document that the same
registered reader accepts without information loss. The writer MUST NOT
overwrite an existing resource.

#### Scenario: Valid Case resource round-trips

- **WHEN** the `Case` writer receives a valid foundation-layer `Case` resource
  and an available target path
- **THEN** it creates deterministic YAML at that path
- **THEN** the `Case` reader returns the same validated resource

#### Scenario: Repeated serialization is byte-identical

- **WHEN** the same valid resource value is serialized more than once
- **THEN** every serialization result is byte-identical

#### Scenario: Invalid resource does not create a file

- **WHEN** a writer receives a resource that fails the selected kind schema
- **THEN** writing fails before the target file is created

#### Scenario: Existing resource is not overwritten

- **WHEN** a resource file already exists at the requested target path
- **AND** a writer is asked to write a resource with the same or a different UID
- **THEN** writing fails and the existing bytes remain unchanged

#### Scenario: Malformed YAML is rejected at the reader boundary

- **WHEN** a reader receives malformed YAML
- **THEN** reading fails with an error identifying the resource path

### Requirement: Declare Resource Storage Semantics By Kind

Every registered resource kind MUST declare whether it is a node or a
legal-effect edge and MUST expose resource references and owned paths only
through typed selectors applied to that kind's validated resource. A resource
UID or reference MUST NOT encode the category.

#### Scenario: Case declares root membership references

- **WHEN** a validated `Case` contains UIDs in `spec.resources`
- **THEN** the Case kind's typed reference selector returns those UIDs in order
- **THEN** the Case kind is classified as a node

#### Scenario: Legal-effect edge uses the same UID boundary

- **WHEN** a registered legal-effect-edge fixture kind contains validated
  endpoint UID properties
- **THEN** its typed reference selector returns the endpoint UIDs
- **THEN** its `metadata.uid` and endpoint references use the same global UID
  type as node resources

#### Scenario: Undeclared fields do not become storage references

- **WHEN** a validated kind does not declare a resource-reference or owned-path
  selector for a value
- **THEN** the storage boundary does not discover that value as membership or
  owned content
