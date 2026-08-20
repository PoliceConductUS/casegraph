# External Case Package Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let CaseGraph create, reopen, validate, and use an explicitly selected
external case home while resolving ordered external package roots without
copying case material into the repository.

**Architecture:** Add two strict Kubernetes-style document contracts:
`CaseLocator` for machine-local case discovery and `CaseHome` for the selected
home's canonical `root.yaml`. Each type has one owning reader/writer. All
existing case operations resolve a typed `ResolvedCaseWorkspace` before reading
or writing; package-path changes flow only through the `CaseHome` writer.

**Tech Stack:** Node.js 26, TypeScript 6, Vitest 4, Zod 4, Commander 14,
`yaml@2.9.0`, filesystem-backed YAML.

**Spec:** `openspec/changes/support-external-case-package-paths/design.md` and
`openspec/changes/support-external-case-package-paths/specs/`

## Global Constraints

- Every new root document uses
  `apiVersion: policeconduct.org/casegraph/v1alpha1`, `kind`,
  `metadata.name`, and a strict kind-specific `spec`.
- `CaseLocator` and `CaseHome` each have one owning reader/writer; callers never
  parse or serialize those roots directly.
- `CaseLocator.spec.home` is a canonical absolute path ending in `root.yaml`.
- `CaseHome.spec.packagePath` is ordered; relative entries resolve from the
  case home.
- Package-path membership, order, and filesystem permissions do not grant
  managed-write authority.
- `--yes` authorizes only creation of the selected directory and `root.yaml`.
- Unexpected positional tokens are hard errors.
- No legacy root fallback, repository-local workspace fallback, shared-package
  authorization field, package-reference resolver, or new show/list/validate
  command is added.
- After every commit run `git town sync --non-interactive` before the next task.

---

