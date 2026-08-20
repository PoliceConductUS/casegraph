# Verification Report

**Change**: `support-external-case-package-paths`  
**Verified at**: `2026-08-20 13:14:53 CDT`  
**Verifier**: `Codex`

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returned `"valid": true`.

`npm exec -- openspec validate --all --json` exited 0: seven items passed and
zero failed (six durable specs and this change).

Fresh repository validation at commit `f6a0046` used the exact command
`npm run validate` and exited 0:

- Prettier write/check and ESLint passed.
- Vitest passed 157 tests in 8 files with zero failures.
- TypeScript typecheck passed.
- Build passed.
- Strict OpenSpec validation passed 7/7 items.

## 2. Task Completion (`tasks.md`)

- [ ] Every task is complete before archive.

Seventeen of eighteen task checkboxes are complete. Task 5.4 remains open
because it is the canonical post-verify sequence: write the retrospective,
archive this change, revalidate the archived state, and synchronize the stack.
It does not block starting that sequence; it must be checked in the archived
task file only after the work exists.

| Task | Incomplete reason                                                     | Blocks archive?                     |
| ---- | --------------------------------------------------------------------- | ----------------------------------- |
| 5.4  | Retrospective and archive must occur after this verification artifact | No; this is the archive step itself |

## 3. Delta Spec Sync State

All three capability deltas require archive-time synchronization:

| Capability             | Sync state | Notes                                                  |
| ---------------------- | ---------- | ------------------------------------------------------ |
| `case-packages`        | Needs sync | New durable capability with three added requirements   |
| `case-workspaces`      | Needs sync | Eight modified requirements and two added requirements |
| `courtlistener-import` | Needs sync | Four modified requirements                             |

`openspec archive -y support-external-case-package-paths` will apply these
deltas to the durable specs before moving the change under `archive/`.

## 4. Design / Specs Coherence Spot Check

| Design decision                                                  | Spec coverage                                                                                                                   | Drift |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Typed `CaseLocator` and `CaseHome` envelopes with one owner each | `case-workspaces`: Load External Case Workspace; Use One Reader And Writer Per Document Type                                    | None  |
| Explicit selected case home plus machine-local locator           | `case-workspaces`: Create Case Workspace; Keep Case Workspaces Separated                                                        | None  |
| Ordered external package roots remain read-only                  | `case-packages`: Declare Ordered Package Search Roots; Keep Package Search Roots Read Only                                      | None  |
| CourtListener writes selected home and creates locator last      | `case-workspaces`: Create Case Workspace From CourtListener Import; `courtlistener-import`: Import CourtListener Docket Command | None  |

No design/spec drift was found in the spot check.

## 5. Implementation Signal

- [x] Worktree has no staged, unstaged, or untracked files before this report update.
- [x] All implementation and review-fix commits are pushed.

The complete implementation range is `e7983aa..f6a0046` (15 commits, 37 files,
5,898 insertions and 979 deletions). `HEAD` and
`origin/codex/issue-1-external-package-paths` both resolved to
`f6a0046f1cee3dc792aa4f6f67c8edbca5de3775` before this report update.

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

`rg -n '\[~\]' openspec/changes/support-external-case-package-paths/plan.md`
exited 1 with zero matches. The plan contains no deferred manual dogfood rows,
so no automated-test equivalence gap exists.

## Dependency Audit Warning

`npm audit --json` exited 1 and reported eight known vulnerabilities: one low,
three moderate, four high, and zero critical. Fixes are reported as available.
Dependency remediation is outside this change and was not applied.

## Overall Decision

- [ ] PASS
- [x] PASS WITH WARNINGS — dependency audit remains open and Task 5.4 is the pending post-verify archive sequence.
- [ ] FAIL

**Next step**: write `retrospective.md`, archive and sync the three capability
deltas, check Task 5.4 in the archived task file, rerun `npm run validate`,
synchronize the stack, then open the focused stacked pull request.
