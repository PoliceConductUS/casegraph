# CaseGraph Backlog Delivery Design

## Goal

Implement PoliceConductUS CaseGraph issues 1 through 15 in issue-number order,
with each story independently reviewable while later stories inherit the
verified foundations established by earlier stories.

## Delivery structure

Use an ordered Git Town stack rooted at `main`:

1. `codex/casegraph-backlog-bootstrap`
2. `codex/issue-1-external-package-paths`
3. `codex/issue-2-litigation-support-connections`
4. `codex/issue-3-connection-revision-history`
5. `codex/issue-4-count-three-hanks-slice`
6. `codex/issue-5-ordered-package-path`
7. `codex/issue-6-external-workspace-cli`
8. `codex/issue-7-package-root-skill-contract`
9. `codex/issue-8-package-reference-resolver`
10. `codex/issue-9-fair-warning-snapshots`
11. `codex/issue-10-rule-59-connections`
12. `codex/issue-11-authority-connection-validation`
13. `codex/issue-12-artifact-sidecars`
14. `codex/issue-13-recursive-package-indexing`
15. `codex/issue-14-package-write-opt-in`
16. `codex/issue-15-document-span-references`

Keep one linked worktree for every branch under `.worktrees/<branch-slug>`.
Each issue branch contains only that issue's OpenSpec cycle, tests,
implementation, and directly required documentation on top of its parent.

## Issue workflow

For every issue branch:

1. Create the branch as a child of the completed preceding branch and attach it
   to its own ignored worktree.
2. Read the accepted capability specs and relevant accepted ADRs.
3. Create the issue-specific OpenSpec proposal, requirement deltas, tasks, and
   bridge plan before implementation.
4. Implement the acceptance criteria in outside-in red-green TDD slices.
5. Run focused tests during development and `npm run validate` before declaring
   the issue complete.
6. Produce the bridge verification and retrospective artifacts.
7. Archive the OpenSpec change on the branch that owns it.
8. Commit each coherent step using Conventional Commits and run
   `git town sync --non-interactive` after every commit.
9. Create a stacked pull request for the completed branch without merging it.
10. Start the next issue only after the owning branch is complete, archived,
    clean, and pushed.

## Product boundaries

- Implement each issue's stated acceptance criteria without adding speculative
  compatibility, fallback, infrastructure, publishing, or cloud behavior.
- Preserve raw evidence and provenance wherever an issue creates or derives
  evidence-like records.
- Reject missing, ambiguous, invalid, or unauthorized inputs visibly rather
  than guessing or silently recovering.
- Keep case-specific records separated by case ID and keep reusable authority
  or artifact packages independent of a particular case when the issue requires
  that separation.
- Do not introduce private case materials. Tests and checked-in examples use
  synthetic fixtures.
- Do not create or restore `docs/superpowers/`; bridge artifacts live under the
  owning `openspec/changes/<change-name>/` directory.

## GitHub boundaries

- Push every commit through Git Town so the remote stack remains recoverable.
- Do not merge pull requests, close issues, or change GitHub Project status
  without explicit user direction.
- Do not add links between the legacy and public repository issues.

## Failure handling

Stop the current issue when its specification is ambiguous, its expected RED
test does not fail for the intended reason, validation fails, or an external
dependency is unavailable. Report the exact blocker rather than starting the
dependent child branch. A child branch is created only from a verified, archived,
clean, and pushed parent.
