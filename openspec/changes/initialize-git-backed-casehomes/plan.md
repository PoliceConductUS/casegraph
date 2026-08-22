# Git-Backed CaseHome Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide exact internal CaseHome repository boundaries that inspect,
prepare, push, revalidate, and atomically register a strict Git-backed CaseHome.

**Architecture:** Build one package-by-feature module under
`src/casehomes/git-backed-casehome/`. Keep Git execution and machine
registration injectable at their real side-effect boundaries, compose them with
the existing strict Case resource writer and rooted CaseHome reader, and expose
small inspect/prepare/finalize/register functions rather than a CLI or generic
workflow engine.

**Tech Stack:** TypeScript, Node.js filesystem/path/child-process APIs, Git,
YAML, Zod, Vitest, OpenSpec.

**Spec:**
`openspec/changes/initialize-git-backed-casehomes/specs/casehome-repositories/spec.md`

## Global Constraints

- New Issue #42 production code never imports or calls
  `src/cases/workspaces/**`, legacy `CaseHome`, or `CaseLocator`; this layer does
  not change legacy durable command behavior.
- Every existing CaseHome loaded by the new Issue #42 package uses
  `openCaseHomeResources`; every new root it creates uses
  `writeResourceDocument`.
- The implementation adds no public CLI, provider API, dependency, portable
  `config.yaml`, worktree, alias, default, infrastructure, migration, deletion,
  rollback, retry, or compatibility behavior.
- Git commands use argument arrays without a shell and every mutation result is
  reinspected rather than assumed.
- Each production step follows a witnessed RED, the smallest GREEN, review, a
  Conventional Commit, and an immediate push.

---

## Task 1: Atomic Machine Registration

**Files:**

- Create: `src/casehomes/git-backed-casehome/registration.ts`
- Create: `src/casehomes/git-backed-casehome/registration.test.ts`

**Interfaces:**

- Produces: `CaseHomeRegistrationStore` with
  `read(configHome: string): Promise<ReadonlyMap<string, string>>` and
  `register(input: { configHome: string; caseId: string; rootPath: string }): Promise<"created" | "unchanged">`.
- Consumes: `caseId` already validated as canonical by the Issue #45 caller;
  this boundary does not add another case-identity parser or normalization.

- [ ] **Step 1: Write strict registration parser tests**

  Create cases for an absent file yielding an empty immutable mapping and for
  rejection of malformed YAML, a sequence/scalar root, duplicate keys,
  non-string keys or values, missing targets, non-real/symlinked stored paths,
  values that are not absolute paths ending in `casegraph/root.yaml`, and an
  existing mapping that assigns one real root to multiple IDs. Assert every
  diagnostic identifies `<config-home>/casehomes.yaml`. Prove absence means
  `lstat` found no directory entry; valid and dangling symlinks, directories,
  and another non-regular entry at that exact path are rejected unchanged rather
  than treated as absent. Prove each canonical stored root target is a regular
  file and reject a directory, device, or other non-regular target.

