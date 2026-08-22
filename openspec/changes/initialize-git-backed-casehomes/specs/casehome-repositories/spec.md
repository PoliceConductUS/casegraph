## ADDED Requirements

### Requirement: Derive One Exact Primary CaseHome

The system SHALL treat the canonical real `casegraph/` child of a
caller-selected CaseFolder as the only primary CaseHome and SHALL keep the
surrounding CaseFolder outside that repository.

#### Scenario: Nonempty CaseFolder keeps unrelated material outside CaseHome

- **WHEN** a CaseFolder contains unrelated case material and has no
  `casegraph/` child
- **THEN** preparation may create `<case-folder>/casegraph/`
- **THEN** Git initialization affects only that child
- **THEN** the unrelated CaseFolder material remains outside the CaseHome
  repository and unchanged

#### Scenario: Outer Git repository does not become the CaseHome

- **WHEN** the CaseFolder is inside an independently versioned Git repository
- **AND** its exact `casegraph/` child is available
- **THEN** preparation initializes the exact child as a distinct repository
- **THEN** inspection reports the child as the CaseHome Git root

#### Scenario: Symlinked CaseHome child is rejected

- **WHEN** `<case-folder>/casegraph` is a symbolic link
- **THEN** inspection and preparation fail before reading or writing its target
- **THEN** no repository, commit, push, or registration is created

#### Scenario: Conflicting CaseHome child is rejected

- **WHEN** `<case-folder>/casegraph` is a non-directory file, invalid CaseHome,
  nested repository with a different top-level, or linked worktree
- **THEN** inspection identifies the conflict
- **THEN** preparation fails without changing the child or registration

### Requirement: Inspect Repository State Without Mutation

The system SHALL inspect one exact CaseHome without changing files, the Git
index, commits, refs, branches, remotes, upstreams, or machine registration and
SHALL report enough state to distinguish registration eligibility, structural
push readiness, mutation readiness, and safe recovery.

#### Scenario: Existing primary repository is fully reported

- **WHEN** the exact CaseHome is a non-bare primary Git checkout with a valid
  strict Case root
- **THEN** the report identifies the canonical CaseFolder, CaseHome, and
  CaseHome-root paths
- **THEN** the report identifies the Git top-level and common directory
- **THEN** the report identifies the current branch or detached state, unborn or
  committed state, dirty state, and tracked-root state
- **THEN** the report lists every configured remote with its fetch URL and
  effective push URL
- **THEN** the report includes current machine registration and a safe recovery
  inventory

#### Scenario: Read-only inspection preserves repository bytes and refs

- **WHEN** the system inspects an existing CaseHome repository
- **THEN** every CaseHome file byte, index entry, ref, remote, upstream, and
  registration byte remains unchanged

#### Scenario: Inherited or mismatched repository root is rejected

- **WHEN** Git invoked from the CaseHome resolves a top-level other than the real
  CaseHome path
- **THEN** inspection fails with both expected and actual repository roots
- **THEN** the containing repository remains unchanged

#### Scenario: Linked operation worktree is not a primary CaseHome

- **WHEN** the selected CaseHome is a linked worktree whose Git common directory
  belongs to another checkout
- **THEN** inspection reports that relationship
- **THEN** registration and preparation reject it as the primary CaseHome

#### Scenario: Missing Git fails before mutation

- **WHEN** the Git executable required for repository inspection is unavailable
- **THEN** inspection and every repository mutation fail with a diagnostic that
  identifies Git as unavailable
- **THEN** no CaseHome file, repository, commit, push, or registration is created

### Requirement: Validate CaseHome Resources Through The Strict Reader

The system MUST load every existing CaseHome root and rooted member through the
strict Case resource and canonical storage boundaries and MUST NOT call the
legacy `CaseHome` or `CaseLocator` reader.

#### Scenario: Valid strict Case root is accepted

- **WHEN** `<case-folder>/casegraph/root.yaml` is a valid strict `Case` resource
- **AND** every rooted member satisfies canonical global-UID storage
- **THEN** repository inspection accepts the CaseHome resource boundary

#### Scenario: Invalid root fails before repository success

- **WHEN** the exact root is missing, malformed, unknown, schema-invalid,
  non-Case, or has invalid rooted storage
- **THEN** inspection, finalization, and existing-repository registration fail
  with strict resource path context
- **THEN** no successful registration or durability result is returned

#### Scenario: Portable configuration remains reserved

