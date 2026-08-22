# Global-UID CaseHome Storage Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task-by-task.

**Goal:** Open one exact CaseHome resource snapshot from the Case root and
resolve every reachable node or legal-effect edge by global UID without
directory scanning.

**Architecture:** Extend each strict resource-kind definition with validated
storage semantics, then add one eager CaseHome storage boundary that follows
only typed references from `<casehome>/root.yaml`. Resolve non-root resources
from canonical UID folders and validate resource-owned paths at the same
boundary.

**Tech Stack:** TypeScript, Zod, Node.js filesystem/path APIs, YAML, Vitest,
OpenSpec.

---

## Task 1: Kind Storage Semantics And Case Membership

**Files:**

- Modify: `src/resources/resource-kind.ts`
- Modify: `src/resources/resource-kind.test.ts`
- Modify: `src/resources/case/case-resource.ts`
- Modify: `src/resources/resource-document.test.ts`

- [ ] **Step 1: Update existing Case fixtures in focused tests**

  Change every Issue #40 `Case` fixture from `spec: {}` to
  `spec: { resources: [] }` and update deterministic YAML expectations. Keep an
  explicit test that rejects any Case spec field other than `resources`.

- [ ] **Step 2: Write failing typed-semantics tests**

  Add tests proving:
  - `Case.spec.resources` accepts ordered branded UIDs and rejects missing,
    invalid, and invented fields;
  - `CaseResourceDefinition` classifies Case as `node` and exposes those
    references;
  - a strict fixture node can declare owned paths;
  - a strict fixture legal-effect edge exposes typed endpoint references using
    the same `ResourceUid` type;
  - fields not returned by selectors do not become references or owned paths.

- [ ] **Step 3: Run the focused tests and record RED**

  Run:

  ```bash
  npm test -- src/resources/resource-kind.test.ts src/resources/resource-document.test.ts
  ```

  Expected: FAIL because kind definitions do not accept categories/selectors and
  the production Case schema still requires an empty spec.

- [ ] **Step 4: Add typed definition output**

  In `src/resources/resource-kind.ts`, add:
  - `ResourceCategory = "node" | "legal-effect-edge"`;
  - an immutable inspection result containing the validated resource, category,
    resource references, and owned paths;
  - required `category` plus optional typed `resourceReferences` and
    `ownedPaths` selectors in `defineResourceKind` options;
  - a registry inspection method that performs the same exact dispatch and
    wraps schema/selector failures with the resource path.

  Preserve the existing `read` and `serialize` behavior by delegating to the
  selected strict definition. Do not add default categories, reflective field
  walking, or a catch-all schema.

- [ ] **Step 5: Extend the Case kind**

  In `src/resources/case/case-resource.ts`, define strict
  `spec.resources` as an array of `ResourceUidSchema`, declare category `node`,
  and return the array from the typed reference selector.

- [ ] **Step 6: Run focused tests and record GREEN**

  Run the Step 3 command. Expected: all focused tests pass.

- [ ] **Step 7: Mark tasks 1.1 and 1.2 complete**

  Update `tasks.md` only after RED and GREEN evidence exists.

- [ ] **Step 8: Commit and push immediately**

  ```bash
  git add src/resources/resource-kind.ts \
    src/resources/resource-kind.test.ts \
    src/resources/case/case-resource.ts \
    src/resources/resource-document.test.ts \
    openspec/changes/store-casehome-resources-by-global-uid/tasks.md
  git commit -m "feat(resources): declare typed storage semantics"
  git push
  ```

## Task 2: Rooted Global-UID Membership

**Files:**

- Create: `src/resources/casehome-storage/casehome-resources.test.ts`
- Create: `src/resources/casehome-storage/casehome-resources.ts`

- [ ] **Step 1: Write fixture helpers at the test boundary**

  Add local helpers that create a temporary CaseHome, write strict resources
  through `writeResourceDocument`, and register strict fixture `TestNode` and
  `TestLegalEffectEdge` kinds. Use literal CUID2 values; do not add a production
  UID generator.

- [ ] **Step 2: Write failing membership tests**

  Cover:
  - Case root at `<casehome>/root.yaml` plus a non-root node at
    `<casehome>/<uid>/root.yaml`;
  - a legal-effect edge resolved by the same UID-only method;
  - transitive typed references;
  - repeated references and A↔B cycles resolving once per UID;
  - a valid but unreferenced UID directory excluded from membership and refused
    by `resolve`;
  - rejection of composite/path resolution input through the existing UID
    parser.

- [ ] **Step 3: Run the new test and record RED**

  ```bash
  npm test -- src/resources/casehome-storage/casehome-resources.test.ts
  ```

  Expected: FAIL because `casehome-resources.ts` does not exist.

- [ ] **Step 4: Implement the eager rooted snapshot**

  Add `openCaseHomeResources(caseHomePath, registry)` that:
  1. reads `<casehome>/root.yaml` through registry inspection;
  2. requires the validated root kind to be exactly `Case`;
  3. records the root UID;
  4. follows typed references with a visited-UID set;
  5. reads first-seen non-root UIDs only from
     `<casehome>/<uid>/root.yaml`;
  6. records immutable resolved entries containing resource, category, and
     owned paths;
  7. exposes an ordered `resourceUids` snapshot and `resolve(unknown)` that
     validates one UID and refuses non-members.

  Do not recursively scan, cache across calls, expose arbitrary paths, or add a
  general traversal framework.