- [ ] **Step 2: Run registration tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/registration.test.ts
  ```

  Expected: FAIL because the registration module does not exist.

- [ ] **Step 3: Implement read-only strict registration loading**

  `lstat` the registry directory entry before reading, treating only a genuinely
  absent entry as empty and accepting only a regular file. Parse with YAML's
  document API so duplicate-key diagnostics are retained. Accept only a direct
  string-to-string mapping, freeze a copied result, and do not inspect aliases
  or defaults because they are outside this schema. Resolve and classify every
  stored canonical root target and require a regular file.

- [ ] **Step 4: Add failing atomic registration tests**

  Create a real temporary `<case-folder>/casegraph/root.yaml`. Prove the store
  resolves it through `realpath`, stores the absolute root path, creates parent
  configuration directories, preserves sorted deterministic YAML, performs no
  write for an identical registration, rejects a different path for one ID, and
  rejects a second ID for one already-mapped root. Assert both conflict
  diagnostics identify the existing/requested ID and path and leave the old
  bytes unchanged. Reject requested canonical root targets that are directories,
  devices, or other non-regular entries. Prove a new registry has POSIX
  permission bits `0600` even under a permissive process umask, and replace a
  valid registry with a distinguishable existing mode while proving
  `stat.mode & 0o777` is preserved. Inject a sibling-file publisher that fails
  before rename and prove the destination bytes remain unchanged.

- [ ] **Step 5: Add failing inter-process serialization and cleanup tests**

  Use a real shared configuration home and independent process participants.
  Hold the exclusive sibling `casehomes.yaml.lock` for one writer before its
  registry read, start a conflicting contender, and prove the contender fails
  with the guard path and contention state while destination bytes remain
  unchanged and neither `"created"` nor `"unchanged"` is returned. Assert no
  retry or fallback publisher invocation. After the holder publishes and
  releases, start a new non-conflicting operation and prove it rereads the
  latest mapping and preserves the first entry; two conflicting stale-snapshot
  writers can never both report `"created"`.

  Cover guard removal after identical no-op, created publication, validation
  failure, and pre-rename publisher failure. Inject guard cleanup failure before
  and after registry publication and prove the diagnostic reports the retained
  guard path plus whether publication occurred, without speculative deletion or
  recovery. Prove a contender never removes the holder's guard.

- [ ] **Step 6: Run the tests and confirm the new registration cases fail**

  Run the Step 2 command. Expected: the new entry-type, target-type, permission,
  serialization, and cleanup cases fail at their named missing behavior while
  previously covered parser and uniqueness behavior remains green.

- [ ] **Step 7: Implement guarded snapshot transaction and atomic rename**

  Accept the already validated `caseId` unchanged, resolve the existing target
  root to its real absolute path, require a regular-file target and the final two
  path segments `casegraph/root.yaml`, and reject both ID-to-different-root and
  root-to-different-ID conflicts. Create `casehomes.yaml.lock` exclusively
  before `lstat` or reading the destination and hold it through validation of
  the complete next mapping, sibling write, and rename. Fail visibly on
  contention without retry or fallback. Write a uniquely named sibling with
  `flag: "wx"`, mode `0600` for a new registry or the existing registry's
  permission bits for replacement, then atomically rename it over the
  destination. On publisher failure, report the unpublished temporary path
  without deleting it. Return `"unchanged"` before creating a temporary registry
  file for an identical registration, but only after making that decision under
  the guard.

  Remove the owned guard after success and after error. If removal fails, report
  the retained guard path and whether publication occurred; do not retry, use a
  fallback, delete other state, or claim clean completion. Never remove a guard
  this operation did not acquire.

- [ ] **Step 8: Run registration tests and record GREEN**

  Run the Step 2 command. Expected: all registration tests pass.

- [ ] **Step 9: Mark tasks 1.1 and 1.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/registration.ts \
    src/casehomes/git-backed-casehome/registration.test.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "feat(casehomes): add atomic machine registration"
  git push
  ```

## Task 2: Exact Read-Only Repository Inspection

**Files:**

- Create: `src/casehomes/git-backed-casehome/git.ts`
- Create: `src/casehomes/git-backed-casehome/index.ts`
- Create: `src/casehomes/git-backed-casehome/inspect.ts`
- Create: `src/casehomes/git-backed-casehome/inspect.test.ts`
- Verify unchanged: `src/cli.ts`
- Verify unchanged: `test/cli.test.ts`

**Interfaces:**

- Consumes: `CaseHomeRegistrationStore.read` from Task 1,
  `openCaseHomeResources`, and `CaseResourceRegistry`.
- Produces: `GitRunner(args: readonly string[], cwd: string): Promise<CommandResult>`.
- Produces: `inspectGitBackedCaseHome(input, dependencies): Promise<CaseHomeRepositoryReport>` where the report is a discriminated immutable value with exact
  paths, resource state, repository state, remotes, structural push-target
  state, registration state, mutation readiness, diagnostics, and recovery
  inventory.

