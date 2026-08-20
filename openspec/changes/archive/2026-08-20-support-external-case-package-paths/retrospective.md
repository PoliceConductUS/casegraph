# Retrospective: support-external-case-package-paths

> Written: 2026-08-20 (after verification passed with warnings)  
> Commit range: `e7983aa..f6a0046`  
> Worktree: `/Users/dalelotts/dev/PoliceConductUS/casegraph/.worktrees/issue-1-external-package-paths`

## 0. Evidence

- **Commit range**: `e7983aa..f6a0046` (15 commits)
- **Diff size**: 5,898 insertions and 979 deletions across 37 files
- **Tasks done**: 17/18; Task 5.4 is the post-retrospective archive sequence
- **Active hours**: approximately 3.1 hours (10:08–13:14 CDT)
- **Subagent dispatches**: 16 implementation/review seats or scoped turns (7
  implementers, 7 per-task reviews, 1 final review, 1 final scoped re-review);
  fix rounds reused their task seats
- **New external dependencies**: `yaml@2.9.0` (ISC)
- **Bugs encountered post-merge**: none; the branch has not been merged
- **OpenSpec validate state at archive**: pre-archive JSON and strict validation
  pass 7/7; archive-state revalidation is required by Task 5.4
- **Test coverage signal**: 157 Vitest tests in 8 files passed
- **Dependency audit**: 8 known vulnerabilities (1 low, 3 moderate, 4 high, 0
  critical); no remediation in this change

Commit chain:

```text
19e1b3b docs(openspec): specify external case homes
6774b3c docs(openspec): share case home registration
a975f4c feat(workspaces): add typed case root documents
7534143 fix(workspaces): reject noncanonical locator paths
18b8af0 feat(cases): create explicit external case homes
ae531a2 fix(cases): report required case-home arguments
e09a7b4 docs(openspec): share workspace repair runtime
382261a feat(workspaces): resolve external case homes
0896106 refactor(cases): load operations from case homes
2430bc2 fix(graph): preserve non-root source ID contract
42b6165 feat(packages): add ordered external roots
dfa463a fix(packages): defer compound path repairs
4405499 feat(import): write CourtListener cases to selected homes
a98b26e docs(workspaces): verify external case homes
f6a0046 refactor(workspaces): remove legacy root helpers
```

## 1. Wins

- The strict document owners and atomic-write tests caught canonical-path,
  nested-envelope, temporary-file cleanup, and rename concerns before the
  branch advanced (commits `a975f4c..7534143`).
- Outside-in tests preserved the hard CLI token invariant while moving every
  current operation from repository-local workspace lookup to typed external
  case loading (commits `18b8af0..2430bc2`).
- The package command's review found a real compound-mutation hazard; staging
  repairs in memory produced one atomic `CaseHome` write while preserving the
  every-load repair contract (commit `dfa463a`).
- CourtListener import reused the same selected-home preparation and
  registration flow, preserving locator-last ordering and visible partial-home
  failure behavior without a second creation implementation (commit `4405499`).
- Per-task review plus final whole-branch review closed every Critical,
  Important, and Minor implementation finding before archive. The final
  scoped re-review approved `f6a0046` with no new findings.

## 2. Misses

- 🟡 **Painful**: Task 5 initially allowed a missing-path repair to write before
  a later batch validation failure and stored a realpath-relative value for a
  symlink-selected home. Review forced both atomicity and lexical-home behavior
  to be made explicit (`42b6165..dfa463a`).
- 🟡 **Painful**: Task 4 widened the non-root source schema to accommodate the
  typed root. That crossed a stated unchanged-contract boundary and required a
  boundary-only adapter fix (`0896106..2430bc2`).
- 📌 **Nit**: The first final non-goal search used behavior-oriented regexes but
  missed the semantically named dead legacy parser. The final reviewer found it,
  and `f6a0046` removed all three unused helpers and added a symbol-name search.
- 📌 **Nit**: Worker-side Git Town sync approval was inconsistent for Task 6;
  the controller completed the already-required sync without changing scope.
- 📌 **Nit**: The existing dependency audit remains open at 1 low, 3 moderate,
  and 4 high vulnerabilities. This change neither introduced a remediation
  requirement nor claimed to fix them.

## 3. Plan Deviations

| Plan task    | What changed                                                                     | Why                                                                                              |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2            | Exported `prepareCaseHome` and `registerCaseHome` before importer work           | Task 6 needed the exact same collision, prompt, and locator-last flow                            |
| 3            | Extended the shared `WorkspaceRuntime` with package repair callbacks             | Production prompt wiring needed one explicit runtime boundary                                    |
| 5            | Added opt-in deferred repair state for `packages add`                            | Preserved prompt-on-load and one-write compound atomicity together                               |
| 7            | Closed the deferred `locatorRoot`/`graphRoot` assertions                         | The assertion gap was narrow and directly relevant to final validation                           |
| Final review | Removed three unused legacy repo-local helpers                                   | The explicit no-compatibility-parser non-goal was stronger than the plan's caller-only migration |
| Verification | Replaced the provisional evidence summary with the bridge's seven-section report | Retrospective PRECHECK and archive audit require the formal decision/task/delta sections         |

## 4. Skill / Workflow Compliance

| Skill                                            | Used                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| superpowers:brainstorming                        | ✓                                                         |
| superpowers:writing-plans                        | ✓                                                         |
| superpowers:using-git-worktrees                  | ✓                                                         |
| superpowers:subagent-driven-development          | ✓                                                         |
| (transitive) superpowers:test-driven-development | ✓                                                         |
| (transitive) superpowers:requesting-code-review  | ✓                                                         |
| superpowers:finishing-a-development-branch       | ✓ active; final PR action follows archive by schema order |

### Deliberately Skipped Skills

None.

## 5. Surprises

- A symlink-selected home makes the lexical directory, not its resolved realpath,
  the correct basis for a user-visible relative package entry.
- Commander's required-option and excess-argument handling can bypass domain
  diagnostics unless the parser grammar and error mapping are tested together.
- A regex for legacy behavior is not a substitute for searching the known
  legacy symbol names; dead compatibility code can survive after every caller
  is migrated.
- The strict bridge lifecycle intentionally leaves the archive task unchecked
  at verification time because the retrospective and archive happen afterward.

## 6. Promote Candidates → Long-Term Learning

- [ ] 📌 **Pair behavior-oriented non-goal searches with known legacy symbol searches** → **Promote to project AGENTS.md**

  > **Why**: The first final search proved there was no live repo-local fallback but missed an unused permissive parser named `isRootCaseNode`.
  > **How to apply**: When a change forbids compatibility behavior, search both call patterns and every known legacy helper/type/field name before declaring the old path absent.

- [ ] 🟡 **Stage multi-path repairs and requested edits before one document write** → **Promote to project AGENTS.md**

  > **Why**: Immediate repair writes could have left `CaseHome` partially changed when a later `packages add` path failed validation.
  > **How to apply**: For commands that combine validation/repair with a requested mutation, collect the complete next state first and call the owning writer once.

- [ ] 📌 **Treat worker sync rejection as a controller handoff, not a task defect** → **One-off**

  > **Why**: The worker's escalation was rejected while the controller's already-authorized Git Town sync succeeded without implementation changes.
  > **How to apply**: Record the rejected attempt, let the controller try the approved workflow once, and never work around a genuine permission denial.
