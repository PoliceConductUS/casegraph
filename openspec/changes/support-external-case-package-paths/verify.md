# Verification Report

**Change**: `support-external-case-package-paths`
**Verified at**: `2026-08-20`
**Branch**: `codex/issue-1-external-package-paths`
**Verifier**: `Codex`

## Repository Validation

The exact command was:

```bash
npm run validate
```

It passed after the Task 7 prompt wiring and documentation changes:

- Formatting: passed.
- Lint and format check: passed.
- Vitest: 8 test files, 157 tests passed, 0 failed.
- TypeScript typecheck: passed.
- Build: passed.
- Strict OpenSpec validation: 7 items passed, 0 failed.

The validated OpenSpec items were the six durable capability specs and
`change/support-external-case-package-paths`.

## Focused Prompt Evidence

- The required RED command was
  `npm test -- test/cli.test.ts -t "creation prompt|repair prompt"`; all three
  selected tests failed because the production prompt callback factory did not
  exist.
- The same command passed after implementation: 3 tests passed, 0 failed.
- A combined focused run also passed the valid-loader result assertions for
  `locatorRoot` and `graphRoot`: 5 tests passed, 0 failed.

## Dependency Audit Warning

`npm audit --json` reported 8 known vulnerabilities: 1 low, 3 moderate, 4 high,
and 0 critical. Fixes are reported as available. Dependency remediation was not
part of this change and was not applied.

## Non-goal Searches

- No production `src/` match joins or resolves `cwd` with a repository-local
  `workspace` directory for case operations.
- The only production imports of `yaml` are the owning
  `case-home-document.ts` and `case-locator-document.ts` modules.
- No `docs/superpowers/` path exists.
- No production `src/` match adds managed-write authorization, a legacy root
  parser, or a root compatibility fallback.
- The semantic search
  `rg -n "\\b(isRootCaseNode|workspaceDisplayPath|pathIsDirectory)\\b" src test --glob '*.ts'`
  returned zero matches after removal, confirming the legacy repository-local
  root helpers are absent rather than retained as unused compatibility code.

## Known Limitations

- External package roots are search roots only and remain read-only for
  CaseGraph-managed writes.
- Managed-write authorization for shared packages is not supported by this
  change.
- Review, retrospective, OpenSpec archive, final stack synchronization, and PR
  creation remain in Task 7 Step 9 and are intentionally not completed here.
