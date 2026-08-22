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
- **THEN** inspection reports the inherited repository root as non-primary
- **THEN** preparation initializes the exact child as a distinct repository
- **THEN** every pre-existing outer-owned file byte, index entry, ref, branch,
  remote, and upstream remains unchanged
- **THEN** every pre-existing outer repository status entry remains unchanged
- **THEN** the only permitted outer status delta, if Git reports one, is Git's
  natural representation of the nested CaseHome child
- **THEN** preparation does not require a new status entry when outer ignore
  rules suppress the child or adoption starts with child content already
  represented in outer status
- **THEN** post-preparation inspection reports the child as the CaseHome Git root

#### Scenario: Symlinked CaseHome child is rejected

- **WHEN** `<case-folder>/casegraph` is a symbolic link
- **THEN** inspection and preparation fail before reading or writing its target
- **THEN** no repository, commit, push, or registration is created

#### Scenario: Conflicting CaseHome child is rejected

- **WHEN** `<case-folder>/casegraph` is a non-directory file, invalid CaseHome,
  or existing repository with a different top-level
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

#### Scenario: Inherited repository root is non-primary

- **WHEN** Git invoked from the CaseHome resolves a top-level other than the real
  CaseHome path
- **AND** the exact child has no repository metadata of its own
- **THEN** inspection reports both expected and inherited repository roots
- **THEN** inspection classifies the child as available or adoptable rather than
  as a primary CaseHome
- **THEN** the containing repository remains unchanged

#### Scenario: Gitfile checkout is not a primary CaseHome

- **WHEN** the selected CaseHome uses a `.git` file rather than its own `.git`
  directory because it is a linked worktree, separate-git-dir checkout, or
  submodule
- **THEN** inspection reports the gitfile, resolved Git directory, and common
  directory
- **THEN** inspection, registration, and preparation reject it as the primary
  CaseHome

#### Scenario: Missing Git fails before mutation

- **WHEN** the Git executable required for repository inspection is unavailable
- **THEN** inspection and every repository mutation fail with a diagnostic that
  identifies Git as unavailable
- **THEN** no CaseHome file, repository, commit, push, or registration is created

### Requirement: Validate CaseHome Resources Through The Strict Reader

The new Issue #42 repository boundaries MUST load an existing CaseHome's root
and rooted members through the strict Case resource and canonical storage
boundaries whenever they inspect it, and they MUST NOT call the legacy
`CaseHome` or `CaseLocator` reader. This requirement SHALL NOT change the durable
behavior of legacy commands before Issue #45 replaces their public entry points.

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

#### Scenario: Existing malformed portable configuration is preserved

- **WHEN** an otherwise eligible CaseHome contains malformed `config.yaml`
- **THEN** Issue #42 inspection and preparation ignore its contents
- **THEN** its bytes remain unchanged

#### Scenario: Existing lock is preserved

- **WHEN** an otherwise eligible CaseHome contains `casegraph.lock.yaml`
- **THEN** Issue #42 inspection and preparation do not read or modify it
- **THEN** its bytes remain unchanged

#### Scenario: New preparation does not create portable configuration

- **WHEN** preparation creates a new CaseHome
- **THEN** neither `config.yaml` nor `casegraph.lock.yaml` exists afterward

### Requirement: Prepare A Local Uncommitted CaseHome

The system SHALL prepare a missing or empty exact CaseHome using a
caller-supplied validated Case resource with empty `spec.resources`, or SHALL
preserve and adopt an explicitly approved existing non-Git strict CaseHome with
its complete rooted graph. It SHALL return an uncommitted recovery report
without creating a remote or machine registration.

#### Scenario: Missing CaseFolder is prepared

- **WHEN** the selected CaseFolder and its `casegraph/` child do not exist
- **AND** the caller supplies a validated strict Case root whose
  `spec.resources` is empty
- **THEN** preparation creates the CaseFolder and exact CaseHome child
- **THEN** preparation initializes Git only in the CaseHome
- **THEN** preparation writes `root.yaml` through the strict resource writer
- **THEN** preparation reopens the root through the strict CaseHome reader
- **THEN** no commit, remote, push, or registration exists
- **THEN** neither `config.yaml` nor `casegraph.lock.yaml` is created

#### Scenario: Empty CaseHome child is prepared

- **WHEN** the CaseFolder exists and its `casegraph/` child is empty
- **AND** the caller supplies a validated strict Case root whose
  `spec.resources` is empty
- **THEN** preparation initializes that child and writes the strict root
- **THEN** other CaseFolder contents remain unchanged

#### Scenario: Approved existing non-Git CaseHome is adopted