- [ ] **Step 5: Run the focused test and record GREEN**

  Run the Step 3 command. Expected: membership, cycle, node/edge, and
  unreferenced-resource tests pass.

- [ ] **Step 6: Mark tasks 2.1 and 2.2 complete**

  Update `tasks.md` only after the focused suite is green.

- [ ] **Step 7: Commit and push immediately**

  ```bash
  git add src/resources/casehome-storage/casehome-resources.ts \
    src/resources/casehome-storage/casehome-resources.test.ts \
    openspec/changes/store-casehome-resources-by-global-uid/tasks.md
  git commit -m "feat(storage): resolve rooted CaseHome resources"
  git push
  ```

## Task 3: Storage Rejection And Owned Paths

**Files:**

- Modify: `src/resources/casehome-storage/casehome-resources.test.ts`
- Modify: `src/resources/casehome-storage/casehome-resources.ts`

- [ ] **Step 1: Add failing canonical-storage tests**

  Add focused cases for a missing referenced `root.yaml`, folder UID A
  containing UID B, the Case root UID referenced as a non-root member, malformed
  YAML, unknown kind, and a strict schema failure. Assert diagnostics include
  the UID/path or expected-versus-actual identity required to locate the defect.

- [ ] **Step 2: Add failing owned-path tests**

  Prove typed `files/source.pdf` and `audits/review.yaml` resolve inside the
  canonical resource folder; an undeclared physical file is ignored; and each
  of these fails atomically:
  - empty path;
  - absolute path;
  - `../outside` or another `..` segment;
  - a relative path outside `files/` and `audits/`.

- [ ] **Step 3: Run the focused test and record RED**

  Run:

  ```bash
  npm test -- src/resources/casehome-storage/casehome-resources.test.ts
  ```

  Expected: FAIL on the newly added diagnostics and owned-path assertions.

- [ ] **Step 4: Enforce canonical identity and containment**

  In `casehome-resources.ts`:
  - compare each non-root envelope UID with its requested folder UID;
  - reject the root UID before reading it as non-root membership;
  - preserve reader validation context from the canonical path;
  - validate owned paths as non-empty, non-absolute, segment-safe paths whose
    first segment is `files` or `audits`;
  - resolve and verify the absolute result remains inside the resource folder;
  - build the snapshot locally and return it only after every member succeeds.

- [ ] **Step 5: Run focused resource tests and record GREEN**

  ```bash
  npm test -- src/resources/casehome-storage/casehome-resources.test.ts \
    src/resources/resource-kind.test.ts \
    src/resources/resource-document.test.ts \
    src/resources/resource-uid.test.ts
  ```

  Expected: all resource/storage tests pass.

- [ ] **Step 6: Mark tasks 3.1 and 3.2 complete**

  Update `tasks.md` only after the focused suite is green.

- [ ] **Step 7: Commit and push immediately**

  ```bash
  git add src/resources/casehome-storage/casehome-resources.ts \
    src/resources/casehome-storage/casehome-resources.test.ts \
    openspec/changes/store-casehome-resources-by-global-uid/tasks.md
  git commit -m "fix(storage): enforce resource ownership boundaries"
  git push
  ```

## Task 4: Verify And Archive The Change

- [ ] **Step 1: Run focused acceptance coverage**

  Run the focused command from Task 3 Step 5 and map every Issue #41 acceptance
  criterion to a named test.

- [ ] **Step 2: Run the complete repository gate**

  ```bash
  npm run validate
  ```

  Expected: formatting, lint, all tests, typecheck, build, and strict OpenSpec
  validation pass.

- [ ] **Step 3: Mark task 4.1 complete, commit, and push**

  ```bash
  git add openspec/changes/store-casehome-resources-by-global-uid/tasks.md
  git commit -m "test(storage): verify global UID contracts"
  git push
  ```

- [ ] **Step 4: Produce verification and retrospective artifacts**

  Follow the bridge instructions for `verify.md` and `retrospective.md`. Record
  real commit/test evidence, no front-door routing leaks, no deferred `[~]`
  tasks, and any review findings.

- [ ] **Step 5: Mark task 4.2 complete and rerun verification**

  Confirm every task is checked and the final verification decision is PASS.

- [ ] **Step 6: Archive and rerun the complete gate**

  Archive `store-casehome-resources-by-global-uid`, sync both delta specs, then
  run `npm run validate` again against durable specs.

- [ ] **Step 7: Commit and push archive immediately**

  ```bash
  git add -A openspec/changes/store-casehome-resources-by-global-uid \
    openspec/changes/archive \
    openspec/specs/case-resources \
    openspec/specs/casehome-resource-storage
  git commit -m "docs(openspec): archive global UID storage"
  git push
  ```

- [ ] **Step 8: Update PR evidence and leave draft only after completion**

  Update the draft PR with implemented behavior and current validation. Wait for
  GitHub checks, then mark it ready. Link PR #50 and the Issue #41 PR bottom to
  top with `gh stack link`; do not merge until the complete five-PR stack is
  ready.
