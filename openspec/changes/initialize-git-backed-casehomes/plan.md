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

- [ ] **Step 1: Extend strict registration classification tests**

  Retain the existing parser and immutability coverage. Add cases proving absence
  means `lstat` found no directory entry; valid and dangling symlinks,
  directories, and another non-regular entry at that exact path are rejected
  unchanged rather than treated as absent. Prove each canonical stored root
  target is a regular file and reject a directory, device, or other non-regular
  target. Assert every diagnostic identifies
  `<config-home>/casehomes.yaml` and the rejected entry or target type.

- [ ] **Step 2: Run registration tests and record RED**

  ```bash
  npm test -- src/casehomes/git-backed-casehome/registration.test.ts
  ```

  Expected: FAIL with the existing registration module because the new
  registry-entry cases expose missing `lstat`/type classification and the new
  canonical-root cases expose missing regular-file classification. The original
  missing-module RED remains historical evidence only in `task-1-report.md`.

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
  failure, and pre-rename publisher failure. Retain the existing cleanup-failure
  fixture whose acquired guard remains observable and prove it reports
  `retained`. Add a fixture that removes the acquired guard pathname before
  release and prove cleanup reports `absent/ownership-lost`, never `retained`.
  Inject failure of post-release guard-state inspection and prove cleanup reports
  `unknown`. Replace the acquired guard with a distinguishable entry and prove
  the replacement remains byte-identical while cleanup reports
  `absent/ownership-lost`.

  Run retained, absent/ownership-lost, and unknown cleanup cases both before and
  after registry publication as applicable. Inject validation failure plus
  cleanup failure and publication failure plus cleanup failure separately; prove
  each result retains the exact primary diagnostic, separately reports the
  cleanup diagnostic and guard path, reports truthful observed guard state,
  identifies exact publication state, and returns no false success. Assert no
  retry or fallback and prove a contender never removes the holder's guard.

- [ ] **Step 6: Run the tests and confirm the new registration cases fail**

  Run the Step 2 command. Expected: the new cleanup-state cases fail because the
  existing implementation treats any release rejection as retained and does not
  classify absent/ownership-lost or unknown state; previously covered
  registration behavior remains green.

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

  Record a distinguishable identity for the acquired guard. Before unlinking,
  leave any observably different replacement unchanged. After any release
  failure, inspect the pathname and classify it as `retained` only when the
  acquired identity remains, `absent/ownership-lost` when absent or replaced,
  and `unknown` when inspection fails. Never infer retention solely from release
  rejection. Preserve whether publication occurred and any primary diagnostic;
  do not retry, fall back, delete other state, or claim clean completion. When
  validation/publication and cleanup both fail, preserve the primary diagnostic
  and add the cleanup diagnostic, guard path, truthful guard-state
  classification, and exact publication state without masking either failure.
  Keep this identity handling within cooperative-writer scope.

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

- Modify: `src/resources/casehome-storage/casehome-resources.ts`
- Modify: `src/resources/casehome-storage/casehome-resources.test.ts`
- Create:
  `src/resources/casehome-storage/casehome-resources.path-observation.test.ts`
- Modify: `src/casehomes/git-backed-casehome/git.ts`
- Create: `src/casehomes/git-backed-casehome/git.test.ts`
- Verify unchanged: `src/casehomes/git-backed-casehome/index.ts`
- Modify: `src/casehomes/git-backed-casehome/inspect.ts`
- Modify: `src/casehomes/git-backed-casehome/inspect.test.ts`
- Create:
  `src/casehomes/git-backed-casehome/inspect.path-observation.test.ts`
- Verify unchanged: `src/cli.ts`
- Verify unchanged: `test/cli.test.ts`

**Interfaces:**

- Consumes: `CaseHomeRegistrationStore.read` from Task 1,
  `openCaseHomeResources`, and `CaseResourceRegistry`.
- Modifies: `CaseHomeResourceSnapshot` to expose immutable
  `documentPaths: readonly string[]` populated from already-opened rooted
  members.
