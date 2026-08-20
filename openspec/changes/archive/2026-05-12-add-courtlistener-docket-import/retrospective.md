# Retrospective: add-courtlistener-docket-import

> Written: 2026-05-12 (after verify passed)
> Commit range: `7b531ff..HEAD` (no commits yet; evidence is current worktree diff)
> Worktree: `/path/to/casegraph/.worktrees/add-courtlistener-docket-import`

---

## 0. Evidence

- **Commit range**: `7b531ff..HEAD` (0 commits; implementation not committed yet)
- **Diff size**: +1,365 / -1 lines across 4 tracked files, plus 784 lines of OpenSpec artifacts under `openspec/changes/add-courtlistener-docket-import/`
- **Tasks done**: 26/26
- **Active hours**: less than 1
- **Subagent dispatches**: 0
- **New external dependencies**: `@paralleldrive/cuid2@3.3.0`
- **Bugs encountered post-merge**: none; not merged
- **OpenSpec validate state at archive**: pass before archive
- **Test coverage signal**: Vitest passed 1 test file, 38 tests

Commit chain:

```text
7b531ff merge point from main
HEAD uncommitted implementation in worktree
```

---

## 1. Wins

- [evidence: `npm run validate`, `test/cli.test.ts`] The implementation is covered by behavior tests for dry-run, write, duplicate workspace rejection, unsafe derived ID rejection, argument hard errors, redacted tokens, history files, source references, filing-level citations, and absence of graph edges.
- [evidence: `src/cli.ts`, `openspec/changes/add-courtlistener-docket-import/specs/courtlistener-import/spec.md`] The command preserves CourtListener raw request/response records under `workspace/<case-id>/.history/<mutation-id>/` and keeps graph relationships as properties.
- [evidence: `src/import/courtlistener/docket.ts`, `src/import/courtlistener/docket.mapping.yaml`, `src/import/courtlistener/docket.test.ts`] CourtListener import logic now lives in a focused feature module, and current graph records copy only explicitly mapped properties.

## 2. Misses

- 🟡 [painful | evidence: first `npm run validate`] Lint caught unsafe stringification and template-expression issues after implementation. The fixes were low-risk but should have been caught before the full validation run.
- 🟡 [painful | evidence: user review of imported workspace] The first implementation invented source-prefixed graph IDs such as `courtlistener-attorney-11299034`, then still used source IDs in names such as `attorney-11299034`. The fix changed generated imported graph IDs to opaque local IDs and kept source model/source ID in `sources[]`.
- 🟡 [painful | evidence: user review of imported graph files] The first implementation copied too much CourtListener response shape into current graph records. The fix introduced a narrow YAML mapping and kept unmapped source data in history.
- 📌 [nit | evidence: `openspec instructions retrospective`] The retrospective template assumes a committed change range; this apply cycle intentionally leaves the work uncommitted, so the retro uses worktree diff evidence.

## 3. Plan deviations

| Plan task | What changed                                                   | Why                                                                 |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| 6.5       | Added `verify.md` and then `retrospective.md` after validation | The schema unlocked post-apply artifacts once verification existed. |

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
  - **What was skipped**: Subagent dispatch.
  - **Why this cycle**: Current developer instructions only allow spawning subagents when the user explicitly asks for sub-agents, delegation, or parallel agent work; this apply request did not.
  - **How to prevent recurrence**: `schema graph fix` — the bridge apply instructions should not require subagent use when higher-priority agent rules prohibit delegation without explicit user request.

- **`superpowers:requesting-code-review`**
  - **What was skipped**: External/subagent review.
  - **Why this cycle**: The same no-subagent condition applied, and the user did not request a separate review pass.
  - **How to prevent recurrence**: `schema graph fix` — make review conditional on explicit delegation permission or an available non-subagent review path.

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: Merge/commit/PR finishing flow.
  - **Why this cycle**: The user requested apply, not commit, merge, or PR creation; the work remains uncommitted in the dedicated worktree.
  - **How to prevent recurrence**: `scope-judgment rule` — apply should stop at validated implementation unless the user asks to commit or integrate.

## 5. Surprises

- The OpenSpec status still exposed a ready retrospective artifact after all apply tasks were complete, so creating the retrospective avoids an avoidable archive warning.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Do not let schema-directed subagent instructions override explicit delegation policy** → **Promote to schema**

  > **Why**: The bridge apply instructions expected subagent-driven development, but higher-priority developer rules prohibit subagents without explicit user request.
  > **How to apply**: When schema instructions mention subagents, first check whether current agent policy permits delegation.

- [ ] 📌 **Retrospectives need an uncommitted-worktree path** → **Promote to schema**

  > **Why**: This apply cycle intentionally did not commit, but the retrospective template assumes `git log <base>..HEAD`.
  > **How to apply**: Allow retrospective evidence from `git diff` when the user has not requested a commit.

- [ ] 🟡 **Imported graph IDs must not encode source provenance or graph type unless specified** → **Promote to OpenSpec/spec-writing rule**

  > **Why**: Source-prefixed and source-ID-based graph IDs were introduced without a stated requirement and made provenance part of identity.
  > **How to apply**: When importing from any source, use opaque local generated IDs unless OpenSpec explicitly requires semantic IDs; put source system, source model, and source record ID in `sources[]`.
