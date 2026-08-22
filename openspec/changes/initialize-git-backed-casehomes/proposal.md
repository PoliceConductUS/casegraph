## Why

Strict resources and global-UID storage do not yet prove that a CaseHome is the
correct primary Git repository, durably pushed, or safely registered on the
machine. Issue #42 adds those exact internal boundaries so the Issue #45 GitHub
commands can compose a fail-fast workflow without duplicating repository or
registration rules.

## What Changes

**Git-backed CaseHome foundation**

- Add a read-only exact repository inspection report for the selected
  CaseFolder and its `casegraph/` child.
- Add preparation for a missing or empty child and explicitly approved adoption
  of an existing strict non-Git CaseHome, with empty membership required only
  for newly written roots and an explicit boolean representing both approval and
  decline.
- Add first-commit finalization that requires a configured push target, pushes
  immediately, revalidates, and registers last.
- Add existing-repository registration that permits dirty or remote-less
  repositories only when the primary repository has committed tracked root
  state.

**Machine-local registration**

- Add atomic `<config-home>/casehomes.yaml` storage mapping a caller-validated
  canonical case ID to one canonical real absolute CaseHome-root path.
- Make identical registration a no-op and reject conflicting paths without
  changing the existing file.
- Reject the inverse conflict when another canonical ID already owns the same
  canonical root path.
- Serialize each mutation's read, validation, sibling publication, and cleanup
  with one exclusive ephemeral sibling guard; report contention without retry.
- Reject non-regular registry entries and canonical root targets, create a new
  registry with mode `0600`, and preserve existing permission bits on
  replacement.

**Architecture transition**

- The new Issue #42 package uses the strict Case resource and rooted storage
  boundaries from Issues #40 and #41 and does not call legacy `CaseHome` or
  `CaseLocator` code; legacy durable command behavior is unchanged in this
  layer.
- Legacy public replacement/removal is deferred to Issue #45 as a temporary
  stacked-layer transition, not a compatibility commitment.

## Capabilities

### New Capabilities

- `casehome-repositories`: Exact primary-repository inspection, preparation,
  first push, existing-repository eligibility, recovery reporting, and atomic
  machine registration.

### Modified Capabilities

None.

## Impact

- Adds a package-by-feature implementation under
  `src/casehomes/git-backed-casehome/` with focused unit tests and real Git/local
  bare-remote integration tests.
- Uses the existing strict Case resource writer and rooted CaseHome reader.
- Adds no public CLI, provider API, dependency, infrastructure, worktree,
  migration, hosting, portable `config.yaml`, alias, or default behavior.
