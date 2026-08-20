## ADDED Requirements

### Requirement: Resolve Single Existing Case

The system SHALL resolve an omitted `<case-id>` only for commands that explicitly specify an omitted-case form, and only when exactly one valid case exists.

#### Scenario: Valid case is discovered from root node

- **WHEN** `./workspace/example-v-example-city/root.yaml` exists
- **AND** `root.yaml` contains `type: node`
- **AND** `root.yaml` contains `kind: case`
- **AND** `root.yaml` contains `id: root`
- **THEN** the system treats `example-v-example-city` as a valid existing case for omitted-case resolution

#### Scenario: Stray workspace directory is not a valid case

- **WHEN** `./workspace/stray-folder` exists
- **AND** `./workspace/stray-folder/root.yaml` does not exist
- **THEN** the system does not treat `stray-folder` as a valid existing case for omitted-case resolution

#### Scenario: Invalid root node is not a valid case

- **WHEN** `./workspace/not-a-case/root.yaml` exists
- **AND** `root.yaml` does not contain `type: node`, `kind: case`, and `id: root`
- **THEN** the system does not treat `not-a-case` as a valid existing case for omitted-case resolution

#### Scenario: No valid case cannot be inferred

- **WHEN** no valid case exists
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that no case exists
- **THEN** the output tells the user to create one with `casegraph cases new <case-id>`

#### Scenario: Multiple valid cases cannot be inferred

- **WHEN** valid cases `case-one` and `case-two` exist
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the command exits with a non-zero status
- **THEN** the output explains that multiple cases exist
- **THEN** the output lists `case-one` and `case-two`
- **THEN** the output tells the user to provide `<case-id>` explicitly

#### Scenario: No persistent default case is created

- **WHEN** exactly one valid case exists
- **AND** the user runs a command form that omits `<case-id>`
- **THEN** the system does not create a default-case pointer, current-case file, case manifest, or other durable case selection record