- [ ] **Step 1: Build real temporary Git fixture helpers in the test file**

  Use `git init`, `git add`, `git commit`, `git remote add`, and temporary local
  paths through `execFile`, with a test-local author identity. Snapshot file
  bytes plus parsed `git status --porcelain=v1`, `git show-ref`, remote
  configuration, and the registration bytes before inspection.

- [ ] **Step 2: Write failing report and immutability tests**

  Cover absent/empty/non-Git candidates and a committed exact primary repository
  with strict root, normal branch, detached HEAD, dirty state, multiple remotes,
  fetch/effective push URLs, tracked-root state, selected-remote structural
  readiness, registration state, and recovery inventory. Prove every snapshot
  from Step 1 is byte-identical after inspection.

  Add a CaseFolder fixture that is itself a committed repository. With no exact
  child repository, assert inspection reports the inherited root as
  non-primary rather than primary or conflicting, while its files, index, refs,
  branches, remotes, and upstreams remain byte-identical.

- [ ] **Step 3: Write failing conflict tests**

  Cover a non-directory child, symlinked `casegraph`, existing mismatched
  top-level, bare repository, and three separate `.git`-file fixtures: linked
  worktree, `--separate-git-dir`, and submodule. Cover missing Git executable,
  missing or invalid strict root, and rooted resource-storage failure. Assert
  expected Git root/directory/common-directory paths appear where applicable.

- [ ] **Step 4: Run inspection tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/inspect.test.ts
  ```

  Expected: FAIL because inspection and Git boundaries do not exist.

- [ ] **Step 5: Implement the direct Git runner and exact inspection**

  Use `execFileResult("git", args, { cwd })`; never use a shell command. Derive
  the exact child without recursively scanning, reject symlink identity before
  following it, compare real paths to Git's `--show-toplevel`, report an
  inherited outer root as non-primary, and reject every `.git` file regardless
  of whether it names a linked worktree, separate Git directory, or submodule.
  Read Git/remotes through explicit non-mutating commands. Load resources only
  through `openCaseHomeResources` and registration only through Task 1. Freeze
  copied arrays and nested report values. Export inspection from the package
  entry point without changing `src/cli.ts`.

- [ ] **Step 6: Prove current inspection import and CLI boundaries**

  Import `inspectGitBackedCaseHome` from the new package entry point in the
  focused test. Run:

  ```bash
  npm test -- test/cli.test.ts
  git diff --exit-code 294ee71 -- src/cli.ts test/cli.test.ts
  ```

  Expected: existing CLI tests pass, both CLI files are unchanged from the Issue
  #41 parent, and the inspection boundary is importable without changing CLI
  behavior.

- [ ] **Step 7: Run inspection tests and record GREEN**

  Run the Step 4 command. Expected: all exact-state, conflict, and immutability
  tests pass.

- [ ] **Step 8: Mark tasks 2.1 and 2.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/git.ts \
    src/casehomes/git-backed-casehome/index.ts \
    src/casehomes/git-backed-casehome/inspect.ts \
    src/casehomes/git-backed-casehome/inspect.test.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "feat(casehomes): inspect exact primary repositories"
  git push
  ```

## Task 3: Local CaseHome Preparation

**Files:**

- Create: `src/casehomes/git-backed-casehome/prepare.ts`
- Create: `src/casehomes/git-backed-casehome/prepare.test.ts`
- Modify: `src/casehomes/git-backed-casehome/index.ts`
- Modify: `src/casehomes/git-backed-casehome/inspect.ts`

**Interfaces:**

- Consumes: `GitRunner`, `inspectGitBackedCaseHome`, `writeResourceDocument`,
  `openCaseHomeResources`, and `CaseResourceRegistry`.
- Produces: `prepareGitBackedCaseHome(input, dependencies): Promise<PreparedCaseHomeReport>` accepting common `caseFolder`, `configHome`, and validated `caseId`
  values plus either `{ mode: "create"; initialCase: CaseResource }` or
  `{ mode: "adopt"; approveExistingNonGitCaseHome: boolean }`.