- **WHEN** the exact `casegraph/` child is not a Git repository
- **AND** its existing root and complete rooted membership pass the strict
  CaseHome reader
- **AND** the caller explicitly approves Git initialization
- **THEN** preparation initializes Git in that exact child without overwriting
  any rooted resource or deleting existing files
- **THEN** the recovery inventory lists the complete preserved rooted graph and
  other existing contents

#### Scenario: Existing non-Git CaseHome adoption is declined

- **WHEN** the exact child contains a strict non-Git CaseHome
- **AND** the caller does not explicitly approve Git initialization
- **THEN** preparation fails without changing any file or registration

#### Scenario: Nonempty membership for new preparation is rejected

- **WHEN** a missing or empty CaseHome is requested with a caller-supplied Case
  resource whose `spec.resources` is nonempty
- **THEN** preparation fails before creating the CaseFolder, CaseHome, Git
  repository, root, or registration

#### Scenario: Invalid existing root is not adopted

- **WHEN** the exact child contains an invalid root or invalid rooted membership
- **THEN** preparation fails before Git initialization
- **THEN** every existing byte remains unchanged

#### Scenario: Git is probed before preparation creates paths

- **WHEN** the Git executable is unavailable
- **AND** the selected CaseFolder and CaseHome do not exist
- **THEN** preparation fails before creating either path
- **THEN** no root, repository, or registration exists

#### Scenario: Preparation mutation failures preserve exact state

- **WHEN** Git initialization, strict root writing, or post-initialization strict
  reopening fails
- **THEN** preparation reports the exact failed step and inventories every path,
  root byte, and Git state that actually exists
- **THEN** it does not report any later preparation step as successful
- **THEN** no commit, push, or registration exists

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
complete changed mapping atomically, SHALL serialize every mutation's
read-validate-write-publish transaction with the exclusive sibling guard
`<config-home>/casehomes.yaml.lock`, and MUST NOT add aliases, defaults, retries,
or fallback publication.

#### Scenario: New registration stores canonical root path

- **WHEN** an eligible CaseHome is registered for canonical case ID
  `PoliceConductUS/example-case`
- **THEN** `casehomes.yaml` maps that exact ID to the canonical real absolute
  CaseHome-root path
- **THEN** the stored value ends in `/casegraph/root.yaml`
- **THEN** the canonical root target is a regular file
- **THEN** a newly created `casehomes.yaml` has permission mode `0600`
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

#### Scenario: Second canonical ID for one root is rejected atomically

- **WHEN** one canonical real CaseHome-root path is already mapped from a
  canonical case ID
- **AND** registration requests the same root path for a different canonical
  case ID
- **THEN** registration fails with the existing and requested case IDs and root
  path
- **THEN** the existing `casehomes.yaml` bytes remain unchanged

#### Scenario: Invalid registration document is rejected

- **WHEN** `casehomes.yaml` is malformed, has a non-mapping root, duplicate
  keys, non-string keys or values, or a stored path that is missing,
  non-absolute, non-real, does not end in `/casegraph/root.yaml`, or maps one
  canonical real root from multiple canonical IDs
- **THEN** registration and registration inspection fail with the configuration
  path and validation context
- **THEN** no partial replacement is published

#### Scenario: Registration document entry must be a regular file

- **WHEN** the `casehomes.yaml` directory entry is a valid symlink, dangling
  symlink, directory, or other non-regular filesystem entry
- **THEN** registration and registration inspection reject that exact entry
  after `lstat`
- **THEN** the entry and its target, if any, remain unchanged
- **THEN** the system does not treat the entry as an absent registry

#### Scenario: Registration root target must be a regular file

- **WHEN** a requested or stored canonical `casegraph/root.yaml` target is a
  directory, device, or other non-regular filesystem entry
- **THEN** registration and registration inspection reject the target with its
  canonical path and filesystem type
- **THEN** the registry bytes remain unchanged

#### Scenario: Replacement preserves registry permission bits

- **WHEN** an existing regular `casehomes.yaml` is valid and registration
  publishes a changed complete mapping
- **THEN** the replacement preserves the existing registry permission bits
- **THEN** publication still uses an exclusively created sibling temporary file
  and atomic rename

#### Scenario: Contending registration fails without stale publication

- **WHEN** one registration writer holds `casehomes.yaml.lock` before reading
  and a second process attempts a conflicting registration
- **THEN** the contender fails visibly with the guard path and contention state
- **THEN** the contender does not read, replace, or change `casehomes.yaml`
- **THEN** the contender does not report `"created"` or `"unchanged"`
- **THEN** the contender does not retry or use a fallback publisher

#### Scenario: Released guard protects the latest published snapshot