### Task 1: Strict `CaseLocator` and `CaseHome` Documents

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/cases/workspaces/case-locator-document.ts`
- Create: `src/cases/workspaces/case-locator-document.test.ts`
- Create: `src/cases/workspaces/case-home-document.ts`
- Create: `src/cases/workspaces/case-home-document.test.ts`

**Interfaces:**

- Produces:
  `readCaseLocator(rootPath): Promise<CaseLocator>` and
  `writeCaseLocator(rootPath, value): Promise<void>`.
- Produces:
  `readCaseHome(rootPath): Promise<CaseHome>` and
  `writeCaseHome(rootPath, operation): Promise<void>`.
- `CaseHomeWriteOperation` is a discriminated union with `create` and
  `replacePackagePath` operations so all serialization remains behind one
  writer.

- [ ] **Step 1: Add failing `CaseLocator` contract tests**

  Create tests that write this exact valid fixture, assert the parsed value,
  and separately reject wrong API version, wrong kind, missing
  `metadata.name`, relative `spec.home`, unknown fields, and malformed YAML:

  ```yaml
  apiVersion: policeconduct.org/casegraph/v1alpha1
  kind: CaseLocator
  metadata:
    name: example-v-example-city
  spec:
    home: /cases/example-v-example-city/root.yaml
  ```

- [ ] **Step 2: Verify the `CaseLocator` tests fail for the missing module**

  Run:
  `npm test -- src/cases/workspaces/case-locator-document.test.ts`

  Expected: FAIL because the `CaseLocator` contract does not exist.

- [ ] **Step 3: Install the checked stable YAML dependency**

  Run: `npm install yaml@2.9.0`

- [ ] **Step 4: Implement the strict `CaseLocator` reader/writer**

  Define and export this public shape:

  ```ts
  export const CASEGRAPH_API_VERSION =
    "policeconduct.org/casegraph/v1alpha1" as const;

  export const CaseLocatorSchema = z
    .object({
      apiVersion: z.literal(CASEGRAPH_API_VERSION),
      kind: z.literal("CaseLocator"),
      metadata: z.object({ name: z.string().min(1) }).strict(),
      spec: z
        .object({
          home: z
            .string()
            .refine(path.isAbsolute)
            .refine((value) => path.basename(value) === "root.yaml"),
        })
        .strict(),
    })
    .strict();
  ```

  `readCaseLocator` must use `parseDocument`, reject `document.errors`, and
  strict-parse `document.toJS()`. `writeCaseLocator` must strict-parse before
  writing with `{ flag: "wx" }`.

- [ ] **Step 5: Run the locator tests and confirm green**

  Run:
  `npm test -- src/cases/workspaces/case-locator-document.test.ts`

  Expected: PASS.

- [ ] **Step 6: Add failing `CaseHome` contract tests**

  Test this exact valid fixture and reject wrong envelope discriminators,
  unknown fields, non-ISO timestamps, an altered graph-root identity, and a
  non-string `packagePath` entry:

  ```yaml
  apiVersion: policeconduct.org/casegraph/v1alpha1
  kind: CaseHome
  metadata:
    name: example-v-example-city
  spec:
    graphRoot:
      type: node
      kind: case
      id: root
    packagePath: []
    createdAt: "2026-08-20T00:00:00.000Z"
    updatedAt: "2026-08-20T00:00:00.000Z"
  ```

  Also test that `replacePackagePath` preserves YAML comments, validates the
  temporary document through `readCaseHome`, atomically replaces `root.yaml`,
  and leaves the original unchanged when the proposed list is invalid.

- [ ] **Step 7: Verify the `CaseHome` tests fail for the missing module**

  Run: `npm test -- src/cases/workspaces/case-home-document.test.ts`

  Expected: FAIL because the `CaseHome` contract does not exist.

- [ ] **Step 8: Implement the strict `CaseHome` reader/writer**

  Use strict schemas for the envelope, metadata, graph root, and source
  references. Define the only write entry point as:

  ```ts
  export type CaseHomeWriteOperation =
    | { type: "create"; value: CaseHome }
    | { type: "replacePackagePath"; packagePath: readonly string[] };

  export async function writeCaseHome(
    rootPath: string,
    operation: CaseHomeWriteOperation,
  ): Promise<void>;
  ```

  For `replacePackagePath`, use the YAML Document API to set
  `spec.packagePath`, write a sibling temporary file, validate that file with
  `readCaseHome`, and rename it over the original. Remove the temporary file if
  validation or rename fails, without changing the original.

- [ ] **Step 9: Run both document test files and confirm green**

  Run:
  `npm test -- src/cases/workspaces/case-locator-document.test.ts src/cases/workspaces/case-home-document.test.ts`

  Expected: PASS.

- [ ] **Step 10: Format, lint, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add package.json package-lock.json src/cases/workspaces
  git commit -m "feat(workspaces): add typed case root documents"
  git town sync --non-interactive
  ```

### Task 2: Explicit Case-Home Creation and Locator Registration

**Files:**

- Create: `src/cases/workspaces/create.ts`
- Create: `src/cases/workspaces/create.test.ts`
- Modify: `src/cases/new/command.ts`
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**

- Consumes: `writeCaseHome`, `readCaseHome`, `writeCaseLocator`, and
  `readCaseLocator` from Task 1.
- Produces:

  ```ts
  export type CreationRequest =
    | { type: "createHomeDirectory"; path: string }
    | { type: "createCaseHomeRoot"; path: string };

  export type WorkspaceRuntime = {
    casegraphHome?: string;
    approveCreation?: (request: CreationRequest) => Promise<boolean>;
  };

  export async function createCaseWorkspace(
    input: {
      caseId: string;
      cwd: string;
      home: string | undefined;
      yes: boolean;
    },
    runtime?: WorkspaceRuntime,
  ): Promise<CommandResult>;
  ```

- [ ] **Step 1: Replace the old creation tests with failing external-home tests**

  In `test/cli.test.ts`, first add tests for required `--home`, relative-home
  resolution, approved missing-directory creation, approved root creation in an
  empty directory, `--yes`, declined prompts, rejection of a nonempty
  uninitialized directory, attachment to a matching existing `CaseHome`,
  case-insensitive locator collision, and rejection of a mismatched home name.

  Inject `casegraphHome: path.join(workingDirectory, ".casegraph")` and an
  `approveCreation` spy instead of writing to the real home directory.

