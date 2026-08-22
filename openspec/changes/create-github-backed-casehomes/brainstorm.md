# GitHub-Backed CaseHome Bootstrap

## Status

Approved design inputs for Issues #40, #41, #42, #45, and #46. This document
records the shared filesystem and identity vocabulary that their separate
OpenSpec changes and stacked pull requests must use.

## Outcome

Create or clone a portable CaseHome Git repository inside a broader CaseFolder
without placing all surrounding case material under CaseGraph source control.

## Canonical layout

```text
<case-folder>/
  casegraph/                       # primary CaseHome Git repository
    root.yaml                      # root Case resource
    config.yaml                    # portable CaseHome configuration
    casegraph.lock.yaml            # deterministic dependency lock when present
  .worktrees/
    <operation-uid>/               # linked CaseHome operation checkout
  sources/                         # illustrative non-CaseHome material
  filings/                         # illustrative non-CaseHome material
  data-requests/                   # illustrative non-CaseHome material
```

The outer directory is the **CaseFolder**. It is user selected, may contain any
case material, and is not required to be a Git repository.

The exact `casegraph/` child is the **CaseHome**. It is the primary Git
repository containing the case graph. Its root resource is always
`<case-folder>/casegraph/root.yaml`.

Operation worktrees are siblings of the CaseHome at
`<case-folder>/.worktrees/<operation-uid>/`. They are outside the primary
CaseHome repository and never participate in package search, source search,
resource discovery, or graph membership.

## Operation identity

Each mutation operation receives one immutable CUID2 operation UID. CaseGraph
uses that same UID as the worktree-directory name and derives the operation
branch as `casegraph/<operation-uid>`.

The operation UID is not a graph-resource UID. Every target node or legal-effect
edge retains its own immutable `metadata.uid`, including a resource first
created by the operation. The active-operation record and Git commit metadata
associate the operation UID with all target resource UIDs. This supports
multi-resource operations and operations against existing resources without
creating a second identity for either the transaction or a resource.

## Registration

The canonical public case ID is the GitHub repository identity
`<github-owner>/<repository-name>`. Machine-local registration maps that ID to
the canonical absolute path of `<case-folder>/casegraph/root.yaml`. Storing the
root-file path makes the entry point explicit and prevents callers from
guessing whether a registered directory is a CaseFolder, a CaseHome, or another
package.

Aliases and local or user-global defaults are machine-local configuration.
They resolve to the canonical repository identity and never change the
registered CaseHome root, root resource UID, or committed CaseHome files.

## Command paths

The approved bootstrap commands are:

```text
casegraph cases init <github-owner>/<repository-name> [case-folder]
casegraph cases clone <github-owner>/<repository-name> [case-folder]
```

The optional second argument always identifies the CaseFolder. Both commands
operate on its `casegraph/` child.

When the CaseFolder argument is omitted, it resolves relative to the caller's
current directory as:

```text
./<github-owner>/<repository-name>/
```

The resulting default CaseHome is therefore:

```text
./<github-owner>/<repository-name>/casegraph/
```

## Delivery order

The implementation uses one native GitHub stacked pull request per completed
issue, ordered by dependency:

```text
#40 strict envelopes
  -> #41 global-UID resource storage
  -> #42 Git-backed CaseHomes
  -> #45 GitHub init and clone
  -> #46 aliases and defaults
```

Issues #45 and #46 remain the highest-priority product outcomes. The lower
layers exist only because those outcomes depend on their contracts.

## Non-goals

- The CaseFolder does not become the CaseHome or a required Git repository.
- Machine-local absolute paths do not enter committed CaseHome resources or
  portable configuration.
- Operation worktrees are not nested inside the CaseHome repository.
- This shared design does not collapse the five issue contracts into one
  implementation or one pull request.
- This shared design does not preserve the legacy `CaseHome` resource envelope
  or `cases new` command as a second architecture.
