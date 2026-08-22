## Context

Issues #40 and #41 established strict Case resources and exact rooted CaseHome
membership. ADR 0010 places that resource graph in the `casegraph/` child of a
broader CaseFolder. ADR 0011 makes Git the only CaseHome history and requires
every CaseGraph-created commit to be pushed. No current boundary proves that an
exact CaseHome is the primary repository, distinguishes a linked worktree,
reports incomplete Git state, or writes the new machine-local registration.

Issue #45 will expose GitHub init and clone commands. This change supplies only
the provider-neutral internal repository and registration foundation those
commands invoke.

## Goals / Non-Goals

**Goals:**

- Inspect the exact primary CaseHome and its Git state without mutation.
- Prepare only the selected `casegraph/` child using the strict resource writer.
- Require and exercise an actual push before reporting a new CaseHome durable.
- Register existing committed CaseHomes without pretending they are ready for
  new mutations when dirty or remote-less.
- Store canonical registrations atomically and reject ambiguous or conflicting
  paths.
- Preserve every incomplete state with actionable recovery inventory.

**Non-Goals:**

- No public `init`, `clone`, or other CLI command.
- No hosting-provider authentication, repository creation, remote selection,
  remote configuration, or prompts.
- No portable `config.yaml` creation or validation; Issues #29 and #53 own it.
- No aliases, defaults, operation worktrees, mutation branches, hosting,
  infrastructure, migration, deletion rollback, or legacy compatibility.

## Decisions

### Model exact lifecycle states, not a generic workflow

The package exposes four direct outcomes: inspect, prepare, finalize, and
register an existing repository. Each operation reinspects its filesystem and
Git preconditions instead of trusting stale caller state. Structured reports
use discriminated states for absent, non-Git, unborn, committed, and incomplete
repositories. There is no extensible state-machine framework.

Inspection derives these paths from one caller-selected CaseFolder:

```text
CaseFolder:     <case-folder>
CaseHome:       <case-folder>/casegraph
CaseHome root:  <case-folder>/casegraph/root.yaml
```

For existing paths, canonical identity uses `realpath`. The exact `casegraph/`
child itself may not be a symlink. Git's reported top-level must equal the real
CaseHome for the child to be primary. A repository inherited from the
CaseFolder or an ancestor is reported as non-primary, but does not block
initializing an otherwise missing, empty, or explicitly approved exact child as
a distinct repository. A bare repository cannot be primary. Any `.git` file is
also ineligible, whether it identifies a linked worktree, a separate-git-dir
checkout, or a submodule. Preparation preserves every pre-existing outer-owned
byte and Git index/ref/branch/remote/upstream value, while the new nested
`casegraph/` child is expected to appear as a new untracked outer status entry.

### Inspect through strict resources and exact Git commands

For a candidate with a root, the new Issue #42 boundaries call
`openCaseHomeResources` with the production Case resource registry. This
preserves the Issue #40 envelope reader and Issue #41 canonical storage
validation inside the new package; it does not alter the durable legacy command
requirements before Issue #45 replaces their public entry points.

The Git boundary executes argument arrays without a shell and reports the Git
top-level, Git directory, common directory, branch or detached state, unborn or
committed state, dirty state, every remote name, and every configured fetch and
effective push URL. It also reports whether `root.yaml` is tracked in `HEAD`.
Structural push-target readiness means a caller-selected remote exists and
`git remote get-url --push` returns a nonempty URL. It does not claim network,
authentication, authorization, or server writability; only `git push` can
prove those at that moment.

Every report includes a recovery inventory of existing directories, resource
files, Git state, commit identity when present, configured remotes, and
registration state. Reports distinguish registration eligibility from mutation
readiness.

### Prepare local state without claiming durability

Preparation accepts a caller-validated canonical case ID, selected CaseFolder,
configuration home, and one exact mode. Create mode includes a caller-supplied
strict Case resource whose `spec.resources` must be empty. Adoption mode includes
an explicit boolean: `true` approves and preserves an already valid strict
non-Git CaseHome with its complete rooted graph; `false` declines without
mutation. Provider authentication, commit messages, and remote values are not
preparation inputs.

Before creating any path, preparation probes Git availability directly. Create
mode may create a missing CaseFolder and exact `casegraph/` child or use an
existing empty child only after rejecting nonempty initial membership. Adoption
mode accepts an existing non-Git CaseHome only after explicit approval and exact
strict rooted validation; it does not replace its root with a caller-supplied
one. Existing files are preserved and listed; the strict writer never
overwrites `root.yaml`. A file or symlink at `casegraph`, invalid rooted graph,
existing mismatched repository, bare repository, or any gitfile checkout fails.
An inherited outer repository is reported but does not block initializing the
exact eligible child; tests snapshot its files, index, refs, branches, remotes,
and upstreams before and after, then separately assert the expected new
untracked `casegraph/` status entry.