- Produces: `GitRunner(args: readonly string[], cwd: string): Promise<CommandResult>`.
- Modifies: `createGitRunner()` internally to sanitize its child-process
  environment without changing `GitRunner`, accepting environment input, or
  exporting a test seam.
- Produces: `inspectGitBackedCaseHome(input, dependencies): Promise<CaseHomeRepositoryReport>` where the report is a discriminated immutable value with exact
  paths, resource state, repository state, remotes, structural push-target
  state, registration state, mutation readiness, diagnostics, and recovery
  inventory.
- Modifies: `CaseHomeResourceReport` with exact
  `{ state: "not-inspected"; diagnostic: string }` and `RepositoryReport` with
  that exact identity-failure variant while retaining
  `{ state: "unavailable"; diagnostic: string }` for Git failure.
- Modifies: `RepositoryReport` with the dedicated bare variant
  `{ state: "ineligible"; reason: "bare"; bare: true; gitDirectory: string; commonDirectory: string; commit?: string; unborn: boolean; branch?: string; detached: boolean; upstream?: string; remotes: readonly GitRemoteReport[] }`;
  it does not intersect worktree details and therefore has no `topLevel`,
  `dirty`, `rootTrackedInHead`, `expectedTopLevel`, `gitFile`, or other
  worktree-only field.
- Modifies: the existing non-bare ineligible `RepositoryReport` reason union to
  include `"git-symlink"` only after every required Git and remote inspection
  succeeds and establishes a non-bare repository. It adds no public field and
  retains truthful `expectedTopLevel`, observed `topLevel`, `gitDirectory`, and
  `commonDirectory`; its runtime object omits regular-file-only `gitFile`.
  Unavailable states take precedence for Git/tool/command/remote failure, and
  the dedicated bare variant takes precedence when inspection succeeds against
  linked bare metadata.
- Modifies: `RegistrationReport` with exact
  `{ state: "not-inspected"; diagnostic: string }` used only when rejected child
  identity makes strict registry validation unsafe.
- Modifies: unavailable recovery with
  `repositoryDiagnostic: string` equal to the unavailable repository diagnostic.
- Modifies: `structuralPushTarget` to the exact union
  `{ state: "known"; ready: boolean; remote?: string; pushUrls: readonly string[]; provesWritability: false } |
{ state: "not-inspected"; ready: false; remote?: string; diagnostic: string; provesWritability: false } |
{ state: "unavailable"; ready: false; remote?: string; diagnostic: string; provesWritability: false }`;
  the failure variants do not contain `pushUrls`.
- Modifies: `recovery.remotes` to
  `{ state: "known"; remotes: readonly GitRemoteReport[] } |
{ state: "not-inspected" | "unavailable"; diagnostic: string }`; an empty
  remote array exists only inside a positively established known state.
- Preserves: the production `openCaseHomeResources(caseHomePath, registry)`
  parameters and the exported `InspectGitBackedCaseHomeDependencies` and package
  API. No filesystem observer, counter, or test-only field enters production;
  the only approved resource API change is immutable `documentPaths` on the
  returned snapshot.

- [ ] **Step 1: Build real temporary Git fixture helpers in the test file**

  Use `git init`, `git add`, `git commit`, `git remote add`, and temporary local
  paths through `execFile`, with a test-local author identity. Snapshot file
  bytes plus raw index bytes, parsed `git status --porcelain=v1`,
  `git show-ref`, remote configuration, and the registration bytes before
  inspection. Add a stale-stat index fixture, a rooted graph whose discovery
  order differs from lexical document-path order, cycles/repeats, and an
  unreferenced canonical-looking resource. Add distinct repositories A and B
  with different roots, indexes, object/ref/common state, dirty/tracked-root
  state, and remotes, plus hostile global/system configuration that points from
  A toward B.
  Add a normal committed CaseHome fixture whose `.git` directory is moved to an
  external temporary path and replaced with a symbolic link. Snapshot the link,
  external metadata bytes, worktree bytes, index, refs, branch, remotes,
  upstream, and registration. Add real variants whose link is dangling, whose
  target is a non-Git directory, and whose target is bare Git metadata; snapshot
  every observable entry and applicable metadata before inspection.

