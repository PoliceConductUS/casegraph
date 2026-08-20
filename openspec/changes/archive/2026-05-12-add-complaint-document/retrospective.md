# Retrospective: add-complaint-document

> Written: 2026-05-12 (after verify passed)
> Commit range: `42cfcbc..25198f8`
> Worktree: `/path/to/casegraph/.worktrees/add-complaint-document`

---

## 0. Evidence

- **Commit range**: `42cfcbc..25198f8` (7 commits)
- **Diff size**: +783 / -29 lines across 10 files before archive sync
- **Tasks done**: 18/18
- **Active hours**: about 2
- **Subagent dispatches**: 0
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; change has not been merged
- **OpenSpec validate state at archive**: pass (`npm run validate` included `openspec:validate: 2 passed, 0 failed`)
- **Test coverage signal**: Vitest 26 passed

Commit chain:

```text
1ace55f feat(cli): add complaint document command
2a44680 chore(openspec): verify complaint document change
3f6e67d fix(cli): expose complaint command help
a8ed6fd chore(openspec): refresh complaint verification
bdb7de5 fix(cli): validate complaint pdf source
52a4e4e chore(openspec): refresh pdf validation evidence
25198f8 feat(cli): guide complaint next steps
```

---

## 1. Wins

- The implementation stayed inside the requested narrow scope: one complaint node, one external PDF path, no copy/import/parse/hash, no edges, and no parent field. Evidence: `test/cli.test.ts`, `openspec/changes/add-complaint-document/specs/case-documents/spec.md`, commit `1ace55f`.
- Defects found during the change were fixed with tests instead of deferred: command help was added in `3f6e67d`, and PDF source validation was added in `bdb7de5`.
- The final command flow now guides the user from `cases new` to complaint recording and then toward future augmentation discovery. Evidence: commit `25198f8`, `src/cli.ts`, and the focused assertions in `test/cli.test.ts`.

## 2. Misses

- 🟡 [painful] The initial complaint implementation did not validate source path existence/readability/PDF signature until the user called it out. Evidence: `bdb7de5` added the missing validation after the first implementation.
- 🟡 [painful] Help coverage for the intermediate `cases add` and `cases add document` levels was missing until review. Evidence: `3f6e67d`.
- 📌 [nit] `verify.md` initially lagged behind later follow-up commits and needed refresh commits. Evidence: `a8ed6fd`, `52a4e4e`, and `25198f8`.

## 3. Plan deviations

| Plan task | What changed                                            | Why                                                                                                        |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2.5       | Success output expanded beyond reporting created paths. | The user requested next-step guidance after case creation and complaint recording.                         |
| 2.6       | PDF validation was added after initial implementation.  | The user clarified that the command must prove the source exists, is readable, and is actually PDF format. |
| 3.x       | Validation was run multiple times, not once.            | Follow-up defects and spec updates required fresh evidence.                                                |

## 4. Skill / workflow compliance

| Skill                                            | Used |
| ------------------------------------------------ | ---- |
| superpowers:brainstorming                        | ✓    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✓    |
| superpowers:subagent-driven-development          | ✗    |
| (transitive) superpowers:test-driven-development | ✓    |
| (transitive) superpowers:requesting-code-review  | ✗    |
| superpowers:finishing-a-development-branch       | ✗    |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: parallel worker dispatch.
  - **Why this cycle**: the write set stayed within `src/cli.ts`, `test/cli.test.ts`, and one OpenSpec change directory; parallel writes would have created coordination overhead without an independent non-overlapping workstream.
  - **How to prevent recurrence**: scope-judgment rule: only dispatch workers when there are at least two independent implementation slices with disjoint write sets.

- **`superpowers:requesting-code-review`**
  - **What was skipped**: external review pass before archive.
  - **Why this cycle**: each user-raised issue was reviewed inline and covered by focused tests; the final validation signal was `npm run validate` with 26 tests passing.
  - **How to prevent recurrence**: scope-judgment rule: require review for broader graph storage changes, cross-file data model changes, or commands that mutate more than one node.

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: branch integration workflow.
  - **Why this cycle**: the user requested OpenSpec archive, not merge, PR, or cleanup of the worktree branch.
  - **How to prevent recurrence**: one-off -- schema boundary case, no prevention possible; archive is an OpenSpec workflow endpoint, while integration remains a separate user decision.

## 5. Surprises

- The accepted `case-workspaces` spec needed a new delta in this change after the user requested `cases new` output guidance.
- Source-file validation looked obvious only after real command use; the original narrow "record path only" framing made it too easy to defer validation.
- Future augmentation naming became visible before augmentation behavior was specified, so this change records only command guidance and recommended design principles.

## 6. Promote candidates -> long-term learning

- [ ] 🟡 **Validate source boundaries even for path-only records** -> **Promote to project AGENTS.md**

  > **Why**: `bdb7de5` was needed because "record external path only" still requires proving the path exists, is readable, and matches the supported format.
  > **How to apply**: any command that stores a source path should validate the source boundary before writing case data.

- [ ] 🟡 **Help must cover every command prefix that users can reasonably try** -> **Promote to project AGENTS.md**

  > **Why**: `3f6e67d` was needed because `cases add --help` and `cases add document --help` were initially missing.
  > **How to apply**: when adding a nested CLI command, add tests for every discoverable prefix ending in `--help`.

- [ ] 📌 **Archive sync should update durable specs before moving the change** -> **Promote to schema**

  > **Why**: the change had deltas for both a new `case-documents` capability and modified `case-workspaces` behavior.
  > **How to apply**: archive flows should explicitly sync ADDED and MODIFIED requirements, then validate durable specs before moving the change.
