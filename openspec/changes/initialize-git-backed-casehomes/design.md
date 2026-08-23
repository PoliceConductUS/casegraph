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
checkout, or a submodule. Only after every required Git and remote inspection
succeeds and establishes a non-bare repository is a symbolic-link `.git` entry
separately ineligible with reason `git-symlink`; Git's observed top-level, Git
directory, and common directory remain truthful even when the observed
top-level equals the exact CaseHome. That successful non-bare state never
claims a top-level mismatch. A missing Git executable, a dangling or non-Git
metadata target, or any required command/remote failure remains unavailable;
successful inspection of a symbolic link resolving to bare metadata produces
the dedicated bare variant. Preparation preserves every pre-existing
outer-owned byte, Git index/ref/branch/remote/upstream value, and status entry.
The only permitted outer status delta, if Git reports one, is Git's natural
representation of the nested CaseHome child. Outer ignore rules may suppress
that representation, and adoption may begin with child content already
represented in outer status, so preparation does not require a new status
entry.

### Inspect through strict resources and exact Git commands

For a candidate with a root, the new Issue #42 boundaries call
`openCaseHomeResources` with the production Case resource registry. This
preserves the Issue #40 envelope reader and Issue #41 canonical storage
validation inside the new package; it does not alter the durable legacy command
requirements before Issue #45 replaces their public entry points.

`CaseHomeResourceSnapshot` exposes a frozen, lexicographically sorted
`documentPaths` copy containing the canonical authoritative Case root and every
reachable member document exactly once. The storage boundary records those
paths while it opens the rooted graph; it performs no second document read,
path inspection, or directory scan. Cycles and repeated references contribute
one path, and unreferenced resources contribute none. The order is presentation
and recovery order only. Lexical sorting may visibly sort UID-derived path
segments, but carries no semantic membership priority and does not preserve or
reference typed-selector discovery or traversal order. Inspection copies these
paths into the recovery inventory instead of deriving resource documents from
directory contents.

This result extension does not add parameters or test fields to
`openCaseHomeResources`, `InspectGitBackedCaseHomeDependencies`, or the package
API. Dedicated Vitest modules install hoisted wrappers around
`node:fs/promises` before dynamically importing the resource or inspection
modules. They retain complete per-path `realpath`, `lstat`, and `readFile` call
maps plus directory-enumeration calls while delegating to the real filesystem.
This makes the existing baseline, zero document-path call delta, and symlink
no-read boundary observable without a production test seam.

The Git boundary executes argument arrays without a shell and disables optional
Git locks for every repository-inspection command so status/stat refresh cannot
rewrite the index. Its default runner copies required non-Git environment,
including the platform's actual `PATH`/`Path`, removes every ambient key whose
uppercased name starts with `GIT_`, and sets only
`GIT_OPTIONAL_LOCKS=0`, `GIT_CONFIG_NOSYSTEM=1`,
`GIT_CONFIG_GLOBAL=os.devNull`, and `LC_ALL=C`. The explicit
`--no-optional-locks` command control remains. This prevents repository,
worktree, index, common-directory, object/ref/namespace, and configuration
overrides from redirecting exact inspection or importing hostile global/system
configuration; no public environment seam is added.
Repository-local configuration remains readable for A's existing remotes and
upstream, but this layer still does not create or modify provider/remote
configuration.

Every required Git result is command-classified before its value is used. An
unexpected nonzero result returns repository state and classification
`unavailable`, names the command diagnostic in both readiness policies, keeps
only safely observed recovery facts, copies the same diagnostic to
`recovery.repositoryDiagnostic`, and stops before later Git inspection.
The only permitted nonzero tuples are exact. `rev-parse --absolute-git-dir` may
mean absent/non-Git only when the exact `.git` entry is absent, exit is `128`,
trimmed stdout is empty, and trimmed C-locale stderr is exactly one nonempty
line beginning `fatal: not a git repository`. `rev-parse --verify --quiet HEAD`
may mean unborn only for exit `1` with empty trimmed stdout and stderr. Any tuple
mismatch is unavailable. `branch --show-current` and a branch `for-each-ref`
upstream query represent detached/no-upstream through exit-zero empty output.
Bare state is established before and skips the inapplicable top-level query;
inspection also skips status and committed-root `ls-tree` for bare repositories,
and every executed command except the exact quiet-HEAD unborn tuple must still
succeed. Status, absolute Git directory, common directory, bare-state, required
non-bare top-level, committed-root `ls-tree`, remote list, and configured
fetch/push URL failures never become dirty, absent, untracked, or empty values.

