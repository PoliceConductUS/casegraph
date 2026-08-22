# ADR 0011: Git-Only Case History And Authoring Transactions

## Status

Accepted.

## Context

CaseGraph needs recoverable document drafting, graph mutation, audits, and
docket updates. A parallel graph-level version model would duplicate Git's
commit graph and require CaseGraph to reconcile two histories after branch
creation, rebasing, squash merging, or restoration.

The CaseHome is already a Git repository. Git can preserve the exact YAML and
owned-file state for every accepted operation without version-numbered folders,
document-version nodes, or parent-version properties.

## Decision

Git is the only version-history system for a CaseHome.

CaseGraph resources do not store:

- version numbers
- version-folder names
- parent-version or previous-version fields
- document-version lineage nodes or edges
- commit-parent copies
- a second CaseGraph history graph

An operation that authors a filing or otherwise generates a new durable case
artifact runs on a new Git branch in its own worktree. The operation writes the
current resource state, ends with a commit on that branch, and synchronizes the
branch with its remote. The same transaction boundary applies to graph-mutating
docket imports and other commands when their OpenSpec contract requires a
branch.

Every operation has one immutable CUID2 operation UID. That UID identifies the
transaction, not a graph resource. CaseGraph derives both local Git locations
from it:

```text
branch:   casegraph/<operation-uid>
worktree: <case-folder>/.worktrees/<operation-uid>/
```

There is no second branch or worktree identifier to reconcile. A target graph
resource keeps its own immutable `metadata.uid`, even when the operation creates
that resource. The operation record and resulting commit metadata identify the
operation UID and every target resource UID, keeping the transaction connected
to its targets without reusing one identity for two different things. One
operation may target zero, one, or many resources.

CaseGraph pushes every commit it creates immediately. There is no successful
local-only CaseGraph commit state. A push failure leaves the operation active,
reports the local branch and commit, and cannot be described as completed.
Finishing an operation pushes its operation-branch commits and the accepted
primary-branch commit. CaseGraph never deletes the remote operation branch as
part of abandonment; the remote copy remains available for recovery.

CaseGraph creates operation worktrees as siblings of the registered primary
CaseHome, under its CaseFolder at:

```text
<case-folder>/.worktrees/<operation-uid>/
```

The registered primary CaseHome remains `<case-folder>/casegraph/`. CaseGraph
must validate that the resolved operation-worktree path is outside the primary
CaseHome repository before creating it. The sibling `.worktrees/` directory
does not require an ignore rule in the CaseHome repository because it is not
inside that repository.

The directory is machine-local transaction infrastructure. It is not a
package, graph resource, graph membership, source-search location, or a
location that resource discovery may traverse.

An operation executes against its linked worktree, but CaseHome search-path and
package-path resolution remains anchored to the registered primary CaseHome.
The linked worktree's sibling filesystem location must not change the meaning
of portable relative paths.

A CaseHome may have zero or one active CaseGraph-managed writable worktree.
CaseGraph must refuse to start another mutating operation while one is active.
The user must first finish the active operation or explicitly abandon it.
Abandonment is a destructive action because it may discard uncommitted case
work and therefore requires explicit confirmation. Read-only inspection does
not count as an active writer.

CaseGraph does not support stacked CaseHome mutation branches. That constraint
may be revisited only when a concrete workflow requires concurrent writers and
defines how conflicting graph states are reconciled.

Squash merging is compatible with this model. The resulting mainline commit is
the accepted CaseHome state. CaseGraph does not copy Git parentage into YAML to
preserve the pre-squash branch shape.

Conventional Commit subjects and machine-readable commit trailers must make a
CaseGraph operation, its primary target, and its outputs discoverable from Git
history. The exact subject scopes and trailer names belong in the OpenSpec
change that implements operation commits.

Audits and validations may run repeatedly against the same resource. A later
run may replace the stable report path in a later commit. The report bytes at
each commit remain immutable and recoverable through Git; CaseGraph does not
create numbered report-version folders to duplicate that history.

## Non-Decisions

This ADR does not define:

- pull-request policy
- the exact Conventional Commit scopes or trailer names
- whether a command creates one commit or several commits before completion
- branch-retention policy after a squash merge
- remote hosting or backup policy
- conflict-resolution behavior
- the commands and prompts used to finish or abandon an active operation
- whether a surrounding CaseFolder that is independently versioned must ignore
  `.worktrees/`

## Consequences

Document and graph history have one authority. Restoring an earlier state,
comparing drafts, and determining the accepted mainline version are Git
operations rather than graph-schema operations.

Commands that create durable state must treat branch, worktree, commit, and
remote synchronization as part of the operation's observable contract before
implementation. A failed commit or synchronization cannot be reported as a
completed generation operation. A CaseHome without a configured writable remote
cannot complete a CaseGraph mutation.