- [ ] **Step 1: Write failing missing/empty preparation tests**

  Prove preparation creates a missing CaseFolder and child or uses an empty
  child, initializes Git only in `casegraph/`, writes deterministic `root.yaml`
  through the strict writer, reopens the rooted snapshot, and returns unborn
  uncommitted state with no remote or registration. Place unrelated files in
  an ordinary outer folder and a separately committed outer Git repository;
  prove every pre-existing outer-owned file byte, index entry, ref, branch,
  remote, and upstream remains unchanged while the exact child becomes a
  distinct repository. Parse outer status separately, prove every pre-existing
  entry remains unchanged, and permit only Git's natural representation of the
  nested CaseHome child as a delta, if any. Add an outer `.gitignore` case that
  suppresses the child and an adoption case whose already-present child content
  is already represented in outer status; neither case requires a new entry.

  First write a caller-supplied strict Case with nonempty `spec.resources` and
  prove create mode rejects it before creating any CaseFolder, child, root, Git
  metadata, or registration. Then use empty membership for the GREEN fixture.

- [ ] **Step 2: Write failing adoption and conflict tests**

  Cover explicitly approved strict non-Git CaseHome adoption with multiple
  rooted resources and owned files, proving the complete rooted graph is
  preserved without a caller replacement root. Pass
  `approveExistingNonGitCaseHome: false` to prove declined adoption is a
  representable call that returns failure without mutation. Cover invalid rooted
  membership, file/symlink child, existing mismatched repository, and every
  `.git`-file checkout. For every failure, assert exact existing files,
  repository state, registration bytes, and recovery inventory.

  Add malformed existing `config.yaml` and arbitrary `casegraph.lock.yaml`
  fixtures and prove adoption ignores and byte-preserves both. Prove both files
  remain absent after new create-mode preparation.

- [ ] **Step 3: Write failing ordered-boundary tests**

  Inject the Git availability probe, Git initialization, strict root writer,
  and post-initialization strict opener separately. Prove missing Git is detected
  before a missing CaseFolder path is created. For init, write, and reopen
  failures, assert the report names the exact failed boundary, inventories only
  actual paths/root bytes/Git state, reports no later step as successful, and
  leaves registration absent.

- [ ] **Step 4: Run preparation tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/prepare.test.ts
  ```

  Expected: FAIL because preparation does not exist.

- [ ] **Step 5: Implement revalidated exact-child preparation**

  Probe Git before creating any path, then reinspect immediately before
  mutation. In create mode, reject nonempty initial membership before creating
  paths, initialize Git in the exact child, and use `writeResourceDocument` for
  the new root. In adoption mode, require approval and preserve the complete
  existing rooted graph without a replacement root. Reopen through
  `openCaseHomeResources` and return the current recovery report. Report init,
  write, and reopen failures exactly. Treat an inherited outer repository as
  non-primary and initialize the eligible exact child without touching outer
  state. Do not stage, commit, configure a remote, read portable config/lock
  files, or write registration. Export preparation from the same package entry
  point.

- [ ] **Step 6: Run preparation tests and record GREEN**

  Run the Step 4 command. Expected: all preparation and preservation tests pass.

- [ ] **Step 7: Mark tasks 3.1 and 3.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/prepare.ts \
    src/casehomes/git-backed-casehome/prepare.test.ts \
    src/casehomes/git-backed-casehome/index.ts \
    src/casehomes/git-backed-casehome/inspect.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "feat(casehomes): prepare uncommitted repositories"
  git push
  ```

## Task 4: Push-Backed Finalization And Existing Registration

**Files:**

- Create: `src/casehomes/git-backed-casehome/finalize.ts`
- Create: `src/casehomes/git-backed-casehome/finalize.test.ts`
- Modify: `src/casehomes/git-backed-casehome/index.ts`
- Modify: `src/casehomes/git-backed-casehome/inspect.ts`
- Modify: `src/casehomes/git-backed-casehome/registration.ts`

