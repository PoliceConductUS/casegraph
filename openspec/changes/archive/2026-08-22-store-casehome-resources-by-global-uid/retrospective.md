# Retrospective: store-casehome-resources-by-global-uid

> Written: 2026-08-22 (after pre-archive verification passed)
> Commit range: `c7b88cb..e49cdfd`
> Worktree: `/Users/dalelotts/dev/PoliceConductUS/casegraph/.worktrees/issue-41-global-uid-storage`

> **Update 2026-08-22**: The §0 pre-archive state is superseded by the accepted
> archive at `openspec/changes/archive/2026-08-22-store-casehome-resources-by-global-uid/`.
> Both durable specs synchronized, and the post-archive full gate passed 237/237
> tests plus formatting, lint, typecheck, build, and strict OpenSpec 9/9.

---

## 0. Evidence

- **Commit range**: `c7b88cb..e49cdfd` (15 commits)
- **Diff size**: +2,205 / -14 lines across 15 files
- **Tasks done**: 7/8 before archive
- **Active hours**: about 1 hour 45 minutes from first OpenSpec commit to verification commit
- **Subagent dispatches**: n/a; the temporary dispatch ledger was intentionally removed after every review gate passed
- **New external dependencies**: none
- **Bugs encountered post-merge**: none; the stack is unmerged
- **OpenSpec validate state at archive**: pre-archive strict validation passed 9/9; archive pending
- **Test coverage signal**: focused 80/80 and full repository 237/237 tests passed

Commit chain (chronological):

```text
20b9e84 docs(openspec): specify global UID storage
99e2132 feat(resources): declare typed storage semantics
b240eb7 docs(storage): clarify rooted membership boundaries
2c194aa fix(resources): freeze inspected resource semantics
9d8c1c5 feat(storage): resolve rooted CaseHome resources
553ad42 test(storage): prove exact rooted discovery
2ba65d9 refactor(storage): inspect resource documents once
e3ce267 fix(storage): enforce resource ownership boundaries
c0aa042 fix(storage): reject dangling owned-path symlinks
b04c3b5 fix(storage): normalize owned path segments
b0b91d7 fix(storage): reject rooted portable paths
09c8071 docs(openspec): require CaseHome path containment
bba680c fix(storage): contain resource documents in CaseHome
66b45c3 fix(resources): freeze selector inputs before inspection
e49cdfd test(storage): verify global UID contracts
```

## 1. Wins

- OpenSpec preceded production code and exposed five contract contradictions before Task 2 (`20b9e84`, `b240eb7`).
- Outside-in TDD kept every correction reproducible: exact rooted discovery used deliberate duplicate-read and directory-scan mutations; path corrections each began with a focused RED.
- Independent spec, code-quality, and whole-branch reviews found boundary defects that green happy-path tests missed, then scoped re-reviews proved every fix.
- The final API remains small: immutable inspection values and one eager snapshot exposing only `count` and UID-only `resolve`.
- No dependency, CLI, migration, traversal-order, production taxonomy, or directory-scanning scope was added.

## 2. Misses

- 🔴 **Blocking**: the first contract contradicted itself on root cycles versus duplicates and exposed ordered traversal state. `b240eb7` corrected the durable scenarios before implementation continued.
- 🟡 **Painful**: initial immutability protected returned arrays but not selector input timing. `2c194aa` fixed returned inspections; whole-branch review later required `66b45c3` to freeze before callbacks.
- 🟡 **Painful**: count/lookup tests did not prove once-per-UID reads or zero unreferenced reads. Mutation probes in `553ad42` supplied executable evidence.
- 📌 **Nit**: storage validated each reachable document twice. `2ba65d9` introduced the smaller single-pass document inspection boundary.
- 🟡 **Painful**: path containment needed four correction waves: dangling symlinks (`c0aa042`), current-directory normalization (`b04c3b5`), rooted portable paths (`b0b91d7`), and UID-folder/document escapes (`09c8071`, `bba680c`).

## 3. Plan Deviations

| Plan task       | What changed                                                                                    | Why                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Task 1          | Added deep-freeze and deeply readonly selector-input fixes.                                     | The original plan required immutable inspections and pure selectors but did not schedule mutation probes. |
| Task 2          | Added observer/mutation tests and a shared single-pass document inspector.                      | Final count/identity alone could not prove no redundant reads or scans.                                   |
| Task 3          | Added dangling, normalized-dot, Windows-rooted, UID-folder-symlink, and document-symlink cases. | Real filesystem path behavior was broader than the first lexical matrix.                                  |
| Task 3 contract | Added real-CaseHome containment before the final storage fix.                                   | The canonical-looking UID path could otherwise read authoritative YAML outside the CaseHome.              |

Controller rulings retained through implementation:

- `Case.spec.resources` establishes root membership; only validated kind selectors add transitive references or owned paths. **Cost if wrong**: directory presence or arbitrary fields could silently define membership.
- Repeated references and cycles identify one canonical resource; only a second authoritative root-UID document is a duplicate. **Cost if wrong**: valid cyclic graphs could fail or one UID could gain two authorities.
- The snapshot does not expose ordered UIDs. **Cost if wrong**: an implementation traversal order would become product behavior before the traversal capability defines it.
- Owned paths identify content below `files/` or `audits/`, never the bare directories, and all existing ancestors must pass real containment. **Cost if wrong**: typed content could claim a directory or escape its owner.

## 4. Skill / Workflow Compliance

| Skill                                              | Used |
| -------------------------------------------------- | ---- |
| `superpowers:brainstorming`                        | ✓    |
| `superpowers:writing-plans`                        | ✓    |
| `superpowers:using-git-worktrees`                  | ✓    |
| `superpowers:subagent-driven-development`          | ✓    |
| `(transitive) superpowers:test-driven-development` | ✓    |
| `(transitive) superpowers:requesting-code-review`  | ✓    |
| `superpowers:finishing-a-development-branch`       | ✓    |

### Deliberately Skipped Skills

None.

## 5. Surprises

- `realpath` reports `ENOENT` for both a genuinely absent suffix and an existing dangling symlink; `lstat` was required to distinguish them.
- POSIX `path.isAbsolute` does not identify a leading backslash as Windows-rooted, even though the portable parser accepts backslashes as separators.
- A path spelled exactly `<casehome>/<uid>/root.yaml` can still resolve outside the CaseHome through either the UID directory or document symlink.
- Runtime freezing after selector execution is too late; immutability must exist at the callback boundary and in its TypeScript input type.

## 6. Promote Candidates → Long-Term Learning

- [ ] 🟡 **Validate real authority boundaries before reading canonical-looking paths.** → **Promote to project guidance**

  > **Why**: UID-folder and document symlinks crossed the CaseHome boundary while preserving the expected lexical path.
  > **How to apply**: Whenever a filesystem path grants resource authority, verify real containment before parsing or invoking callbacks.

- [ ] 🟡 **Freeze validated values before extension callbacks, not only before returning them.** → **Promote to project guidance**

  > **Why**: A selector mutated nested validated data before the returned inspection was frozen.
  > **How to apply**: At schema-owned callback boundaries, combine deeply readonly callback types with runtime freezing before invocation.

- [ ] 📌 **Use mutation probes for negative filesystem and discovery invariants.** → **Promote to testing guidance**

  > **Why**: Count and result assertions passed implementations that reread resources or scanned unreferenced directories.
  > **How to apply**: For no-scan, once-only, and no-external-read requirements, temporarily inject the forbidden behavior and prove the focused test turns RED.
