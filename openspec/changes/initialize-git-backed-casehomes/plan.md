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

- New production code never imports or calls `src/cases/workspaces/**`, legacy
  `CaseHome`, or `CaseLocator`.
- Every existing CaseHome loads through `openCaseHomeResources`; every new root
  writes through `writeResourceDocument`.
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
  and values that are not absolute paths ending in `casegraph/root.yaml`. Assert
  every diagnostic identifies
  `<config-home>/casehomes.yaml`.

- [ ] **Step 2: Run registration tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/registration.test.ts
  ```

  Expected: FAIL because the registration module does not exist.

- [ ] **Step 3: Implement read-only strict registration loading**

  Parse with YAML's document API so duplicate-key diagnostics are retained.
  Accept only a direct string-to-string mapping, freeze a copied result, and do
  not inspect aliases or defaults because they are outside this schema.

- [ ] **Step 4: Add failing atomic registration tests**

  Create a real temporary `<case-folder>/casegraph/root.yaml`. Prove the store
  resolves it through `realpath`, stores the absolute root path, creates parent
  configuration directories, preserves sorted deterministic YAML, performs no
  write for an identical registration, and rejects a conflicting path with the
  old bytes unchanged. Inject a sibling-file publisher that fails before rename
  and prove the destination bytes remain unchanged.

- [ ] **Step 5: Run the tests and confirm the new registration cases fail**

  Run the Step 2 command. Expected: strict read cases pass and write cases fail
  because `register` is absent.

- [ ] **Step 6: Implement exclusive temporary write and atomic rename**

  Accept the already validated `caseId` unchanged, resolve the existing target
  root to its real absolute path, require the final two path segments to be
  `casegraph/root.yaml`, build and validate the complete next mapping, write a
  uniquely named sibling with `flag: "wx"`, then rename it over the destination.
  On failure, report the unpublished temporary path without deleting it. Return
  `"unchanged"` before creating a temporary file for identical registration.

- [ ] **Step 7: Run registration tests and record GREEN**

  Run the Step 2 command. Expected: all registration tests pass.

- [ ] **Step 8: Mark tasks 1.1 and 1.2 complete, commit, and push**

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
- Create: `src/casehomes/git-backed-casehome/inspect.ts`
- Create: `src/casehomes/git-backed-casehome/inspect.test.ts`

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
  bytes plus `git status --porcelain=v1`, `git show-ref`, remote configuration,
  and the registration bytes before inspection.

- [ ] **Step 2: Write failing report and immutability tests**

  Cover absent/empty/non-Git candidates and a committed exact primary repository
  with strict root, normal branch, detached HEAD, dirty state, multiple remotes,
  fetch/effective push URLs, tracked-root state, selected-remote structural
  readiness, registration state, and recovery inventory. Prove every snapshot
  from Step 1 is byte-identical after inspection.

- [ ] **Step 3: Write failing conflict tests**

  Cover a non-directory child, symlinked `casegraph`, outer/inherited Git root,
  mismatched nested top-level, bare repository, linked worktree primary, missing
  Git executable, missing or invalid strict root, and rooted resource-storage
  failure. Assert expected and actual paths appear where applicable.

- [ ] **Step 4: Run inspection tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/inspect.test.ts
  ```

  Expected: FAIL because inspection and Git boundaries do not exist.

- [ ] **Step 5: Implement the direct Git runner and exact inspection**

  Use `execFileResult("git", args, { cwd })`; never use a shell command. Derive
  the exact child without recursively scanning, reject symlink identity before
  following it, compare real paths to Git's `--show-toplevel`, distinguish a
  normal `.git` directory from a linked-worktree `.git` file/common directory,
  and read Git/remotes through explicit non-mutating commands. Load resources
  only through `openCaseHomeResources` and registration only through Task 1.
  Freeze copied arrays and nested report values.

- [ ] **Step 6: Run inspection tests and record GREEN**

  Run the Step 4 command. Expected: all exact-state, conflict, and immutability
  tests pass.

- [ ] **Step 7: Mark tasks 2.1 and 2.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/git.ts \
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
- Modify: `src/casehomes/git-backed-casehome/inspect.ts`

**Interfaces:**

- Consumes: `GitRunner`, `inspectGitBackedCaseHome`, `writeResourceDocument`,
  `openCaseHomeResources`, and `CaseResourceRegistry`.
- Produces: `prepareGitBackedCaseHome(input, dependencies): Promise<PreparedCaseHomeReport>` accepting `caseFolder`, `configHome`, validated `caseId`, validated
  strict `Case` resource, and `approveExistingNonGitCaseHome`.