The Git runner initializes only the CaseHome. Create mode writes the missing
empty-membership root through `writeResourceDocument`; both modes reopen through
`openCaseHomeResources` and return the exact uncommitted state. Each step is a
separate failure boundary: Git probe, Git initialization, root write, and strict
reopen. The result inventories only states that actually exist and never reports
a later step as successful. Preparation creates no commit, remote, registration,
portable `config.yaml`, lock, alias, default, or worktree. Existing malformed
`config.yaml` and any existing lock are ignored and byte-preserved.

### Finalize by commit, immediate push, revalidation, registration

Finalization reinspects the exact prepared CaseHome and requires an unborn
primary repository with a valid strict root. It accepts the selected remote
from its Issue #45 caller and refuses to stage or commit until the remote has an
effective push URL. It stages the CaseHome contents, creates the caller-supplied
first commit, captures the commit ID, and immediately pushes `HEAD` to the
selected remote with upstream tracking.

Staging, commit creation, commit-ID capture, push, post-push strict resource
reopen, post-push Git reinspection, and registration are separate injected test
boundaries. Every failure returns an incomplete report identifying exactly which
states exist and never claiming a later boundary succeeded. A commit-ID capture
failure preserves the actual commit without inventing its identity and prevents
push. A push or later failure preserves the local or pushed commit as applicable
and prevents registration. No failure path deletes or compensates.

### Register existing repositories independently of mutation readiness

An existing repository may register without a remote and while dirty only when
it is the exact non-linked primary CaseHome, has a commit, has a valid strict
Case root, and `root.yaml` is tracked in `HEAD`. Unborn repositories and
repositories whose root is merely untracked or staged are ineligible. The
resulting report marks missing remote configuration or dirty state as not ready
for a later CaseGraph mutation even though registration itself succeeds.

### Publish one strict machine-local mapping atomically

Registration stores a direct YAML mapping in
`<config-home>/casehomes.yaml`. Both reading and writing reject malformed YAML,
non-mapping roots, non-string keys or values, duplicate keys, and stored paths
that are not absolute `casegraph/root.yaml` paths. The boundary accepts the
caller-validated canonical case ID without adding a second identity policy. A
new target root is resolved through `realpath` before comparison and storage.

Registration validates the complete next mapping, writes a sibling temporary
file with exclusive creation, and atomically renames it over the destination.
An identical ID/path pair performs no write. A different path for the same ID
fails before any write. The inverse is also unique: a root already mapped from
one canonical ID cannot be mapped from a second canonical ID. No alias or
default is inferred.

### Keep the legacy transition explicit and temporary

The new Issue #42 package imports only `src/resources/**`, the existing generic
Git execution boundary, and its own modules. It never calls
`src/cases/workspaces/**`, `CaseHome`, or `CaseLocator`. This branch does not
change legacy durable behavior or remove the legacy public implementation
because lower stacked layers still compile against it. Issue #45 owns replacing
the public bootstrap path and removing or isolating that legacy surface. This is
delivery sequencing, not backward compatibility.

## Risks / Trade-offs

- **[Risk] Read-only inspection cannot prove remote writability.** → Report only
  structural push-target state and reserve writability claims for the actual
  push result.
- **[Risk] Push can succeed before local post-push validation or registration
  fails.** → Register last, preserve the pushed commit, and report exact recovery
  state; do not attempt destructive compensation.
- **[Risk] An explicitly adopted non-Git CaseHome may contain files beyond
  rooted graph membership.** → Require explicit approval, preserve and list the
  complete child contents before commit, and never claim those files are graph
  members merely because Git tracks them.
- **[Risk] Git configuration controls the unborn branch name.** → Do not invent
  or rename a branch in this provider-neutral layer; report the actual branch,
  and let the Issue #45 workflow impose any hosting-specific branch policy.
- **[Risk] Legacy workspace code coexists for one lower stack layer.** → Enforce
  a one-way import boundary and assign its public replacement/removal to #45.

## Migration Plan

No existing data is migrated. Rollback is a normal Git revert of this stack
layer. Runtime failure recovery never deletes CaseHome content, Git history,
remotes, or registration; the report tells the caller what exists and which
step did not complete.

## Open Questions

None.