Successful non-bare worktree inspection reports the Git top-level, Git
directory, common directory, branch or detached state, unborn or committed
state, dirty state, every remote name, and every configured fetch and effective
push URL. It also reports whether `root.yaml` is tracked in `HEAD`. Structural push-target
readiness means a caller-selected remote exists and
`git remote get-url --push` returns a nonempty URL. It does not claim network,
authentication, authorization, or server writability; only `git push` can prove
those at that moment.

`structuralPushTarget` is a discriminated union. Known state contains
`state: "known"`, readiness, optional selected remote, `pushUrls`, and
`provesWritability: false`. Identity rejection returns state `"not-inspected"`;
Git/tool/required-command failure returns state `"unavailable"`. Both failure
variants contain `ready: false`, the optional
selected remote, an exact diagnostic, and `provesWritability: false`, but no
`pushUrls`. `recovery.remotes` similarly contains either known remotes or a
not-inspected/unavailable diagnostic; failed or skipped inspection never uses
an empty array. A positively proven non-Git/remote-absent result may use a known
empty remote array.

Remote enumeration publishes atomically into the report. Any remote-name,
fetch-URL, or push-URL command failure discards all partial results and makes
repository, structural push target, and recovery remote inventory unavailable
with the same diagnostic.

A bare repository has a dedicated `RepositoryReport` variant with state
`"ineligible"`, reason `"bare"`, `bare: true`, canonical Git/common directories,
commit-or-unborn state, branch-or-detached state, optional upstream obtained
only from the exit-zero ref query, and a complete remote inventory. It omits
top-level, dirty, tracked-root, expected-top-level, gitfile, and every other
worktree-only field. Its enclosing classification is `"conflict"`; registration
eligibility and mutation readiness are false for the bare reason. Successful
remote queries give structural push and recovery remote known states, while any
remote failure atomically makes repository, structural push, and recovery remote
state unavailable. Recovery includes the exact commit only when committed and
the exact known remote inventory.

The non-bare ineligible union adds reason `git-symlink` without a new public
field only after all required Git and remote queries succeed. Git unavailable,
command failure, or atomic remote-enumeration failure takes precedence and
produces unavailable state without partial repository/remote facts. A
successfully inspected bare target takes precedence and produces the dedicated
bare variant. The successful non-bare `git-symlink` report retains the observed
worktree repository details, including canonical `topLevel`, `gitDirectory`,
and `commonDirectory`; `topLevel` may equal `expectedTopLevel`, and it omits the
regular-file-only `gitFile` property. Its diagnostic and both readiness reason
arrays use exact text
`Exact CaseHome uses an ineligible symbolic-link .git entry at <case-home>/.git`.
Recovery contains the observed
`.git` link pathname, commit when present, and known complete remotes when those
queries succeed, and never describes that successfully inspected non-bare state
as `mismatched-top-level`, including when the truthful top-level differs.
Inspection remains read-only and the symlink is never accepted or used for
repository mutation.

Every report includes `classification`, `paths`, `resource`, `repository`,
`registration`, `structuralPushTarget`, `registrationEligibility`,
`mutationReadiness`, `diagnostics`, and `recovery`. The public resource union
adds `{ state: "not-inspected"; diagnostic: string }`; the repository union adds
that same not-inspected variant while retaining
`{ state: "unavailable"; diagnostic: string }` for missing Git or a required
Git command failure. The registration union also adds the not-inspected variant.
A symlink or non-directory exact child returns all three not-inspected variants
because child identity prevents strict-resource and repository inspection and
the strict registration reader dereferences every stored canonical root during
validation. Zero target access takes priority: the registry reader is not
invoked, the structural push target and recovery remote inventory are not
inspected without empty arrays, and recovery records registration as not
inspected.

