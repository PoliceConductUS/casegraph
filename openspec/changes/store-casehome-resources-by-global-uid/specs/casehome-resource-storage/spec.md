## ADDED Requirements

### Requirement: Use Canonical CaseHome Resource Locations

The system SHALL read the CaseHome root resource only from
`<casehome>/root.yaml` and SHALL read each non-root resource only from
`<casehome>/<resource-uid>/root.yaml`. The non-root folder name MUST equal the
validated resource's `metadata.uid`, and the system MUST NOT create or depend on
`nodes/`, `edges/`, or kind-specific storage trees.

#### Scenario: Root and non-root resources use canonical locations

- **WHEN** a Case root references one resource UID
- **AND** that resource's valid envelope is stored at
  `<casehome>/<resource-uid>/root.yaml`
- **THEN** opening the CaseHome returns both the root and non-root resource as
  members

#### Scenario: Missing CaseHome root is rejected

- **WHEN** `<casehome>/root.yaml` does not exist
- **THEN** opening fails with an error identifying the required root path

#### Scenario: Invalid CaseHome root is rejected

- **WHEN** `<casehome>/root.yaml` is malformed or fails its selected strict
  schema
- **THEN** opening fails with validation context for the CaseHome root path

#### Scenario: Non-Case root kind is rejected

- **WHEN** `<casehome>/root.yaml` is a valid registered resource whose kind is
  not `Case`
- **THEN** opening fails because only a Case resource can establish CaseHome
  membership

#### Scenario: Folder and resource UID mismatch is rejected

- **WHEN** the Case root references UID A
- **AND** `<casehome>/<UID-A>/root.yaml` validates with `metadata.uid` UID B
- **THEN** opening fails with an error identifying the expected and actual UIDs

### Requirement: Discover Exact Rooted Membership

The system SHALL discover CaseHome membership from the Case root's typed
resource references and the typed references of each reachable validated
resource. It MUST follow each UID at most once, MUST support cycles, and MUST
NOT recursively scan directories for members.

#### Scenario: Transitive typed references become members

- **WHEN** the Case root references resource A
- **AND** validated resource A has a schema-declared reference to resource B
- **THEN** the opened membership contains the Case root, A, and B

#### Scenario: Cyclic references terminate by UID

- **WHEN** reachable resource A references B and reachable resource B references
  A
- **THEN** opening succeeds without reading either resource more than once
- **THEN** membership contains A and B exactly once

#### Scenario: References to the Case root are cycles

- **WHEN** the Case root directly references its own UID or a reachable
  non-root resource references the Case root UID
- **THEN** opening treats the reference as an already resolved member
- **THEN** the Case root appears in membership exactly once

#### Scenario: Repeated references identify one resource

- **WHEN** two rooted typed properties reference the same non-root UID
- **THEN** opening reads and records that canonical resource once
- **THEN** the repeated reference is not treated as a duplicate UID

#### Scenario: Unreferenced directory is not a member

- **WHEN** a valid UID resource folder exists inside the CaseHome but no rooted
  typed reference reaches its UID
- **THEN** the opened membership excludes that resource
- **THEN** resolving that UID through the opened CaseHome fails

### Requirement: Resolve Nodes And Legal-Effect Edges Through One Boundary

The system SHALL resolve every member by global resource UID without requiring
its kind or category in advance. After strict envelope validation, the selected
kind definition MUST determine whether the result is a node or a legal-effect
edge.

#### Scenario: Node resolves by UID

- **WHEN** a rooted member UID identifies a registered node kind
- **THEN** the common resolution boundary returns the validated resource and
  classifies it as a node

#### Scenario: Legal-effect edge resolves by UID

- **WHEN** a rooted member UID identifies a registered legal-effect-edge kind
- **THEN** the same resolution boundary returns the validated resource and
  classifies it as a legal-effect edge

### Requirement: Discover Only Typed Resource-Owned Paths

The system SHALL discover resource-owned paths only from a concrete kind's
typed owned-path selector. Every owned path MUST be a non-empty relative path
under the owning resource's `files/` or `audits/` directory and MUST remain
inside that resource folder after path resolution.

#### Scenario: Typed files and audits paths are accepted

- **WHEN** a reachable validated kind declares `files/source.pdf` and
  `audits/review.yaml` through typed spec properties
- **THEN** the opened resource reports their normalized paths inside its
  canonical resource folder

#### Scenario: Undeclared file is not discovered

- **WHEN** an extra file exists in a reachable resource folder but no typed
  owned-path property references it
- **THEN** the opened resource does not report that file as owned content

#### Scenario: Lexically escaping or bare owned path is rejected

- **WHEN** a typed owned-path property is absolute, contains a `..` segment,
  equals bare `files` or `audits`, or lies outside those directories
- **THEN** opening the CaseHome fails without returning a partial snapshot

#### Scenario: Existing symlink escape is rejected

- **WHEN** any existing segment of a typed owned path is a symlink that resolves
  outside the canonical resource folder
- **THEN** opening the CaseHome fails without returning a partial snapshot

#### Scenario: Missing owned file is storage-valid

- **WHEN** a typed owned path is lexically contained and all existing ancestor
  segments remain inside the resource folder but the final file does not exist
- **THEN** the storage boundary accepts the path
- **THEN** the concrete resource kind remains responsible for requiring file
  existence when needed

### Requirement: Reject Invalid Or Ambiguous Resource Storage

The system MUST fail opening without returning a partial snapshot when a rooted
resource is missing, has an invalid envelope, duplicates the Case root UID, or
cannot be resolved through its canonical UID folder.

#### Scenario: Missing rooted resource is rejected

- **WHEN** a typed reference names a UID whose canonical `root.yaml` is missing
- **THEN** opening fails with an error identifying the UID and expected path

#### Scenario: Invalid rooted envelope is rejected

- **WHEN** a referenced canonical `root.yaml` is malformed, uses an unknown
  kind, or fails its selected strict schema
- **THEN** opening fails with the resource path and validation context

#### Scenario: Second authoritative root-UID document is rejected

- **WHEN** `<casehome>/root.yaml` has UID A
- **AND** `<casehome>/<UID-A>/root.yaml` also claims UID A
- **THEN** opening fails because two authoritative documents claim one global
  resource UID

#### Scenario: Composite or path identity is not accepted

- **WHEN** a caller attempts to resolve a resource using a kind, node/edge
  discriminator, case-scoped composite ID, or filesystem path
- **THEN** the resolution boundary rejects the value because it accepts only a
  global resource UID