- [ ] **Step 2: Verify the creation tests fail for the old repo-local behavior**

  Run:
  `npm test -- test/cli.test.ts -t "casegraph cases new"`

  Expected: FAIL because `--home`, typed roots, and the locator are absent.

- [ ] **Step 3: Implement directory preparation and typed root registration**

  Resolve a relative `--home` from `cwd`, canonicalize it with
  `path.resolve`, and use `path.join(os.homedir(), ".casegraph")` only when
  `runtime.casegraphHome` is absent. Check the complete selected-directory
  state before mutation.

  New packages must use:

  ```ts
  {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseHome",
    metadata: { name: caseId },
    spec: {
      graphRoot: { type: "node", kind: "case", id: "root" },
      packagePath: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }
  ```

  Register the locator only after `readCaseHome` validates the selected root.
  Existing matching `CaseHome` files are read and attached without rewriting.

- [ ] **Step 4: Wire exact CLI arguments and output**

  Define Commander arguments as one optional case ID plus no accepted extra
  positionals, `.requiredOption("--home <directory>")`, and `.option("--yes")`.
  Preserve the existing invalid-ID suggestions while including `--home
<directory>` in rerun guidance.

  Success output must show the absolute selected home directory, its
  `root.yaml`, the locator root, and `External package roots: none`.

- [ ] **Step 5: Run creation tests and the complete CLI test file**

  Run:

  ```bash
  npm test -- test/cli.test.ts -t "casegraph cases new"
  npm test -- test/cli.test.ts
  ```

  Expected: both commands pass. Keep existing non-creation fixtures unchanged
  until Task 4 migrates their command paths, so this checkpoint remains green.

- [ ] **Step 6: Format, lint changed code, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add src/cases/workspaces/create.ts src/cases/workspaces/create.test.ts src/cases/new/command.ts src/cli.ts test/cli.test.ts
  git commit -m "feat(cases): create explicit external case homes"
  git town sync --non-interactive
  ```

### Task 3: Strict Case Loading and Package-Path Repair

**Files:**

- Create: `src/cases/workspaces/load.ts`
- Create: `src/cases/workspaces/load.test.ts`
- Modify: `src/cases/workspaces.ts`

**Interfaces:**

- Consumes: both typed readers and the `CaseHome` writer.
- Extends `WorkspaceRuntime` with:

  ```ts
  requestPackagePathReplacement?: (request: {
    caseId: string;
    homeRoot: string;
    missingStoredPath: string;
  }) => Promise<string | undefined>;
  approvePackagePathReplacement?: (request: {
    oldStoredPath: string;
    newStoredPath: string;
    homeRoot: string;
  }) => Promise<boolean>;
  ```

- Produces:

  ```ts
  export type ResolvedCaseWorkspace = {
    caseId: string;
    locatorRoot: string;
    homeRoot: string;
    homeDirectory: string;
    graphRoot: CaseGraphRoot;
    packagePath: readonly string[];
    resolvedPackagePath: readonly string[];
  };

  export async function loadCaseWorkspace(
    caseId: string,
    cwd: string,
    runtime: WorkspaceRuntime,
    options: { requireWritableHome: boolean },
  ): Promise<ResolvedCaseWorkspace | CommandResult>;
  ```

- [ ] **Step 1: Add failing loader tests**

  Cover: valid load, absent locator, invalid locator, mismatched locator
  directory/name, absent home root, invalid home root, mismatched home name,
  unreadable home, non-writable home for a write operation, relative and
  absolute package roots, missing package root without prompts, invalid
  replacement, declined replacement, confirmed replacement, duplicate
  replacement, and atomic preservation after a failed repair.

- [ ] **Step 2: Verify the loader tests fail for the missing loader**

  Run: `npm test -- src/cases/workspaces/load.test.ts`

  Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement ordered validation and repair**

  Load in this exact order: locator file, locator identity, home root,
  home identity, optional writable-home precondition, then every ordered
  `spec.packagePath` entry. Resolve stored relative entries from
  `homeDirectory`; resolve prompt answers from `cwd`.

  A confirmed repair converts the replacement to a relative path with
  `path.relative(homeDirectory, replacement)` when that result is nonempty;
  otherwise it stores the canonical absolute path. Revalidate the complete
  rewritten `CaseHome` and restart package-path validation before returning.

- [ ] **Step 4: Migrate omitted-case discovery to locators**

  Replace repo-local scanning in `src/cases/workspaces.ts` with sorted
  `CaseLocator` directory enumeration under `casegraphHome`. A candidate is
  valid only when `loadCaseWorkspace` succeeds without mutation. Keep the
  existing zero-case and multiple-case command-result behavior, but update the
  creation guidance to include `--home <directory>`.

- [ ] **Step 5: Run loader and omitted-case tests**

  Run:

  ```bash
  npm test -- src/cases/workspaces/load.test.ts
  npm test -- test/cli.test.ts -t "omitted case"
  ```

  Expected: PASS.

- [ ] **Step 6: Format, lint, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add src/cases/workspaces/load.ts src/cases/workspaces/load.test.ts src/cases/workspaces.ts test/cli.test.ts
  git commit -m "feat(workspaces): resolve external case homes"
  git town sync --non-interactive
  ```

