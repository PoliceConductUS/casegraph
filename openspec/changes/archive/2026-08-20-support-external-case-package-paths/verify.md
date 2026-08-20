# Verification Report

**Change**: `support-external-case-package-paths`  
**Verified at**: `2026-08-20 13:20:11 CDT`
**Verifier**: `Codex`

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returned `"valid": true`.

`npm exec -- openspec validate --all --json` exited 0 after archive: seven
durable specs passed and zero failed.

Fresh repository validation on the archived tree that became commit `f1c3b2a`
used the exact command `npm run validate` and exited 0:

- Prettier write/check and ESLint passed.
- Vitest passed 157 tests in 8 files with zero failures.
- TypeScript typecheck passed.
- Build passed.
- Strict OpenSpec validation passed 7/7 items.

## 2. Task Completion (`tasks.md`)

- [x] Every task is complete.

All eighteen task checkboxes are complete. Task 5.4 was checked only after the
retrospective existed, the change was archived with delta-spec synchronization,
the archived tree passed `npm run validate`, and commit `f1c3b2a` was
synchronized to the remote branch.

| Task | Incomplete reason | Blocks archive? |
| ---- | ----------------- | --------------- |
| —    | —                 | —               |

## 3. Delta Spec Sync State

All three capability deltas were synchronized during archive:

| Capability             | Sync state | Notes                                              |
| ---------------------- | ---------- | -------------------------------------------------- |
| `case-packages`        | Synced     | Created durable capability with three requirements |
| `case-workspaces`      | Synced     | Applied eight modified and two added requirements  |
| `courtlistener-import` | Synced     | Applied four modified requirements                 |

`npm exec -- openspec archive support-external-case-package-paths --yes`
reported totals of 5 added and 12 modified requirements, then moved the change
to `openspec/changes/archive/2026-08-20-support-external-case-package-paths/`.

## 4. Design / Specs Coherence Spot Check

| Design decision                                                  | Spec coverage                                                                                                                   | Drift |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Typed `CaseLocator` and `CaseHome` envelopes with one owner each | `case-workspaces`: Load External Case Workspace; Use One Reader And Writer Per Document Type                                    | None  |
| Explicit selected case home plus machine-local locator           | `case-workspaces`: Create Case Workspace; Keep Case Workspaces Separated                                                        | None  |
| Ordered external package roots remain read-only                  | `case-packages`: Declare Ordered Package Search Roots; Keep Package Search Roots Read Only                                      | None  |
| CourtListener writes selected home and creates locator last      | `case-workspaces`: Create Case Workspace From CourtListener Import; `courtlistener-import`: Import CourtListener Docket Command | None  |

No design/spec drift was found in the spot check.

## 5. Implementation Signal

- [x] Worktree had no staged, unstaged, or untracked files before this final evidence update.
- [x] All implementation, review-fix, and archive commits are pushed.

The complete range through archive is `e7983aa..f1c3b2a` (16 commits, 41
files, 6,490 insertions and 1,200 deletions). Commit `f1c3b2a` was pushed to
`origin/codex/issue-1-external-package-paths` before this final evidence
update.

Independent per-task reviews passed. The final whole-branch review found one
unused legacy parser/helper block; commit `f6a0046` removed it, and the same
reviewer confirmed the finding addressed with no new findings.

## 6. Front-Door Routing And Non-Goal Checks

- [x] No `docs/superpowers/` path exists.
- [x] No production operation joins or resolves `cwd/workspace/<case-id>`.
- [x] Only the `CaseLocator` and `CaseHome` owner modules import `yaml`.
- [x] No legacy root helper/parser remains.
- [x] No managed-write authorization or compatibility/fallback behavior was added.

Exact checks and outcomes:

```text
find docs -path '*superpowers*' -print
  exit 0, no output

rg -n -U "path\.(join|resolve)\(\s*cwd,\s*[\"']workspace[\"']" src --glob '!*.test.ts'
  exit 1, zero matches

rg -n "from \"yaml\"|from 'yaml'" src --glob '!*.test.ts'
  exit 0, exactly case-locator-document.ts and case-home-document.ts

rg -n 'isRootCaseNode|workspaceDisplayPath|pathIsDirectory' src test
  exit 1, zero matches

rg -n -i 'managed.?write|package.?write.?author|write.?authori|compatib|legacy.*root|root.*fallback' src --glob '!*.test.ts'
  exit 1, zero matches
```

`git diff --check` also exited 0.

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`rg -n '\[~\]' openspec/changes/archive/2026-08-20-support-external-case-package-paths/plan.md`
exited 1 with zero matches. The plan contains no deferred manual dogfood rows,
so no automated-test equivalence gap exists.

## Dependency Audit Warning

`npm audit --json` exited 1 and reported eight known vulnerabilities: one low,
three moderate, four high, and zero critical. Fixes are reported as available.
Dependency remediation is outside this change and was not applied.

## Overall Decision

- [ ] PASS
- [x] PASS WITH WARNINGS — the dependency audit remains open.
- [ ] FAIL

**Next step**: commit and synchronize this final evidence update, then open the
focused stacked pull request.