- [ ] **Step 2: Write failing report and immutability tests**

  Cover absent/empty/non-Git candidates and a committed exact primary repository
  with strict root, normal branch, detached HEAD, dirty state, multiple remotes,
  fetch/effective push URLs, tracked-root state, selected-remote structural
  readiness, registration state, and recovery inventory. Prove every snapshot
  from Step 1 is byte-identical after inspection.

  In `casehome-resources.test.ts`, write REDs proving `documentPaths` contains
  the canonical root and all direct/transitive authoritative member documents
  once, cycles/repeats once, and unreferenced documents zero times. Prove the
  array is frozen and lexicographically sorted even when typed-selector
  discovery/traversal order differs, every entry has exact canonical
  containment, and lexical UID-derived segments carry no semantic membership
  priority.

  In the dedicated `casehome-resources.path-observation.test.ts`, install a
  hoisted Vitest mock/wrapper for `node:fs/promises` before dynamically importing
  `casehome-resources.ts` or `resource-document.ts`. Delegate to the real module
  while recording complete per-path call maps for `realpath`, `lstat`, and
  `readFile`, plus directory-enumeration calls. Combine those maps with the
  existing test-only
  `observeRegistryReads` read/inspection counters around exactly one
  `openCaseHomeResources` call.

  First record the exact already-required baseline call maps for the fixture.
  Then assert adding and reading `snapshot.documentPaths` leaves every
  `realpath`, `lstat`, and `readFile` per-path count exactly equal to that
  baseline. Assert each rooted canonical document has one raw `readFile` and one
  registry inspection during the single open, retains the existing registry
  read count, and the malformed unreferenced canonical-looking document has zero
  `readFile`, registry-read, and registry-inspection calls. Assert the directory-
  enumeration call map is unchanged and contains no resource-membership scan.
  In `inspect.test.ts`, prove recovery copies the snapshot paths exactly once
  and does not infer resource paths by scanning the CaseHome.

  Add a CaseFolder fixture that is itself a committed repository. With no exact
  child repository, assert inspection reports the inherited root as
  non-primary rather than primary or conflicting, while its files, index, refs,
  branches, remotes, and upstreams remain byte-identical. Assert every
  pre-existing outer-owned file byte and the raw outer index bytes are unchanged.