- **WHEN** Issue #42 inspects, prepares, finalizes, or registers a CaseHome
- **THEN** it does not create, validate, modify, or require `config.yaml`
- **THEN** it does not create or modify `casegraph.lock.yaml`

### Requirement: Prepare A Local Uncommitted CaseHome

The system SHALL prepare a missing or empty exact CaseHome, or an explicitly
approved existing non-Git strict CaseHome, using a caller-supplied validated
Case resource and SHALL return an uncommitted recovery report without creating
a remote or machine registration.

#### Scenario: Missing CaseFolder is prepared

- **WHEN** the selected CaseFolder and its `casegraph/` child do not exist
- **AND** the caller supplies a validated strict Case root
- **THEN** preparation creates the CaseFolder and exact CaseHome child
- **THEN** preparation initializes Git only in the CaseHome
- **THEN** preparation writes `root.yaml` through the strict resource writer
- **THEN** preparation reopens the root through the strict CaseHome reader
- **THEN** no commit, remote, push, or registration exists

#### Scenario: Empty CaseHome child is prepared

- **WHEN** the CaseFolder exists and its `casegraph/` child is empty
- **AND** the caller supplies a validated strict Case root
- **THEN** preparation initializes that child and writes the strict root
- **THEN** other CaseFolder contents remain unchanged

#### Scenario: Approved existing non-Git CaseHome is adopted

- **WHEN** the exact `casegraph/` child is not a Git repository
- **AND** its existing root passes the strict rooted CaseHome reader
- **AND** the existing Case resource equals the caller-supplied validated Case
  resource
- **AND** the caller explicitly approves Git initialization
- **THEN** preparation initializes Git in that exact child without overwriting
  the root or deleting existing files
- **THEN** the recovery inventory lists the preserved existing contents

#### Scenario: Existing non-Git CaseHome adoption is declined

- **WHEN** the exact child contains a strict non-Git CaseHome
- **AND** the caller does not explicitly approve Git initialization
- **THEN** preparation fails without changing any file or registration

#### Scenario: Conflicting existing root is not overwritten

- **WHEN** the exact child contains an invalid root or a valid strict Case root
  different from the caller-supplied Case resource
- **THEN** preparation fails before Git initialization
- **THEN** the existing root bytes remain unchanged

### Requirement: Require A Configured Push Target Before First Commit

The system MUST refuse to create the first CaseHome commit until the
caller-selected remote exists and has a nonempty effective push URL. This
structural check MUST NOT be reported as proof that the remote is writable.

#### Scenario: Missing selected remote blocks commit

- **WHEN** a prepared CaseHome has no selected remote
- **THEN** finalization fails before staging or committing
- **THEN** no registration exists

#### Scenario: Selected remote without push URL blocks commit

- **WHEN** the selected remote has no effective push URL
- **THEN** finalization fails before staging or committing
- **THEN** the report identifies the remote configuration defect

#### Scenario: Configured push target is only structurally ready

- **WHEN** a selected remote has an effective push URL
- **THEN** read-only inspection reports structural push-target readiness
- **THEN** the report does not claim authentication, authorization, network
  reachability, or remote writability

### Requirement: Finalize With Immediate Push And Last-Step Registration

The system SHALL create the caller-supplied first commit only after push-target
validation, SHALL immediately push that commit to the selected remote, SHALL
revalidate the strict CaseHome and Git state after push, and SHALL write machine
registration last.

#### Scenario: New CaseHome is committed pushed and registered

- **WHEN** a prepared unborn CaseHome has a selected configured writable remote
- **AND** the caller supplies the first commit message and validated canonical
  case ID
- **THEN** finalization stages the CaseHome contents and creates the first commit
- **THEN** finalization immediately pushes `HEAD` to the selected remote with
  upstream tracking
- **THEN** finalization reopens the strict CaseHome and reinspects Git
- **THEN** finalization atomically registers the canonical real root path last
- **THEN** the result reports the local commit, pushed remote, and registration

#### Scenario: Push failure preserves visible incomplete local commit

- **WHEN** the first local commit succeeds and the immediate push fails
- **THEN** finalization returns failure and identifies the local commit, branch
  or detached state, selected remote, and push diagnostic
- **THEN** machine registration is absent
- **THEN** the local commit and CaseHome files remain available for recovery
- **THEN** the system does not claim deletion, rollback, or durable success

#### Scenario: Post-push validation failure prevents registration

- **WHEN** the first push succeeds but strict CaseHome or Git revalidation fails
- **THEN** finalization returns failure and identifies the pushed commit and
  validation diagnostic