### Task 4: Migrate Every Existing Case Operation

**Files:**

- Modify: `src/cases/add/document/command.ts`
- Modify: `src/cases/add/evidence/command.ts`
- Modify: `src/cases/analysis/new/command.ts`
- Modify: `src/cases/report/command.ts`
- Modify: `src/cases/graph/records.ts`
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**

- Consumes: `loadCaseWorkspace`, `resolveOnlyCaseId`, and `WorkspaceRuntime`.
- Changes `readGraphNodes` to receive the already validated root graph node:

  ```ts
  export async function readGraphNodes(
    homeDirectory: string,
    rootNode: CaseNode,
  ): Promise<ParsedGraphNode[]>;
  ```

- [ ] **Step 1: Convert the shared CLI fixture to typed external roots**

  Replace `writeValidCaseRoot(workingDirectory, caseId)` with a helper that
  creates a unique external home, writes a valid `CaseHome`, and writes a valid
  `CaseLocator` beneath the injected configuration home. Return the absolute
  home directory so tests stop joining `cwd/workspace/<case-id>`.

- [ ] **Step 2: Add failing pre-operation validation tests for every command**

  For add-document, add-evidence, analysis-new, analysis-resume, and report,
  add one test proving a missing `spec.packagePath` directory prevents the
  command's read or write. For each write command, assert the intended output
  file is absent after failure.

- [ ] **Step 3: Verify these command tests fail under direct repo-local access**

  Run:
  `npm test -- test/cli.test.ts -t "external case home|package path blocks"`

  Expected: FAIL because commands still join `cwd/workspace/<case-id>`.

- [ ] **Step 4: Route command entry points through the loader**

  Add `WorkspaceRuntime` to the affected command signatures and pass the CLI
  runtime from `runCasegraph`. Use `resolved.homeDirectory` for every case file
  read/write. Set `requireWritableHome: true` for add-document, add-evidence,
  analysis-new, and analysis-resume; use `false` for report.

  Remove every local `validCaseWorkspace`, `isRootCaseNode`, and repo-local
  `workspaceDisplayPath` check. Errors must identify the requested case ID and
  absolute home/locator path rather than inventing a repo-local path.

- [ ] **Step 5: Keep root parsing behind the `CaseHome` reader**

  Make `readGraphNodes` skip filesystem `root.yaml`, prepend the supplied
  `CaseNode` as `{ fileStem: "root", node: rootNode }`, and continue parsing
  existing non-root graph records under their current contracts. No graph
  reader may parse the `CaseHome` envelope.

- [ ] **Step 6: Run the complete CLI and graph tests**

  Run:

  ```bash
  npm test -- test/cli.test.ts
  npm test -- src/cases/import/courtlistener/docket/docket.test.ts
  ```

  Expected: PASS except CourtListener write-import tests intentionally migrated
  in Task 6.