- **WHEN** one writer publishes and releases its guard and a later registration
  operation begins
- **THEN** the later operation acquires the guard and rereads the published
  mapping before validation
- **THEN** it preserves the first writer's entry when it publishes another
  non-conflicting entry
- **THEN** two conflicting snapshot writers cannot both report `"created"`

#### Scenario: Guard cleanup follows normal and error completion

- **WHEN** a registration holder completes normally or fails before publication
- **THEN** it removes its owned guard before returning when cleanup succeeds
- **THEN** no contender removes a guard it did not acquire

#### Scenario: Guard cleanup failure remains visible

- **WHEN** removal of an acquired guard fails after normal or error completion
- **THEN** the operation reports cleanup failure and the retained guard path
- **THEN** the result reports whether registry publication already occurred
- **THEN** the system does not retry, delete other state, use a fallback, or
  claim clean completion

### Requirement: Preserve Compound Registration Failures

The system MUST preserve compound registration failures. When validation or
publication fails and removal of the acquired registration guard also fails, it
MUST report both the original primary diagnostic and the guard-cleanup diagnostic
without masking either one, together with the retained guard path and exact
registry-publication state.

#### Scenario: Primary and cleanup failures are both reported

- **WHEN** a registration operation fails during validation or publication
- **AND** removal of its acquired `casehomes.yaml.lock` also fails
- **THEN** the result reports the original validation or publication diagnostic
- **THEN** the result separately reports the guard-cleanup diagnostic and
  retained guard path
- **THEN** the result identifies whether `casehomes.yaml` was published
- **THEN** neither failure masks the other and the operation does not report
  `"created"`, `"unchanged"`, or clean completion

### Requirement: Preserve Explicit Recovery State

The system MUST preserve and report filesystem and Git state after every failed
mutation and MUST NOT delete or silently compensate for a CaseHome directory,
resource, repository, commit, ref, remote, pushed commit, or registration.

#### Scenario: Preparation failure reports existing state

- **WHEN** preparation fails after creating any local path or initializing Git
- **THEN** the failure report inventories each created or preserved path and the
  current Git state
- **THEN** it identifies the failed step and a safe next action

#### Scenario: Staging failure stops before commit

- **WHEN** finalization fails while staging the CaseHome contents
- **THEN** the report inventories the actual working tree and index state
- **THEN** it reports no local commit, push, or registration

#### Scenario: Commit failure stops before commit identity and push

- **WHEN** staging succeeds and commit creation fails
- **THEN** the report inventories the actual index and `HEAD` state
- **THEN** it reports no created commit, push, or registration

#### Scenario: Commit identity capture failure preserves the commit

- **WHEN** the first commit succeeds and capturing its commit ID fails
- **THEN** the report inventories the actual `HEAD` state without inventing a
  commit ID
- **THEN** no push or registration occurs

#### Scenario: Finalization failure reports durable boundaries

- **WHEN** finalization fails before push, during push, after push, or during
  registration
- **THEN** the report distinguishes uncommitted, locally committed, pushed, and
  registered state
- **THEN** it does not report a later state as successful

#### Scenario: Post-push resource revalidation failure is exact

- **WHEN** push succeeds and strict resource reopening fails
- **THEN** the report identifies the pushed state and resource diagnostic
- **THEN** it does not report Git reinspection or registration as successful

#### Scenario: Post-push Git reinspection failure is exact

- **WHEN** push and strict resource reopening succeed and Git reinspection fails
- **THEN** the report identifies the pushed state and Git diagnostic
- **THEN** it does not report registration as successful

### Requirement: Keep Provider And Workflow Policy Outside The Foundation

The system MUST expose Issue #42 behavior only as importable internal
boundaries and MUST NOT add provider, public command, worktree, portable
configuration, provider/remote configuration, or migration behavior.

#### Scenario: Repository boundaries are importable now

- **WHEN** Issue #42 is implemented
- **THEN** repository inspection, preparation, finalization, and existing
  registration are exported for internal TypeScript callers
- **THEN** the existing CLI command tree and help output remain byte-identical
- **THEN** the new package imports no provider client and does not create hosted
  repositories or configure remotes

#### Scenario: No adjacent architecture is added

- **WHEN** Issue #42 is implemented
- **THEN** it may read and atomically write the machine-local
  `<config-home>/casehomes.yaml` registration and may exclusively create,
  remove, or visibly retain on cleanup failure only its ephemeral sibling
  `casehomes.yaml.lock` guard as defined by this capability
- **THEN** it adds no other durable configuration or lock artifact, portable
  `config.yaml`, aliases, defaults, provider artifact, operation worktree,
  hosting, infrastructure, migration, or legacy compatibility path