**Interfaces:**

- Consumes: Task 1 registration, Task 2 Git/inspection, and the strict rooted
  CaseHome reader.
- Produces: `finalizeGitBackedCaseHome(input, dependencies): Promise<FinalizationResult>` accepting the prepared exact paths, selected remote, validated canonical case
  ID, and first-commit message.
- Produces: `registerExistingGitBackedCaseHome(input, dependencies): Promise<CaseHomeRepositoryReport>`.

- [ ] **Step 1: Write failing push-precondition tests**

  Cover no selected remote, unknown selected remote, and no effective push URL.
  Snapshot index, refs, files, and registration and prove every case fails before
  staging or committing. Prove the report calls a configured URL only
  structurally ready and makes no writability claim.

- [ ] **Step 2: Write failing successful finalization integration test**

  Create a real local bare remote, add it to a prepared CaseHome, finalize, and
  assert one local commit with the supplied message, immediate pushed `HEAD`,
  upstream tracking, strict post-push resource reopening, and last-step canonical
  registration. Inspect the bare remote directly to prove the commit arrived.

- [ ] **Step 3: Write failing incomplete-state tests**

  Inject each boundary independently: staging, commit creation, commit-ID
  capture, push, post-push strict resource reopen, post-push Git reinspection,
  and registration. Use an unreachable local remote for the real push failure.
  For each failure, assert the report names that exact boundary, inventories
  files/index/HEAD/commit/remote/upstream/registration as they actually exist,
  never claims a later boundary succeeded, and preserves all files, Git
  metadata, refs, remotes, local commits, and pushed commits. A commit-ID capture
  failure must preserve the actual commit, omit an invented ID, and skip push.

- [ ] **Step 4: Write failing existing-registration tests**

  Prove a committed tracked-root primary repository may register while dirty and
  remote-less, with registration eligibility true and mutation readiness false.
  Prove unborn, root-untracked-in-HEAD, root-only-staged, every `.git`-file
  checkout, bare, mismatched-root, and strict resource failures never register.

- [ ] **Step 5: Run finalization tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/finalize.test.ts
  ```

  Expected: FAIL because finalization and existing registration do not exist.

- [ ] **Step 6: Implement commit-push-revalidate-register sequencing**

  Reinspect every precondition, resolve the selected remote's effective push URL
  before `git add`, stage CaseHome contents, commit with the supplied message,
  capture the commit ID, and immediately run
  `git push --set-upstream <remote> HEAD`. After successful push, reopen strict
  resources and reinspect Git, then
  call atomic registration last. Keep each boundary separately injectable and
  convert each failure into a structured incomplete result with exact
  diagnostics and recovery inventory; never delete or compensate. Export
  finalization from the package entry point.

- [ ] **Step 7: Implement committed existing registration**

  Reuse exact inspection. Require a normal primary repository, `HEAD`, strict
  rooted CaseHome, and `git ls-tree` evidence that `root.yaml` is tracked in
  `HEAD`. Permit dirty and remote-less state, register atomically, then reinspect
  and report mutation readiness separately. Export existing registration from
  the package entry point.

- [ ] **Step 8: Run all focused Issue #42 tests and record GREEN**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/registration.test.ts \
    src/casehomes/git-backed-casehome/inspect.test.ts \
    src/casehomes/git-backed-casehome/prepare.test.ts \
    src/casehomes/git-backed-casehome/finalize.test.ts
  ```

  Expected: every focused unit and local-bare-remote integration test passes.