- [ ] **Step 7: Format, lint, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add src/cases/add src/cases/analysis/new/command.ts src/cases/report/command.ts src/cases/graph/records.ts src/cli.ts test/cli.test.ts
  git commit -m "refactor(cases): load operations from case homes"
  git town sync --non-interactive
  ```

### Task 5: Ordered `packages add` Command

**Files:**

- Create: `src/cases/packages/add/command.ts`
- Create: `src/cases/packages/add/command.test.ts`
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**

- Consumes: `loadCaseWorkspace` and the `replacePackagePath` operation of the
  `CaseHome` writer.
- Produces:

  ```ts
  export async function runPackagesAddCommand(
    args: readonly string[],
    cwd: string,
    runtime: WorkspaceRuntime,
  ): Promise<CommandResult>;
  ```

- [ ] **Step 1: Add failing command tests**

  Cover root/packages/packages-add help, one path, multiple supplied paths in
  order, missing case ID, no path, missing directory, non-directory, duplicate
  of an existing entry, duplicate within the batch, no partial write after any
  invalid batch, and relative storage that resolves to the supplied canonical
  directory.

- [ ] **Step 2: Verify command tests fail for the missing command**

  Run:
  `npm test -- src/cases/packages/add/command.test.ts test/cli.test.ts -t "packages add|packages help"`

  Expected: FAIL because the root-level `packages` group does not exist.

- [ ] **Step 3: Implement whole-batch validation before writing**

  Require at least two tokens: `<case-id>` followed by one or more paths. Load
  the case with `requireWritableHome: true`. Resolve every supplied path from
  `cwd`, require `stat().isDirectory()`, canonicalize with `realpath`, and
  compare canonical identities against both existing resolved entries and the
  current batch.

  Only after the complete batch passes, append stored relative forms to the
  current list and call `writeCaseHome` exactly once.

- [ ] **Step 4: Wire root-level CLI help and exact Commander shape**

  Add `packages` beside `cases`, and `packages add <case-id> <path>...` beneath
  it. Do not add a `cases packages` alias. Unexpected flags or missing tokens
  must return the add-command help and make no change.

  Success output must show the absolute case-home root and the complete ordered
  list of resolved external package roots, satisfying Issue #1 visibility
  without adding Issue #6's broader inspection commands.

- [ ] **Step 5: Run focused and complete CLI tests**

  Run:

  ```bash
  npm test -- src/cases/packages/add/command.test.ts
  npm test -- test/cli.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Format, lint, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add src/cases/packages/add src/cli.ts test/cli.test.ts
  git commit -m "feat(packages): add ordered external roots"
  git town sync --non-interactive
  ```

### Task 6: CourtListener Write Import Into Selected Case Home

**Files:**

- Modify: `src/cases/import/courtlistener/docket/types.ts`
- Modify: `src/cases/import/courtlistener/docket/command.ts`
- Modify: `src/cases/import/courtlistener/docket/graph-records.ts`
- Modify: `src/cases/import/courtlistener/docket/docket.test.ts`
- Modify: `src/cli.ts`
- Modify: `test/cli.test.ts`

**Interfaces:**

- Consumes: `WorkspaceRuntime`, typed writers, and the explicit-home creation
  checks.
- `writeImportedGraphRecords` no longer writes `root.yaml`; it writes only
  non-root graph records and returns the strict `CaseGraphRoot` source data the
  `CaseHome` writer receives.

- [ ] **Step 1: Add failing import tests**

  Cover: dry-run without home, explicit dry-run without home, write without
  home, write with approved missing home, `--yes`, declined creation, existing
  locator collision, selected-home history paths, typed `CaseHome` root source
  references, matching `CaseLocator`, and absence of repo-local output.

- [ ] **Step 2: Verify import tests fail for repo-local write behavior**

  Run:

  ```bash
  npm test -- src/cases/import/courtlistener/docket/docket.test.ts
  npm test -- test/cli.test.ts -t "CourtListener.*home|import.*home"
  ```

  Expected: FAIL because write import does not accept `--home`.

- [ ] **Step 3: Parse write-only home requirements**

  Extend the import command options with `--home <directory>` and `--yes`.
  Dry-run remains valid without home. A write without home fails before
  filesystem mutation. Preserve the existing mutual-exclusion, hard-token,
  token-redaction, and API behavior.

- [ ] **Step 4: Write import data under the selected home**

  After fetch and case-ID derivation, perform the same selected-directory and
  locator collision checks used by `cases new`. Write mutation history and
  non-root graph records into the prepared home. Then create the `CaseHome`
  through its sole writer with the imported source references in
  `spec.graphRoot`, validate it, and create the `CaseLocator` last.

  A failure before locator creation must report the partially written selected
  home and must not delete user-approved files automatically.

- [ ] **Step 5: Run all import and CLI tests**

  Run:

  ```bash
  npm test -- src/cases/import/courtlistener/docket/docket.test.ts
  npm test -- test/cli.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Format, lint, commit, and sync**

  Run:

  ```bash
  npm run format
  npm run lint
  git add src/cases/import/courtlistener/docket src/cli.ts test/cli.test.ts
  git commit -m "feat(import): write CourtListener cases to selected homes"
  git town sync --non-interactive
  ```