- [ ] **Step 3: Write failing conflict tests**

  Cover a non-directory child, symlinked `casegraph`, existing mismatched
  top-level, symbolic-link `.git` metadata, committed and unborn bare
  repositories, and three separate
  `.git`-file fixtures: linked
  worktree, `--separate-git-dir`, and submodule. Cover missing Git executable,
  missing or invalid strict root, and rooted resource-storage failure. Assert
  expected Git root/directory/common-directory paths appear where applicable.
  Record every complete Git argument array. Prove all repository-inspection Git
  invocations disable optional locks and a stale-stat fixture leaves raw index
  bytes unchanged. Before verb/subcommand checks, strip only an explicit
  allowlist of approved leading Git global options such as
  `--no-optional-locks`; do not drop arbitrary options. Prove current,
  different, conflicting-root, absent, and invalid registration states are
  reported and only current/absent non-conflicting state can remain registration-
  eligible when all repository prerequisites pass.

  For symlink and non-directory exact children, assert every named public field:
  `classification: "conflict"`; exact `paths`;
  `CaseHomeResourceReport { state: "not-inspected", diagnostic }`;
  `RepositoryReport { state: "not-inspected", diagnostic }`;
  `RegistrationReport { state: "not-inspected", diagnostic }`; false
  registration/mutation readiness; structural push target not inspected with no
  `pushUrls`; recovery remotes not inspected with no remote array; exact
  diagnostics; and recovery registration `"not-inspected"`. Inject a
  registration reader that fails if called and prove its call count remains
  zero. In the dedicated
  `inspect.path-observation.test.ts`, install hoisted test-local wrappers for
  `node:fs/promises` and the strict CaseHome resource module before dynamically
  importing `inspect.ts`. Prove the exact link entry receives one `lstat`, no
  target path receives `realpath`, `lstat`, `readdir`, or read/open access, the
  strict opener is never called. Do not add an observer field to
  `InspectGitBackedCaseHomeDependencies` or export any test seam.

  For Git unavailable with a safely identifiable normal child, assert every
  named field: `classification: "unavailable"`; canonical `paths`; truthful
  strict resource state; `RepositoryReport` with
  `{ state: "unavailable", diagnostic }`; independently inspected registration;
  unavailable structural push target with no `pushUrls`; false eligibility and
  mutation readiness; combined diagnostics; and recovery containing observed
  `documentPaths`/registration, no Git commit, and unavailable remotes with no
  remote array. Cover valid, invalid, and absent resources plus
  absent/current/different/conflicting-root/invalid registration, and prove
  `absent` is returned only after a successful registry read with no mapping.

  Add a table-driven injected-runner RED for every required Git result. Include
  absolute Git directory, common directory, bare-state, non-bare top-level,
  quiet HEAD verification with unexpected stderr, branch, status, committed-root
  `ls-tree`, upstream, remote list, and each fetch/push `remote get-url`. Each
  nonzero row must return repository/classification `"unavailable"`, identify
  that exact command in diagnostics, readiness reasons, and
  `recovery.repositoryDiagnostic`, preserve only already-observed recovery,
  execute no later Git command, and never report the failure as absent, unborn,
  detached, dirty, no-upstream, untracked root, no-remote, or empty URL.

  Add tuple-table REDs proving absent/non-Git is allowed only for
  `rev-parse --absolute-git-dir` when the exact `.git` entry is absent, exit is
  `128`, trimmed stdout is empty, and trimmed C-locale stderr is exactly one
  nonempty line beginning `fatal: not a git repository`. Vary the command,
  `.git` precondition, exit, stdout, locale/prefix, zero lines, and multiple
  nonempty lines independently; every mismatch must be unavailable. Prove
  unborn is allowed only for `rev-parse --verify --quiet HEAD`, exit `1`, and
  empty trimmed stdout/stderr; vary each element and require unavailable. Use
  `branch --show-current` and an exact branch `for-each-ref` upstream query that
  return exit-zero empty output to prove detached/no-upstream without nonzero
  fallback. Prove a bare result skips worktree inspection and every command it
  does execute, except the exact quiet-HEAD unborn tuple, succeeds.

  For committed and unborn bare fixtures, assert `classification: "conflict"`
  and the exact dedicated repository object. Require canonical Git/common
  directories, commit iff committed, unborn, branch/detached, upstream only from
  the successful ref query, and complete remotes. Assert with property-absence
  checks that `topLevel`, `dirty`, `rootTrackedInHead`, `expectedTopLevel`,
  `gitFile`, and every other worktree-only field are absent. Record complete Git
  arrays and require no show-toplevel, status, or `ls-tree` command. Assert
  registration eligibility and mutation readiness false for the exact bare
  reason, known structural/recovery remote unions after successful queries, and
  exact recovery commit presence/absence. Inject remote-name, fetch-URL, and
  push-URL failures separately; each must discard partial remotes and return
  repository/structural/recovery unavailable without invoking worktree commands.

  For every identity, Git-unavailable, and required-command-failure row, assert
  the exact `structuralPushTarget` and `recovery.remotes` discriminants and
  property absence: not-inspected for exact child identity conflicts;
  unavailable for Git/tool/command failures; no `pushUrls` or remote array on
  either failure state. Prove a positively established non-Git child and a
  successful empty remote-name query use known empty remote inventories.

  Make remote enumeration table-driven and atomic. Fail remote-name, a later
  remote's fetch URL, and a later remote's push URL after earlier values were
  observed. Each row discards every partial remote, returns repository,
  structural push target, and recovery remotes unavailable with the same
  diagnostic, and exposes no empty array as failed/skipped state.

  With the real external-`.git` symlink fixture, assert classification is
  `"conflict"`, repository state is non-bare and ineligible, reason is exactly
  `"git-symlink"`, and `gitFile` is absent.
  Assert canonical `expectedTopLevel` and observed `topLevel` both equal the
  CaseHome while `gitDirectory` and `commonDirectory` truthfully identify the
  external metadata paths. Require exact diagnostic and readiness text
  `Exact CaseHome uses an ineligible symbolic-link .git entry at <case-home>/.git`,
  and prove none contains
  `mismatched-top-level`, `does not equal`, or equal-path inequality text.
  Assert structural push and recovery remotes remain known after successful
  queries; recovery contains the `.git` link pathname, commit, and complete
  remotes. Snapshot comparison must prove the link, target, worktree, index,
  refs, branch, remotes, upstream, and registration unchanged. Add a second
  injected row with a differing observed top-level to prove the
  `git-symlink` reason still takes precedence without a new public field after
  successful non-bare inspection.

  Add a table for symbolic-link metadata precedence. Real dangling and non-Git
  targets and missing Git must produce unavailable state, and no absent/non-Git
  result from the allowed no-repository tuple because the exact `.git` entry
  exists. Then rerun the existing injected-runner failure table with the
  symbolic-link precondition for every required command: the Git availability
  probe, absolute Git directory, common directory, bare-state, HEAD, branch,
  upstream, non-bare top-level, status, committed-root `ls-tree`, remote-name
  enumeration, and the first and later remote's fetch-URL and push-URL queries.
  Every row must produce exact
  unavailable repository/classification/structural/recovery discriminants with
  the same diagnostic and no `git-symlink`, `mismatched-top-level`, bare variant,
  partial `RepositoryReport` field, `pushUrls`, or remote array. Each row must
  stop before later commands while preserving safely observed recovery paths,
  resource count, registration state, and commit iff HEAD succeeded before the
  injected failure.

  For the symlink plus later-remote rows, assert the exact bounded outcome:
  repository is only `{ state: "unavailable", diagnostic }`; structural push
  target and recovery remotes are unavailable with no arrays; recovery retains
  canonical CaseFolder/CaseHome, every safely observed present authoritative
  resource/config/lock path, the observed `.git` link pathname, resource count,
  registration state, and the earlier commit; `repositoryDiagnostic` equals the
  remote failure; and no partial remote or skipped-query fact appears. A real
  symbolic link to bare Git metadata with successful commands must produce only
  the dedicated bare
  variant/reason, omit every worktree-only property, skip `show-toplevel`,
  `status`, and `ls-tree`, and retain truthful known structural/recovery remote
  facts. Inject every applicable bare command and remote failure and require
  unavailable/atomic state rather than either ineligible reason. Every row
  proves link, target, metadata, worktree, and registration immutability and that
  no reason overrides an earlier unavailable or bare decision.

  In `git.test.ts`, exercise `createGitRunner()` without a public environment
  seam. Build distinguishable repositories A and B, then run A with ambient
  `GIT_DIR=B`, `GIT_WORK_TREE=A`, `GIT_INDEX_FILE=B`, `GIT_COMMON_DIR`,
  `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`,
  ref/config overrides, and hostile global/system configuration pointing to B.
  Also set mixed-case `Git_Dir` and `git_config_global` plus an arbitrary
  trace-producing `GIT_*` proof value. Prove the report
  contains only A's root/common dir/index/object/ref/branch/dirty/tracked-root/
  remote facts, the trace artifact is absent, and B cannot masquerade as or
  alter A. Use a test-local fake Git executable or equivalent child-environment
  observer, reached through the real preserved platform `PATH`/`Path`, to prove
  `Git_Dir`, `git_config_global`, and every other case variant whose uppercase
  form starts `GIT_` is absent. Prove the child Git environment gets only
  intentional `GIT_OPTIONAL_LOCKS=0`, `GIT_CONFIG_NOSYSTEM=1`,
  `GIT_CONFIG_GLOBAL=os.devNull`, and `LC_ALL=C` after ambient Git keys are
  removed. Keep environment setup sequential and restore the process
  environment in `finally`; add no public seam.