Git-unavailable inspection of a safely identifiable normal child still opens
strict resources and reads registration. Only its repository is unavailable.
Recovery contains the safely observed directories and authoritative
`documentPaths`, Git state when inspected, commit identity when present, a
discriminated remote inventory, and the independently observed registration
state. A
different registration for the requested ID or an inverse conflicting-root
registration makes registration eligibility false. Inherited outer inspection
preserves raw index bytes and every pre-existing outer-owned file byte. Symlink
conflicts `lstat` only the link entry and never open, read, resolve, or enumerate
the target. Reports distinguish registration eligibility from mutation
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
upstreams, and status entries before and after. Tests permit only Git's natural
representation of the nested CaseHome child as a status delta, if any, and
cover suppression by outer ignore rules and adoption of already-present child
content without requiring a new entry.

The Git runner initializes only the CaseHome. Create mode writes the missing
empty-membership root through `writeResourceDocument`; both modes reopen through
`openCaseHomeResources` and return the exact uncommitted state. Each step is a
separate failure boundary: Git probe, Git initialization, root write, and strict
reopen. The result inventories only states that actually exist and never reports
a later step as successful. Preparation creates no commit, remote, registration,
portable `config.yaml`, portable `casegraph.lock.yaml`, alias, default, or
worktree. Existing malformed `config.yaml` and any existing portable lock are
ignored and byte-preserved.

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
that are not absolute `casegraph/root.yaml` paths. The boundary uses `lstat` on
the registry directory entry before reading it: only a genuinely absent entry is
an empty registry, and a valid or dangling symlink, directory, or any other
non-regular entry is rejected unchanged. The boundary accepts the
caller-validated canonical case ID without adding a second identity policy. A
new target root is resolved through `realpath` before comparison and storage,
and its canonical target must be a regular file rather than a directory or
device.

Every mutation creates the exclusive sibling guard
`<config-home>/casehomes.yaml.lock` before it reads the current registry, then
holds that guard while it validates the snapshot, constructs and validates the
complete next mapping, writes a sibling temporary file with exclusive creation,
and atomically renames the temporary file over the destination. A contender
fails visibly on the held guard without reading a stale snapshot, publishing,
reporting `"created"`, retrying, or falling back. A later caller may invoke a
new operation after the guard is released; that operation rereads the published
mapping. A newly created registry has permission mode `0600`. Replacement uses
the permission bits captured from the existing regular registry entry.

The holder records a distinguishable identity for the guard it acquired and
removes that guard after normal completion and after an error. It does not unlink
a pathname that is observably a different entry. If guard cleanup itself fails,
the operation inspects the guard pathname and reports state `retained` only when
the acquired identity is still observed, `absent/ownership-lost` when the entry
is absent or observably replaced, and `unknown` when state inspection fails. A
release rejection alone never proves retention. Unexpected disappearance,
replacement, or unknown state remains a visible failure without retry or
fallback. The report preserves whether registry publication already occurred
and any primary diagnostic. This is a cooperative-writer identity check, not an
adversarial filesystem security framework.

The existing exclusive sibling temporary write and atomic rename remain
unchanged; there is no retry. An identical ID/path pair performs no registry
write, but its read and no-op decision still occur while holding the guard. A
different path for the same ID fails before publication. The inverse is also
unique: a root already mapped from one canonical ID cannot be mapped from a
second canonical ID. No alias or default is inferred.

Cleanup is a second failure boundary, not a replacement diagnostic. If
validation or publication fails and owned-guard removal also fails, the returned
failure preserves the original validation/publication diagnostic and separately
reports the cleanup diagnostic, guard path, truthful observed guard-state
classification, and exact publication state. Neither error masks the other, and
the operation cannot report `"created"`, `"unchanged"`, or clean completion.

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