### Task 7: Production Prompts, Full Validation, and Issue Evidence

**Files:**

- Modify: `src/cli.ts`
- Modify: `README.md`
- Modify: `openspec/changes/support-external-case-package-paths/tasks.md`
- Create: `openspec/changes/support-external-case-package-paths/verify.md`

**Interfaces:**

- Consumes all prior tasks.
- Produces the production TTY callbacks for creation and missing-path repair.

- [ ] **Step 1: Add failing tests for production-independent prompt decisions**

  Keep terminal I/O outside domain functions. Test injected callbacks proving
  an empty answer declines, a supplied replacement is normalized from the
  invocation directory, and the final old/new confirmation is required before
  a `CaseHome` rewrite.

- [ ] **Step 2: Verify prompt tests fail before final wiring**

  Run: `npm test -- test/cli.test.ts -t "creation prompt|repair prompt"`

  Expected: FAIL for the missing production callback behavior.

- [ ] **Step 3: Implement TTY prompt callbacks in `main`**

  Reuse one `node:readline/promises` interface per prompt. If stdin is not a
  TTY, return decline/undefined so the domain operation fails visibly. Creation
  prompts must name the exact directory or root. Repair must display the case
  ID, missing stored path, home root, proposed stored replacement, and require
  an explicit yes before writing.

- [ ] **Step 4: Update only user-facing documentation affected by this issue**

  Replace repo-local `cases new` examples in `README.md` with explicit-home
  examples and document `casegraph packages add <case-id> <path>...`. State
  that external roots remain read-only and that managed-write authorization is
  not yet supported.

- [ ] **Step 5: Run fresh full repository validation**

  Run: `npm run validate`

  Expected: formatting, lint, all tests, typecheck, build, and strict OpenSpec
  validation pass with zero failures.

- [ ] **Step 6: Record evidence and complete task checkboxes**

  In `verify.md`, record the date, exact validation command, test count,
  OpenSpec count, branch name, and any dependency audit warning without claiming
  it was fixed. Mark `tasks.md` items complete only when their evidence exists.

- [ ] **Step 7: Review the diff against the issue and explicit non-goals**

  Confirm by search that production code no longer joins
  `cwd/workspace/<case-id>`, no module outside the two document owners parses or
  writes their roots, no `docs/superpowers/` path exists, and no authorization
  field or compatibility parser was added.

- [ ] **Step 8: Commit verification and sync**

  Run:

  ```bash
  git add README.md openspec/changes/support-external-case-package-paths src/cli.ts
  git commit -m "docs(workspaces): verify external case homes"
  git town sync --non-interactive
  ```

- [ ] **Step 9: Perform required review and completion workflow**

  Use `superpowers:requesting-code-review`, resolve findings with TDD, rerun
  `npm run validate`, run the retrospective required by the
  superpowers-bridge, archive the accepted OpenSpec change on this owning
  branch, commit the archive, sync the stack, push, and open the focused stacked
  pull request without merging or closing Issue #1.