- [ ] **Step 4: Run inspection tests and record RED**

  ```bash
  npm test -- \
    src/resources/casehome-storage/casehome-resources.test.ts \
    src/resources/casehome-storage/casehome-resources.path-observation.test.ts \
    src/casehomes/git-backed-casehome/git.test.ts \
    src/casehomes/git-backed-casehome/inspect.test.ts \
    src/casehomes/git-backed-casehome/inspect.path-observation.test.ts
  ```

  Expected: FAIL against the delivered Task 2 boundary because required command
  failures collapse into false ordinary state, the permitted nonzero tuples are
  not exact, structural/recovery remote failure states still use empty arrays,
  remote enumeration exposes partial results, symlink/non-directory rejection
  still invokes strict registration, the bare variant computes worktree-only
  fields and commands, `.git` symlinks are mislabeled as mismatched top-level,
  and the default runner inherits ambient Git
  selectors/configuration including mixed-case keys. The original
  missing-boundary and recovery REDs remain historical evidence only in
  `task-2-report.md`.

- [ ] **Step 5: Implement the direct Git runner and exact inspection**

  Extend `CaseHomeResourceSnapshot` with a frozen lexicographically sorted copy
  of canonical authoritative document paths recorded as the root and each
  reachable member is already opened. Do not reread documents, inspect extra
  paths, scan directories, preserve/reference typed-selector discovery or
  traversal order, or assign semantic membership priority. Lexical sorting may
  visibly order UID-derived path segments. Copy those paths into recovery
  exactly once.

  Use `execFileResult("git", args, { cwd, env })`; never use a shell command.
  Build `env` by copying required non-Git process values including the
  platform's real `PATH`/`Path`, deleting every key for which the
  platform-equivalent of `key.toUpperCase().startsWith("GIT_")` is true, then
  setting only `GIT_OPTIONAL_LOCKS=0`,
  `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=os.devNull`, and `LC_ALL=C`.
  Retain explicit no-optional-lock command arguments. Do not add a public
  environment/test seam.

  Replace generic undefined/false/empty fallbacks with command-specific result
  classification. Recognize absent/non-Git only for
  `rev-parse --absolute-git-dir` with absent exact `.git`, exit `128`, empty
  trimmed stdout, and exactly one nonempty trimmed C-locale stderr line beginning
  `fatal: not a git repository`. Recognize unborn only for
  `rev-parse --verify --quiet HEAD`, exit `1`, and empty trimmed stdout/stderr.
  Use exit-zero empty `branch --show-current` and branch `for-each-ref` upstream
  queries. Inspect bare state before worktree commands. For bare repositories,
  skip show-toplevel, status, and committed-root `ls-tree`; populate only the
  dedicated ineligible-bare repository fields and classify the enclosing report
  as conflict. Any tuple mismatch or other required nonzero result returns
  unavailable with command/exit/stderr context, false readiness, bounded
  recovery carrying the same `repositoryDiagnostic`, and no later Git call or
  inferred fact.

  Implement the exact structural push-target and recovery-remotes discriminated
  unions from the interface section. Identity conflicts use not-inspected;
  Git/tool/command failures use unavailable; neither variant contains an empty
  `pushUrls` or remote array. Positively established non-Git or no-remotes state
  may use known empty arrays. Accumulate remote names and URLs privately and
  publish them only after every required query succeeds; any failure discards
  all partial remote data and makes repository, structural push target, and
  recovery remote inventory unavailable with one diagnostic.

  For a successfully inspected bare repository, keep structural push target and
  recovery remotes known from the complete remote inventory while setting
  registration eligibility and mutation readiness false for the bare reason.
  Copy the commit into recovery only when committed; omit it when unborn.

  Preserve `isSymbolicLink()` from the exact `.git` `lstat` in the internal Git
  entry observation. Do not classify the observed link until every required Git
  and remote query succeeds. A missing tool, dangling/non-Git target, or any
  required command/remote failure returns the existing unavailable report and
  publishes no partial `RepositoryReport`, `pushUrls`, or remote array while
  retaining safely observed recovery paths, resource count, registration state,
  and commit. If successful inspection establishes bare metadata, return only
  the dedicated bare variant. Otherwise, after successful non-bare inspection
  and before genuine top-level mismatch classification, return the existing
  non-bare ineligible shape with reason `"git-symlink"` for that entry. Keep observed
  `expectedTopLevel`, `topLevel`, `gitDirectory`, `commonDirectory`, commit,
  branch, upstream, and complete remote facts unchanged. Produce one
  exact diagnostic/readiness reason,
  `Exact CaseHome uses an ineligible symbolic-link .git entry at <case-home>/.git`,
  in diagnostics plus registration and mutation readiness. Include the observed
  `.git` link path plus existing commit/remotes in recovery. Do not add a public
  field or seam, accept the link as primary, set the regular-file-only `gitFile`
  property, or use the link during any mutation boundary.

  Derive the exact child without recursively scanning and reject symlink
  identity before following it. For a non-bare worktree candidate, compare real
  paths to Git's `--show-toplevel` and report an inherited outer root as
  non-primary. Reject every `.git` file regardless of whether it names a linked
  worktree, separate Git directory, or submodule.
  Read Git/remotes through explicit non-mutating commands. Load resources only
  through `openCaseHomeResources` and registration only through Task 1. Treat
  different and conflicting-root registration as ineligible. For symlink or
  non-directory identity failure, return resource, repository, and registration
  not inspected without calling the strict registry reader. When Git alone is
  unavailable, inspect a safely identifiable child's strict resources and
  registration and mark only the repository unavailable. Populate every named
  public report field and inventory only safely observed entries; never read a
  rejected child target. Freeze copied arrays and nested report values. Export
  inspection from the package entry point without changing `src/cli.ts` or
  entering Task 3.

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