- [ ] **Step 1: Write failing missing/empty preparation tests**

  Prove preparation creates a missing CaseFolder and child or uses an empty
  child, initializes Git only in `casegraph/`, writes deterministic `root.yaml`
  through the strict writer, reopens the rooted snapshot, and returns unborn
  uncommitted state with no remote or registration. Place unrelated files in
  the outer folder and prove bytes/status remain unchanged.

- [ ] **Step 2: Write failing adoption and conflict tests**

  Cover explicitly approved strict non-Git CaseHome adoption without root
  overwrite; declined adoption; caller/existing Case mismatch; invalid root;
  file/symlink child; inherited/mismatched repository; linked worktree; and Git
  initialization failure. For every failure, assert exact existing files,
  repository state, registration bytes, and recovery inventory.

- [ ] **Step 3: Run preparation tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/prepare.test.ts
  ```

  Expected: FAIL because preparation does not exist.

- [ ] **Step 4: Implement revalidated exact-child preparation**

  Reinspect immediately before mutation. Create only missing path components
  inside the selected CaseFolder, initialize Git in the exact child, use
  `writeResourceDocument` only when root is absent, compare a preserved existing
  strict resource to the supplied value, reopen with `openCaseHomeResources`,
  and return the current recovery report. Do not stage, commit, configure a
  remote, or write registration.

- [ ] **Step 5: Run preparation tests and record GREEN**

  Run the Step 3 command. Expected: all preparation and preservation tests pass.

- [ ] **Step 6: Mark tasks 3.1 and 3.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/prepare.ts \
    src/casehomes/git-backed-casehome/prepare.test.ts \
    src/casehomes/git-backed-casehome/inspect.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "feat(casehomes): prepare uncommitted repositories"
  git push
  ```

## Task 4: Push-Backed Finalization And Existing Registration

**Files:**

- Create: `src/casehomes/git-backed-casehome/finalize.ts`
- Create: `src/casehomes/git-backed-casehome/finalize.test.ts`
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

  Use an unreachable local remote to prove push failure leaves the local commit
  and no registration. Inject post-push resource and registration failures to
  prove the pushed commit remains, no partial registration is published, and
  each report distinguishes local-commit, pushed, and registered boundaries.
  Assert no recovery path deletes files, Git metadata, refs, remotes, or commits.

- [ ] **Step 4: Write failing existing-registration tests**

  Prove a committed tracked-root primary repository may register while dirty and
  remote-less, with registration eligibility true and mutation readiness false.
  Prove unborn, root-untracked-in-HEAD, root-only-staged, linked-worktree, bare,
  mismatched-root, and strict resource failures never register.

- [ ] **Step 5: Run finalization tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/finalize.test.ts
  ```

  Expected: FAIL because finalization and existing registration do not exist.

- [ ] **Step 6: Implement commit-push-revalidate-register sequencing**

  Reinspect every precondition, resolve the selected remote's effective push URL
  before `git add`, stage CaseHome contents, commit with the supplied message,
  capture the commit ID, and immediately run `git push --set-upstream <remote>
HEAD`. After successful push, reopen strict resources and reinspect Git, then
  call atomic registration last. Convert each failure boundary into a structured
  incomplete result with exact diagnostics and recovery inventory; never delete
  or compensate.

- [ ] **Step 7: Implement committed existing registration**

  Reuse exact inspection. Require a normal primary repository, `HEAD`, strict
  rooted CaseHome, and `git ls-tree` evidence that `root.yaml` is tracked in
  `HEAD`. Permit dirty and remote-less state, register atomically, then reinspect
  and report mutation readiness separately.

- [ ] **Step 8: Run all focused Issue #42 tests and record GREEN**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/registration.test.ts \
    src/casehomes/git-backed-casehome/inspect.test.ts \
    src/casehomes/git-backed-casehome/prepare.test.ts \
    src/casehomes/git-backed-casehome/finalize.test.ts
  ```

  Expected: every focused unit and local-bare-remote integration test passes.

- [ ] **Step 9: Prove the legacy import boundary**

  ```bash
  rg 'cases/workspaces|CaseHome|CaseLocator' \
    src/casehomes/git-backed-casehome
  ```

  Expected: no legacy imports or calls; occurrences in test descriptions or
  repository-domain type names must not name the legacy envelope types.

- [ ] **Step 10: Mark tasks 4.1 and 4.2 complete, commit, and push**

  ```bash
  git add src/casehomes/git-backed-casehome/finalize.ts \
    src/casehomes/git-backed-casehome/finalize.test.ts \
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
  a named test, including repository immutability and local bare-remote push.

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
  costs, no front-door routing leaks, no deferred `[~]` tasks, and the exact
  configured-push-versus-writability limitation.

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
