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

#### Scenario: Escaping owned path is rejected

- **WHEN** a typed owned-path property is absolute, contains a `..` segment,
  lies outside `files/` and `audits/`, or resolves outside the resource folder
- **THEN** opening the CaseHome fails without returning a partial snapshot

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

#### Scenario: Root UID duplicated as non-root membership is rejected

- **WHEN** `Case.spec.resources` contains the Case root's own `metadata.uid`
- **THEN** opening fails because one UID cannot identify both the Case root and
  a non-root resource folder

#### Scenario: Composite or path identity is not accepted

- **WHEN** a caller attempts to resolve a resource using a kind, node/edge
  discriminator, case-scoped composite ID, or filesystem path
- **THEN** the resolution boundary rejects the value because it accepts only a
  global resource UID