- [ ] **Step 7: Run GREEN and discriminating mutation proofs**

  Run the Step 4 command. Expected: all exact-state, snapshot, recovery,
  conflict, and immutability tests pass.

  Temporarily return discovery-order paths without sorting; rerun the focused
  storage test and require only the lexical-order witness to fail. Restore, then
  temporarily append a canonical-looking unreferenced document path; require
  the unreferenced-zero witness to fail. Restore, then introduce a directory
  enumeration call and require only the no-scan call-map witness to fail.
  Restore,
  then temporarily add one extra per-document `realpath`, rerun the dedicated
  resource observation module, and require only its reason-specific `realpath`
  call-map witness to fail. Repeat separately for one extra per-document `lstat`
  and one extra per-document `readFile`, requiring only the matching counter
  witness to fail each time while every nonmatching call-map and result assertion
  stays green. Restore after each mutation. Then temporarily omit optional lock
  disabling from inspection; require the stale-stat raw-index witness to fail.
  Feed the command audit
  `['--no-optional-locks', 'remote', 'add', 'origin', 'forbidden']` and require
  the normalized forbidden-command witness to fail.

  Mutation-proof the new failure matrix separately: temporarily convert an
  absolute-Git-directory failure to absent, a status failure to dirty, an
  unexpected HEAD failure to unborn, and a remote/get-url failure to no
  remote/empty URL; each mutation must fail only its matching table row and the
  no-later-facts assertion. Separately relax each no-repository and unborn tuple
  member, add `pushUrls: []` or `remotes: []` to failure variants, and publish a
  partial first remote before a later URL failure; each mutation must fail only
  its exact tuple, property-absence, or atomic-enumeration witness. Restore after
  each. Temporarily run show-toplevel, status, or `ls-tree` for bare fixtures;
  require only the matching forbidden-command witness to fail. Separately add
  one worktree-only property to the bare report and require only its
  property-absence witness to fail; then collapse a bare remote failure into the
  ineligible variant and require the unavailable/atomic witness to fail. Restore
  after each. Temporarily discard `.git` `isSymbolicLink()` state or route it to
  `"mismatched-top-level"`; require only the real-fixture reason, diagnostic,
  readiness, recovery, and equal-path no-mismatch witnesses to fail while
  regular gitfile and genuine mismatch cases stay green. Then temporarily force
  `"git-symlink"` immediately after the symlink `lstat`, before any Git command,
  and require every symbolic-link-precondition command/remote failure row to
  fail its unavailable, command-stop, exact `RepositoryReport`, remote-array,
  and bounded-recovery assertions. Separately publish earlier Git details or a
  partial remote array after a later remote failure and require only the exact
  property-absence/atomic rows to fail while safe recovery path, resource,
  registration, and commit assertions stay green. Force `"git-symlink"` after a
  real linked-bare inspection and require only the bare shape, forbidden-command,
  and field-absence rows to fail. Restore after each mutation. Temporarily
  call the strict
  registration reader on a symlink/non-directory exit and require the
  registration-zero-call and target-zero-access witnesses to fail. Finally pass
  ambient `process.env` unchanged and require the A/B, hostile-config,
  mixed-case-key, and trace-artifact isolation witnesses to fail while the
  ordinary clean-environment and real-`PATH` case remain green. Then make the
  filter case-sensitive and require only the mixed-case observer witness to
  fail. Restore production after every mutation and rerun the complete focused
  GREEN.

