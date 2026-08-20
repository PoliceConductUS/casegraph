## Context

CaseGraph currently has design documentation but no implemented CLI. The accepted first command is `casegraph cases new <case-id>`. The user now clarified that the project must support multiple active cases immediately, and that repo-local case workspaces may be checked in.

## Goals / Non-Goals

**Goals:**

- Implement the smallest useful CLI surface for creating separated case workspaces.
- Keep each case workspace isolated under `workspace/<case-id>`.
- Provide clear help text for the command hierarchy.
- Make duplicate workspace creation fail without modifying existing files.
- Keep the implementation easy to test without adding graph storage.

**Non-Goals:**

- No default/current case.
- No graph schema or database.
- No source connectors.
- No citation auditing.
- No report generation.
- No drafting integration.
- No encryption, sync, backup, or publishing behavior.

## Decisions

### Use A Small Node.js CLI Baseline

Use a small Node.js CLI package as the expected implementation baseline because the repository already uses npm for local OpenSpec and dependency management. A Node CLI keeps setup light and makes command behavior easy to test with child processes.

Alternative considered: a shell script. It would be faster to create but would make future structured command growth and cross-platform tests weaker.

Alternative considered: a database-backed app. It is out of scope because the first need is only workspace creation.

### Use Repo-Local Workspaces

Create workspaces under `./workspace/<case-id>` relative to the current working directory where the command runs. This matches the README and ADR, keeps case artifacts visible, and supports checked-in workspaces.

Alternative considered: a global home-directory workspace. It is out of scope because it adds global state before a concrete workflow requires it.

### Keep Case Separation Explicit

Every created workspace is keyed by `case-id`. The command must not create or depend on a single implicit active case. Future graph and analysis files should live inside the case workspace they belong to.

Alternative considered: creating a default case pointer during first workspace creation. That is out of scope and conflicts with the immediate multi-case requirement.

### Create A Minimal Root Case Node

Create `root.yaml` inside the case workspace as the first graph node. The root node represents the case itself and uses `type: node`, `kind: case`, and `id: root`. The node file name stem must match the node ID, so `root.yaml` contains `id: root`.

Use the case workspace folder to scope node identity. This means every case can have a local `root` node without global ambiguity, and copied workspaces can preserve internal node IDs.

Do not create `case.yaml` as part of this change. A separate workspace manifest can be added later if a concrete workflow requires workspace metadata that is not graph data.

### Reject Unsafe Case IDs Instead Of Transforming Them

Accept only portable case IDs made of ASCII letters, numbers, hyphens, and underscores. Reject empty IDs, missing IDs, `.` and `..`, Windows reserved device names, path separators, whitespace, shell-hostile punctuation, control characters, accidental extra arguments, and case-insensitive duplicates of existing case workspaces. When a user provides an unsafe ID, reject it and suggest a cleaned variant when one can be produced. Do not automatically create the cleaned variant because the case ID is a durable namespace and should be explicitly approved by the user.

Alternative considered: silently slugifying the provided ID. That is too implicit for a durable case workspace name and could create a workspace the user did not mean to approve.

Alternative considered: requiring lowercase slugs. That is stricter than folder safety requires and rejects useful court-style IDs such as `1-26-CV-00001`.

Alternative considered: allowing any folder name accepted by the current filesystem. That would make IDs less portable and more fragile across shells, operating systems, and future tooling.

## Risks / Trade-offs

- Portable case ID validation may reject names the current filesystem could technically store -> suggest a cleaned variant so the user can approve or edit it explicitly.
- Repo-local workspace creation depends on where the command is run -> help and success output must show the created path.
- Creating `root.yaml` starts the on-disk node convention early -> keep it minimal and limited to the root case node.
- Checked-in workspaces can grow large -> do not add ignore rules in this change; revisit when real workspace contents reveal a need.

## Migration Plan

No migration is needed because there is no existing CLI or workspace format.

## Open Questions

None for this change.
