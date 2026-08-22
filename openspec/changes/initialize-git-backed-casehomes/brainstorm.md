## Design Summary

Issue #42 adds internal, importable boundaries for inspecting, preparing,
finalizing, and registering the Git repository at the exact
`<case-folder>/casegraph/` CaseHome. It does not add a public command. Issue #45
will own `cases init` and `cases clone`, hosting-provider authentication,
repository creation, remote selection and configuration, and user prompts.

The read-only boundary derives the exact CaseFolder, CaseHome, and CaseHome-root
paths; loads the Case graph through the strict resource envelope and rooted
storage reader from Issues #40 and #41; and inspects Git without changing files,
the index, refs, remotes, or machine registration. Its report exposes repository
identity and state, remote fetch and effective push URLs, structural push-target
readiness, machine-registration state, mutation readiness, and an explicit
recovery inventory.

The mutation lifecycle is deliberately ordered. Preparation creates or adopts
only the `casegraph/` child, initializes Git there, and writes a caller-supplied
strict Case root when the root does not exist. Finalization refuses to create
the first commit until a caller-selected remote has a configured effective push
URL. It then creates the commit, immediately pushes it, reopens the strict
CaseHome, and writes machine registration last. Any push or later failure leaves
the visible local or remote state intact and reports it; the boundary makes no
deletion or rollback claim.

Machine registration is one strict YAML mapping at
`<config-home>/casehomes.yaml`. Each caller-validated canonical case ID maps to
the canonical real absolute path ending in `/casegraph/root.yaml`. An identical
registration is a no-op, a different path conflicts, and a changed mapping is
published atomically only after the complete next document validates.

## Alternatives Considered

### Approach A: Exact staged repository lifecycle

- **Approach:** Separate read-only inspection, local preparation, push-backed
  finalization, and last-step registration into small importable functions.
- **Advantages:** Every mutation precondition and incomplete state is visible;
  Issue #45 can compose init and clone without duplicating Git rules; registration
  cannot falsely imply a successful push.
- **Disadvantages:** Callers must preserve and report the prepared/finalized
  state between boundaries.

### Approach B: One all-in-one bootstrap function

- **Approach:** Initialize, create a provider repository, configure a remote,
  commit, push, and register in one function.
- **Advantages:** One call appears simple to the CLI layer.
- **Disadvantages:** Couples provider policy and prompts to repository
  invariants, obscures which mutation succeeded, and duplicates Issue #45.
- **Why not selected:** Issue #42 is the reusable repository foundation; the
  provider workflow is a separate stacked outcome.

### Approach C: Register first and compensate on failure

- **Approach:** Write machine registration before commit/push and remove it if a
  later operation fails.
- **Advantages:** Registration exists throughout the bootstrap attempt.
- **Disadvantages:** A failed compensation can leave a false success marker,
  and deletion would erase evidence needed for safe recovery.
- **Why not selected:** Registration is a success assertion and therefore must
  be the final mutation.

## Agreed Approach

Use Approach A. It is the smallest design that keeps Git history authoritative,
uses the strict resource/storage boundary, makes remote limitations explicit,
and gives Issue #45 precise primitives without absorbing Issue #45's product
workflow.

## Key Decisions

- The outcome is internal foundation behavior only; there is no Issue #42 CLI.
- New code does not import or call the legacy `CaseHome`, `CaseLocator`, or
  `cases new` implementation. Their public replacement/removal is deferred to
  Issue #45 as a temporary stacked-layer transition, not compatibility.
- The CaseHome is exactly the real `casegraph/` child. A symlinked child,
  inherited or mismatched Git root, bare repository, or linked worktree cannot
  be a primary CaseHome.
- An outer CaseFolder may be missing, nonempty, or itself inside a Git
  repository. Only its exact `casegraph/` child is mutated.
- Existing non-Git CaseHome adoption requires explicit caller approval and a
  valid strict Case root equal to the caller-supplied root. No existing root is
  overwritten.
- Preparation creates no commit and no registration. Finalization requires one
  selected configured push target before creating the first commit.
- A configured effective push URL proves only structural readiness. Only the
  actual push can prove that the selected remote is writable with the current
  network and credentials.
- A failed push preserves the local commit and prevents registration. A failure
  after push preserves the pushed commit and prevents registration. No failure
  path deletes repositories, files, commits, refs, or remotes.
- An existing primary repository may be registered only when it has a commit
  and `root.yaml` is tracked in `HEAD`. Dirty state and missing remotes are
  reported but do not block registration; they do make mutation readiness
  false.
- `config.yaml` remains a reserved portable CaseHome path. Issue #42 neither
  creates nor validates it; Issues #29 and #53 own that envelope and fail-early
  loading behavior.

## Open Questions

None. Provider repository creation, authentication, remote configuration,
public prompts and commands, portable configuration, operation worktrees,
hosting, and legacy command removal belong to their owning issues.