- [ ] **Step 8: Mark tasks 2.1 and 2.2 complete, commit, and push**

  ```bash
  git add src/resources/casehome-storage/casehome-resources.ts \
    src/resources/casehome-storage/casehome-resources.test.ts \
    src/resources/casehome-storage/casehome-resources.path-observation.test.ts \
    src/casehomes/git-backed-casehome/git.ts \
    src/casehomes/git-backed-casehome/git.test.ts \
    src/casehomes/git-backed-casehome/inspect.ts \
    src/casehomes/git-backed-casehome/inspect.test.ts \
    src/casehomes/git-backed-casehome/inspect.path-observation.test.ts \
    openspec/changes/initialize-git-backed-casehomes/tasks.md
  git commit -m "fix(casehomes): require exact Git inspection state"
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
  in full. Normalize only approved leading Git global options before identifying
  the verb and subcommand, then assert:

  ```typescript
  const approvedLeadingGitOptions = new Set(["--no-optional-locks"]);
  const normalizeGitCommand = (args: readonly string[]): readonly string[] => {
    let verbIndex = 0;
    while (approvedLeadingGitOptions.has(args[verbIndex] ?? "")) verbIndex += 1;
    return args.slice(verbIndex);
  };

  expect(
    recordedGitArgs
      .map(normalizeGitCommand)
      .some(
        (args) =>
          args[0] === "remote" && (args[1] === "add" || args[1] === "set-url"),
      ),
  ).toBe(false);
  ```

  This assertion checks the actual argument structure and therefore catches
  `['remote', 'add', ...]`, `['remote', 'set-url', ...]`, and the same forbidden
  commands after approved leading global options. Mutation-proof the audit by
  appending
  `['--no-optional-locks', 'remote', 'add', 'origin', 'forbidden']` to the
  recorded arrays and require the assertion to fail; then restore the untouched
  recorded stream. Also run:

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
  non-regular-entry cases, `retained`, `absent/ownership-lost`, and `unknown`
  cleanup assertions, foreign-replacement preservation, and dual
  primary-plus-cleanup diagnostic assertions before Task 1 or the change may be
  accepted.

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
