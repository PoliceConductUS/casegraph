# Retrospective: add-evidence-records

> Written: 2026-05-12 (after verify passed)
> Commit range: `origin/main..1f62714`
> Worktree: `/path/to/casegraph/.worktrees/add-evidence-records`

---

## 0. Evidence

- **Commit range**: `origin/main..1f62714` (1 commit)
- **Diff size**: +1650 / -83 lines across 18 files in commit `1f62714`
- **Tasks done**: 21/21
- **Active hours**: one implementation session
- **Subagent dispatches**: 0
- **New external dependencies**: `zod@4.4.3`
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass, 6 items passed
- **Test coverage signal**: Vitest 52 tests passed through `npm run validate`

Commit chain:

```text
1f62714 feat(case-evidence): add evidence records
```

---

## 1. Wins

- The evidence command ended with deterministic SHA-256 identity, duplicate-content rejection, and command history provenance, all covered by `test/cli.test.ts`.
- The graph report gained a reusable Zod-backed schema and visitor layer in `src/cases/graph/records.ts`.
- CLI routing was tightened so `cases add evidence` and `cases add document` are real Commander subcommands in `src/cli.ts`.
- `npm run validate` passed before archive.

## 2. Misses

- 🟡 The scope expanded during implementation from simple evidence metadata to graph traversal, content-hash identity, duplicate rejection, and history. This was productive but should have been reflected in tasks earlier.
- 📌 The existing history helper overwrites history index files, so evidence needed a focused writer rather than reusing it directly.

## 3. Plan Deviations

| Plan task              | What changed                                                    | Why                                                                         |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Evidence node creation | CUID2 opaque IDs changed to SHA-256 content-hash IDs            | User identified duplicate evidence identity as a better model               |
| Report behavior        | Added Zod schemas, visitor traversal, and unlinked record count | User wanted graph-level unlinked record reporting, not evidence-only counts |
| Evidence mutation      | Added `.history/` mutation recording                            | User required evidence add commands to be captured in history               |

## 4. Skill / Workflow Compliance

| Skill                                            | Used |
| ------------------------------------------------ | ---- |
| superpowers:brainstorming                        | yes  |
| superpowers:writing-plans                        | yes  |
| superpowers:using-git-worktrees                  | yes  |
| superpowers:subagent-driven-development          | no   |
| (transitive) superpowers:test-driven-development | yes  |
| (transitive) superpowers:requesting-code-review  | no   |
| superpowers:finishing-a-development-branch       | no   |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: subagent dispatch
  - **Why this cycle**: developer instructions only allow spawning subagents when explicitly requested; no such request was made.
  - **How to prevent recurrence**: one-off - schema boundary case, because higher-priority session instructions constrained subagent use.

- **`superpowers:requesting-code-review`**
  - **What was skipped**: external/subagent code review
  - **Why this cycle**: same subagent restriction applied, and validation plus focused tests covered the acceptance behavior.
  - **How to prevent recurrence**: one-off - schema boundary case, because the active tool policy overrode the schema's normal review preference.

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: branch finishing flow before archive
  - **Why this cycle**: user directly requested `/opsx:archive add-evidence-records` after commit.
  - **How to prevent recurrence**: scope-judgment rule - when the user directly requests archive, run archive workflow instead of inserting an intermediate branch-finishing prompt.

## 5. Surprises

- Root traversal was not enough for imported CourtListener records because the current root does not directly reference the docket node; the traversal needed to include the docket node matched by root docket provenance.
- Content-hash identity made duplicate evidence handling cleaner than path-string comparison.

## 6. Promote Candidates -> Long-Term Learning

- [ ] 🟡 **History helpers must append, not overwrite** -> **Promote to schema**

  > **Why**: evidence needed a local writer because the existing CourtListener history helper rewrites `.history/index.yaml`.
  > **How to apply**: when adding another mutating command, require append-safe history behavior in the OpenSpec change.

- [ ] 🟡 **Evidence identity should be content-based** -> **Promote to memory**

  > **Why**: content hash avoids ambiguous duplicate path handling and matches evidence semantics.
  > **How to apply**: when registering raw evidence-like files, prefer content hash identity unless a spec states otherwise.
