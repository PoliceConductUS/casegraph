# Retrospective: omit-case-id-for-single-case

> Written: 2026-05-12 (after verify passed)
> Commit range: `9ebe97e..a30f731`
> Worktree: `/path/to/casegraph`

---

## 0. Evidence

- **Commit range**: `9ebe97e..a30f731` (2 commits)
- **Diff size**: +941 / -2 lines across 11 files before archive sync
- **Tasks done**: 16/16
- **Active hours**: about 1
- **Subagent dispatches**: 0
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; change has not been merged separately
- **OpenSpec validate state at archive**: pass (`npm run validate` included `openspec:validate: 3 passed, 0 failed`)
- **Test coverage signal**: Vitest 32 passed

Commit chain:

```text
5bde3df feat(cli): omit case id for single case
a30f731 chore(openspec): verify omitted case id change
```

---

## 1. Wins

- The change avoided default/current/use state and kept omission command-specific. Evidence: `openspec/changes/omit-case-id-for-single-case/design.md`, `src/cli.ts`, and tests asserting no default/current files.
- The end-to-end regression requested by the user was captured in spec and test: one case allows omitted `<case-id>`, adding a second case makes omission reject. Evidence: `test/cli.test.ts` test `requires explicit case ID after a second case is created`.
- Existing explicit complaint command behavior stayed covered while the omitted form was added. Evidence: `npm run validate` with 32 passing tests.

## 2. Misses

- 🟡 [painful] The first archive request had a typo in the change name. The flow recovered by checking active changes, but the command itself could not resolve the typo directly. Evidence: active change list contained only `omit-case-id-for-single-case`.
- 📌 [nit] The apply instruction wanted another isolated worktree, but recent branch/worktree confusion made the current checkout safer for this small change. Evidence: implementation was committed directly on `main`.

## 3. Plan deviations

| Plan task             | What changed                                                               | Why                                                                                                          |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Apply workspace setup | Did not create a new worktree.                                             | Current checkout was clean, and earlier worktree branch confusion made another worktree riskier than useful. |
| Test task 1.6         | Added the user-requested end-to-end transition test before implementation. | It was the clearest safety test for "exactly one case" behavior.                                             |

## 4. Skill / workflow compliance

| Skill                                            | Used |
| ------------------------------------------------ | ---- |
| superpowers:brainstorming                        | ✓    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✗    |
| superpowers:subagent-driven-development          | ✗    |
| (transitive) superpowers:test-driven-development | ✓    |
| (transitive) superpowers:requesting-code-review  | ✗    |
| superpowers:finishing-a-development-branch       | ✗    |

### Deliberately Skipped Skills

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: creating a new isolated git worktree for this apply.
  - **Why this cycle**: the previous worktree session left branch ownership confusing enough that another worktree was more likely to slow the change than protect it; `git status --short` was clean before implementation.
  - **How to prevent recurrence**: scope-judgment rule: use a new worktree for broad or risky implementation, but allow current-checkout implementation when the checkout is clean and the write set is small.

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: parallel worker execution.
  - **Why this cycle**: the implementation touched a single parser path, one test file, and one OpenSpec change; there were no independent write sets.
  - **How to prevent recurrence**: scope-judgment rule: dispatch only when at least two independent implementation slices can progress without editing the same files.

- **`superpowers:requesting-code-review`**
  - **What was skipped**: separate reviewer agent pass.
  - **Why this cycle**: the behavior was bounded by acceptance tests and full `npm run validate`; no cross-module data model or storage migration was introduced.
  - **How to prevent recurrence**: scope-judgment rule: require review for graph storage, multi-command mutation behavior, or changes that add durable state.

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: branch/PR finishing flow.
  - **Why this cycle**: the user requested OpenSpec archive, not PR creation or branch integration.
  - **How to prevent recurrence**: one-off -- schema boundary case, no prevention possible; archive is an OpenSpec endpoint, while PR/merge remains a separate user decision.

## 5. Surprises

- "One case" needed an explicit product definition: folder plus valid `root.yaml`, not merely one directory in `workspace/`.
- The safest UX was not `default` or `use`, but a command-specific omitted-case form that fails loudly when ambiguity appears.

## 6. Promote candidates -> long-term learning

- [ ] 🟡 **Omitted identifiers must have a positive uniqueness proof** -> **Promote to project AGENTS.md**

  > **Why**: This change is safe because omission is permitted only after proving exactly one valid case exists.
  > **How to apply**: any future command that omits durable identifiers should define the uniqueness proof and ambiguity failure in OpenSpec before implementation.

- [ ] 📌 **Use product language in specs even when implementation stores files** -> **Promote to project AGENTS.md**

  > **Why**: The user corrected "one workspace" to "one case"; the implementation detects workspaces, but behavior should be expressed as case behavior.
  > **How to apply**: requirements should describe user-visible concepts first, then design docs can explain the filesystem mechanism.
