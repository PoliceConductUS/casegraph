## MODIFIED Requirements

### Requirement: Discover Exact Rooted Membership

The system SHALL discover CaseHome membership from the Case root's typed
resource references and the typed references of each reachable validated
resource. It MUST follow each UID at most once, MUST support cycles, and MUST
NOT recursively scan directories for members. The returned
`CaseHomeResourceSnapshot` SHALL expose an immutable
`documentPaths: readonly string[]` containing the canonical authoritative root
and reachable member resource document paths exactly once, sorted
lexicographically. The array order is for presentation and recovery only and
MUST NOT preserve or reference typed-selector discovery order or traversal
order. Lexical canonical-path presentation MAY visibly sort UID-derived path
segments, but that visible order carries no semantic membership priority. The
paths MUST be populated from already-opened rooted members without an additional
document read, path inspection, or directory scan.

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

#### Scenario: Snapshot lists every authoritative rooted document once

- **WHEN** the Case root reaches direct and transitive member resources
- **THEN** `documentPaths` contains the authoritative Case root document and
  every reachable member resource document exactly once

#### Scenario: Cycles and repeated references do not duplicate document paths

- **WHEN** rooted membership contains a cycle or repeated reference
- **THEN** each authoritative root or member document path appears once in
  `documentPaths`

#### Scenario: Unreferenced resources contribute no document path

- **WHEN** a canonical-looking resource document exists but no rooted reference
  reaches it
- **THEN** that unreferenced document contributes zero entries to
  `documentPaths`
- **THEN** populating `documentPaths` does not read, inspect, or scan for it

#### Scenario: Document paths add no resource inspection

- **WHEN** one `openCaseHomeResources` call opens the Case root and reachable
  rooted members
- **THEN** each canonical rooted document has exactly one raw document read and
  exactly one resource inspection during that open
- **THEN** an unreferenced canonical-looking document has zero raw document
  reads and zero resource inspections
- **THEN** exposing or reading `documentPaths` adds zero `realpath`, `lstat`, or
  `readFile` calls beyond the already-required per-path open baseline, zero
  resource inspections, and zero directory scans

#### Scenario: Document paths are immutable and lexicographically sorted

- **WHEN** rooted resources are opened in an order different from lexical path
  order
- **THEN** `documentPaths` is a frozen readonly array sorted lexicographically
- **THEN** lexical sorting may visibly order UID-derived path segments but does
  not assign semantic membership priority
- **THEN** `documentPaths` does not preserve or reference typed-selector
  discovery order or traversal order

#### Scenario: Document paths preserve exact canonical containment

- **WHEN** opening returns a CaseHome resource snapshot
- **THEN** every `documentPaths` entry is the canonical absolute authoritative
  `<real-casehome>/root.yaml` or
  `<real-casehome>/<resource-uid>/root.yaml` location for an opened member
- **THEN** every entry remains inside the real CaseHome after resolving every
  existing symlink segment