- [ ] **Step 9: Prove import, provider, remote-mutation, and legacy boundaries**

  Import `inspectGitBackedCaseHome`, `prepareGitBackedCaseHome`,
  `finalizeGitBackedCaseHome`, and `registerExistingGitBackedCaseHome` from
  `src/casehomes/git-backed-casehome/index.ts` in the focused tests. Exercise
  every boundary with a `GitRunner` observer that records each argument array
  and assert:

  ```typescript
  expect(
    recordedGitArgs.some(
      (args) =>
        args[0] === "remote" && (args[1] === "add" || args[1] === "set-url"),
    ),
  ).toBe(false);
  ```

  This assertion checks the actual argument structure and therefore catches
  `['remote', 'add', ...]` and `['remote', 'set-url', ...]`. Also run:

  ```bash
  rg 'octokit|@actions/github' \
    src/casehomes/git-backed-casehome
  rg 'cases/workspaces|case-home-document|case-locator-document|readCaseHome|readCaseLocator|writeCaseHome|writeCaseLocator' \
    src/casehomes/git-backed-casehome
  ```

  Expected: both searches exit 1 with no output: no provider import and no
  legacy imports or calls from the new Issue #42 package.

- [ ] **Step 10: Mark tasks 4.1 and 4.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/finalize.ts \
    src/casehomes/git-backed-casehome/finalize.test.ts \
    src/casehomes/git-backed-casehome/index.ts \
    src/casehomes/git-backed-casehome/inspect.ts \
    src/casehomes/git-backed-casehome/registration.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "feat(casehomes): finalize pushed repositories"
  git push
  ```

## Task 5: Verify And Archive The Change

**Files:**

- Modify: `openspec/changes/initialize-git-backed-casehomes/tasks.md`
- Create during verification:
  `openspec/changes/initialize-git-backed-casehomes/verify.md`
- Create during retrospective:
  `openspec/changes/initialize-git-backed-casehomes/retrospective.md`
- Archive after acceptance:
  `openspec/changes/archive/2026-08-22-initialize-git-backed-casehomes/`
- Create through archive sync:
  `openspec/specs/casehome-repositories/spec.md`

- [ ] **Step 1: Run focused acceptance coverage**

  Run the Task 4 Step 8 command and map every Issue #42 acceptance criterion to
  a named test, including repository immutability, local bare-remote push,
  registration-path and root-target type rejection, new and replacement
  permissions, held-writer inter-process contention, latest-snapshot
  preservation, guard cleanup outcomes, and no retry or fallback.

- [ ] **Step 2: Run the complete repository gate**

  ```bash
  npm run validate
  ```

  Expected: formatting, lint, all tests, typecheck, build, and strict OpenSpec
  validation pass.

- [ ] **Step 3: Mark task 5.1 complete, commit, and push**

  ```bash
  git add openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "test(casehomes): verify Git-backed contracts"
  git push
  ```

- [ ] **Step 4: Produce verification and retrospective artifacts**

  Follow the superpowers-bridge instructions for `verify.md` and
  `retrospective.md`. Record actual commit/test evidence, subagent rulings and
  costs, no front-door routing leaks, no deferred `[~]` tasks, the exact
  configured-push-versus-writability limitation, and the Task 1 review
  deviation: atomic rename alone did not serialize the snapshot transaction.
  Verification MUST cite the independent-process contention witness, mode and
  non-regular-entry cases, and cleanup-failure retained-state assertions before
  Task 1 or the change may be accepted.

- [ ] **Step 5: Mark task 5.2 complete and rerun verification**

  Confirm every coarse task is checked and the final decision is PASS.

- [ ] **Step 6: Archive and rerun the complete gate**

  Archive `initialize-git-backed-casehomes`, sync the new durable
  `casehome-repositories` spec, then run `npm run validate` again.

- [ ] **Step 7: Commit and push the archive immediately**

  ```bash
  git add -A openspec/changes/initialize-git-backed-casehomes \
    openspec/changes/archive openspec/specs/casehome-repositories
  git commit -m "docs(openspec): archive Git-backed CaseHomes"
  git push
  ```

- [ ] **Step 8: Update the draft PR only after Issue #42 is implemented**

  Update the already-draft PR with implementation and validation evidence, wait
  for GitHub checks, then mark it ready. Link the native stack bottom-to-top and
  do not merge until every stack layer is complete.
