# Retrospective: enforce-strict-resource-envelopes

> Written: 2026-08-22 (after verification passed with the expected closeout warning)
> Commit range: `652c253..7265310`
> Worktree: `/Users/dalelotts/dev/PoliceConductUS/casegraph/.worktrees/issue-40-strict-resource-envelopes`

> **Update 2026-08-22**: The post-archive `npm run validate` gate passed with
> 185 tests and 8/8 durable OpenSpec specs, completing the pending archive-state
> evidence in §0.

---

## 0. Evidence

- **Commit range**: `652c253..7265310` (8 commits before archive)
- **Diff size**: 1,477 insertions across 14 committed files before the verification and retrospective artifacts
- **Tasks done**: 7/8; task 4.2 is the closeout task completed by this retrospective, final verification, and archive sequence
- **Active hours**: about 0.6 hours from `4953511` at 10:39 CDT through `7265310` at 11:15 CDT
- **Subagent dispatches**: n/a; three agent identities participated, but the temporary delegation ledger was removed after its clean final review as required by the workflow
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; the PR has not been merged
- **OpenSpec validate state at archive**: pre-archive pass, 8/8 items; post-archive validation remains in the closeout sequence
- **Test coverage signal**: 185 Vitest tests passed across 11 files; focused resource tests account for 28 tests

Commit chain (chronological):

```text
4953511 docs(openspec): specify strict resource envelopes
1f74c51 docs(openspec): correct resource test count
dbb2f74 feat(resources): validate global resource UIDs
735f609 feat(resources): dispatch strict kind schemas
1029f81 feat(resources): create deterministic YAML documents
37bb427 fix(resources): brand resource UIDs
555481e docs(resources): align UID plan with branded schema
7265310 test(resources): verify strict envelope contracts
```

## 1. Wins

- The OpenSpec artifacts in `openspec/changes/enforce-strict-resource-envelopes/` preceded implementation and kept the Issue #40 outcome and non-goals explicit.
- Genuine RED/GREEN cycles protected UID validation, strict kind dispatch, and deterministic create-only YAML writes in the three `src/resources/*.test.ts` suites.
- Exact API/kind dispatch and strict schemas avoided a catch-all resource type; `src/resources/resource-kind.ts` contains the only registry boundary.
- The full repository gate passed at `7265310`: formatting, lint, 185 tests, typecheck, build, and 8/8 strict OpenSpec validations.
- Fresh whole-branch review caught the missing TypeScript brand before closeout; `37bb427` added the brand and a compile-time regression assertion.

## 2. Misses

- 🟡 **Painful**: The first implementation of `ResourceUid` validated runtime values but did not preserve the design's compile-time brand. Final review found it, and `37bb427` corrected it before archive.
- 📌 **Nit**: The plan predicted five UID tests while the literal test table produced seven. `1f74c51` corrected the evidence count without changing the requirement or implementation.
- 📌 **Nit**: Sandboxed Vitest runs could not open the `tsx` IPC socket. The complete gate had to run outside the sandbox; this did not reflect a repository defect.

## 3. Plan deviations

| Plan task | What changed                                                                 | Why                                                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1       | Expected GREEN count changed from 5 to 7.                                    | The literal test cases and specification were authoritative; retaining 5 would misstate evidence.                                                                                        |
| 1.2       | Added a compile-time assertion and Zod brand after the first implementation. | Final whole-branch review found the unbranded inferred type did not meet the design contract.                                                                                            |
| 4.2       | Verification runs twice around the retrospective.                            | The bridge requires verification to unlock the retrospective, while task 4.2 cannot be complete until both artifacts exist. The second run provides the all-tasks-complete archive gate. |

## 4. Skill / workflow compliance

| Skill                                            | Used |
| ------------------------------------------------ | ---- |
| superpowers:brainstorming                        | ✓    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✓    |
| superpowers:subagent-driven-development          | ✓    |
| (transitive) superpowers:test-driven-development | ✓    |
| (transitive) superpowers:requesting-code-review  | ✓    |
| superpowers:finishing-a-development-branch       | ✓    |

### Deliberately Skipped Skills

None.

## 5. Surprises

- A runtime-validated CUID2 schema was insufficient to satisfy the design's TypeScript identity boundary; the inferred type also needed an explicit brand.
- The first GitHub failure was caused by sandbox network isolation, not invalid authentication. A live `gh auth status` outside the sandbox confirmed the account was valid.
- `gh stack link` requires at least two PRs, so the first stack layer could be opened as a normal draft PR but cannot be linked until Issue #41's PR exists.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Test branded identifier contracts at compile time as well as runtime.** → **Promote to project guidance**

  > **Why**: Runtime CUID2 validation passed while the inferred TypeScript type still accepted an ordinary string.
  > **How to apply**: Whenever an OpenSpec design calls an identifier branded or nominal, add a compile-time rejection assertion during the first RED/GREEN task.

- [ ] 🟡 **Distinguish sandbox network failures from authentication failures before reporting the cause.** → **Promote to memory**

  > **Why**: The initial GitHub failure was environmental, and outside-sandbox authentication was valid.
  > **How to apply**: When a networked CLI fails in a restricted sandbox, rerun the smallest read-only authentication or connectivity check with approved network access before naming the cause.

- [ ] 📌 **Treat literal table-driven test cases as the source for expected counts.** → **One-off**

  > **Why**: The written count drifted from the seven tests generated by the actual table.
  > **How to apply**: During plan review, count parameterized cases from the test data instead of manually estimating the runner total.