- **THEN** machine registration is absent
- **THEN** the pushed and local commits remain available for recovery

#### Scenario: Registration failure preserves pushed state

- **WHEN** commit, push, and post-push validation succeed
- **AND** atomic registration fails
- **THEN** finalization returns failure with the pushed commit and registration
  diagnostic
- **THEN** no partial registration is published
- **THEN** the repository and pushed commit remain unchanged

### Requirement: Register Only Committed Existing Primary CaseHomes

The system SHALL allow an existing exact primary repository to register while
dirty or without a remote only when it has a commit and its valid strict
`root.yaml` is tracked in `HEAD`.

#### Scenario: Dirty remote-less committed repository may register

- **WHEN** the exact primary CaseHome has a commit
- **AND** its valid strict root is tracked in `HEAD`
- **AND** the repository is dirty and has no remote
- **THEN** existing-repository registration may succeed
- **THEN** the report marks registration eligibility true
- **THEN** the report marks mutation readiness false and identifies dirty state
  and missing structural push target

#### Scenario: Unborn repository cannot register

- **WHEN** an existing CaseHome repository has no commit
- **THEN** existing-repository registration fails
- **THEN** no machine registration is written

#### Scenario: Untracked root cannot register

- **WHEN** an existing committed CaseHome has a valid root that is not tracked
  in `HEAD`
- **THEN** existing-repository registration fails even if the root is staged or
  present in the working tree
- **THEN** no machine registration is written

### Requirement: Store Machine Registration Atomically

The system SHALL store one strict YAML mapping at
`<config-home>/casehomes.yaml` from a caller-validated canonical case ID to the
canonical real absolute path ending in `/casegraph/root.yaml`, SHALL publish a
complete changed mapping atomically, and MUST NOT add aliases or defaults.

#### Scenario: New registration stores canonical root path

- **WHEN** an eligible CaseHome is registered for canonical case ID
  `PoliceConductUS/example-case`
- **THEN** `casehomes.yaml` maps that exact ID to the canonical real absolute
  CaseHome-root path
- **THEN** the stored value ends in `/casegraph/root.yaml`
- **THEN** no CaseFolder path, CaseHome directory path, alias, or default is
  stored

#### Scenario: Identical registration is a no-op

- **WHEN** the canonical case ID already maps to the same canonical real root
  path
- **THEN** registration succeeds without rewriting `casehomes.yaml`

#### Scenario: Conflicting registration is rejected atomically

- **WHEN** the canonical case ID already maps to a different root path
- **THEN** registration fails with both existing and requested paths
- **THEN** the existing `casehomes.yaml` bytes remain unchanged

#### Scenario: Invalid registration document is rejected

- **WHEN** `casehomes.yaml` is malformed, has a non-mapping root, duplicate
  keys, non-string keys or values, or a stored path that is missing,
  non-absolute, non-real, or does not end in `/casegraph/root.yaml`
- **THEN** registration and registration inspection fail with the configuration
  path and validation context
- **THEN** no partial replacement is published

### Requirement: Preserve Explicit Recovery State

The system MUST preserve and report filesystem and Git state after every failed
mutation and MUST NOT delete or silently compensate for a CaseHome directory,
resource, repository, commit, ref, remote, pushed commit, or registration.

#### Scenario: Preparation failure reports existing state

- **WHEN** preparation fails after creating any local path or initializing Git
- **THEN** the failure report inventories each created or preserved path and the
  current Git state
- **THEN** it identifies the failed step and a safe next action

#### Scenario: Finalization failure reports durable boundaries

- **WHEN** finalization fails before push, during push, after push, or during
  registration
- **THEN** the report distinguishes uncommitted, locally committed, pushed, and
  registered state
- **THEN** it does not report a later state as successful

### Requirement: Keep Provider And Workflow Policy Outside The Foundation

The system MUST expose Issue #42 behavior only as importable internal
boundaries and MUST NOT add provider, public command, worktree, configuration,
or migration behavior.

#### Scenario: Issue 45 composes the foundation

- **WHEN** a later GitHub init or clone command needs repository inspection,
  preparation, finalization, or registration
- **THEN** it invokes the Issue #42 boundaries
- **THEN** Issue #42 does not authenticate providers, create hosted
  repositories, configure origins, select remotes, or prompt users

#### Scenario: No adjacent architecture is added

- **WHEN** Issue #42 is implemented
- **THEN** it adds no `config.yaml`, aliases, defaults, operation worktrees,
  hosting, infrastructure, migration, or legacy compatibility path
