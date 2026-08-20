# Incident From Complaint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `casegraph cases analysis new` run the first source-grounded `incident-from-complaint` workflow without changing the main case graph.

**Architecture:** Keep the `casegraph cases analysis new` command flow in `src/cases/analysis/new/`. Store analysis workflow definitions that can be run by analysis tasks as sibling folders under `src/cases/analysis/workflows/`; for this change, store the first workflow contract in `src/cases/analysis/workflows/incident-from-complaint/`. Add small serializers for the current analysis root, workflow root, and change set; keep this first workflow selection hard-coded and test-backed. Require a local or downloadable complaint PDF source, and represent missing markdown/plain text as a proposed change rather than a command failure.

**Tech Stack:** Node.js, TypeScript, Vitest, Zod, repo-local YAML serialization, OpenSpec.

---

### Task 1: Red Tests for the Approved Workflow

**Files:**

- Modify: `test/cli.test.ts`
- Reference: `openspec/changes/incident-from-complaint/specs/case-analysis/spec.md`

- [ ] **Step 1: Update the main happy-path test**

Change the existing `casegraph cases analysis new` success test to assert these files are created:

```text
workspace/<case-id>/analysis/current/root.yaml
workspace/<case-id>/analysis/current/incident-from-complaint/root.yaml
workspace/<case-id>/analysis/current/incident-from-complaint/change-set.yaml
workspace/<case-id>/analysis/current/incident-from-complaint/report.md
```

- [ ] **Step 2: Assert action-oriented output**

Assert stdout contains:

```text
Analysis created.
Proposed:
Main graph:
unchanged
analysis/current/incident-from-complaint/report.md
analysis/current/incident-from-complaint/change-set.yaml
```

Assert stdout does not contain unimplemented commands such as `analysis apply`,
`analysis abandon`, `analysis status`, `analysis export`, or `analysis import`.

- [ ] **Step 3: Add precondition tests**

Add tests for:

```text
current analysis exists -> Analysis not created
main already has incident -> Analysis not created
no complaint metadata -> Analysis not created
complaint metadata exists but complaint PDF is unavailable -> Analysis not created
```

- [ ] **Step 4: Add artifact content tests**

Assert current root records `main -> incident-from-complaint`, workflow path,
case ID, analysis ID, and timestamps. Assert workflow root references
`change-set.yaml` and `report.md`.

- [ ] **Step 5: Add source discipline tests**

Assert each proposed change has a source reference, complaint locator, evidence
kind (`direct-quote`, `paraphrase`, `summary`, `inference`, or
`missing-source-observation`), and review state `proposed`.

- [ ] **Step 6: Run focused tests and confirm failure**

Run:

```bash
npm test -- test/cli.test.ts -t "casegraph cases analysis new"
```

Expected: FAIL because implementation still creates the old generated analysis
artifact.

### Task 2: Add Analysis File Models

**Files:**

- Create: `src/cases/analysis/workflows/incident-from-complaint/contract.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Replace the old artifact schema**

Define schemas/types for:

```ts
CurrentAnalysisRoot;
IncidentFromComplaintWorkflowRoot;
IncidentFromComplaintChangeSet;
IncidentFromComplaintChange;
```

- [ ] **Step 2: Define review states**

Use:

```ts
const ReviewStateSchema = z.enum([
  "proposed",
  "approved",
  "discarded",
  "conflicted",
  "applied",
]);
```

- [ ] **Step 3: Add serializers**

Add functions:

```ts
currentAnalysisRootYaml(root);
incidentFromComplaintWorkflowRootYaml(root);
incidentFromComplaintChangeSetYaml(changeSet);
```

Keep serialization direct and omit null values.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: FAIL until command imports and call sites are updated.

### Task 3: Complaint Source Detection

**Files:**

- Modify: `src/cases/analysis/new/command.ts`
- Reference: `src/cases/graph/records.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Detect complaint metadata**

Use existing graph record metadata to find an explicit complaint document record
or docket/document metadata that identifies a complaint. Do not guess from weak
metadata.

- [ ] **Step 2: Detect available complaint PDF source**

Check whether the complaint metadata identifies a readable local PDF path or a
downloadable PDF source URL. If the
PDF is unavailable, return the approved failure output before creating workflow
files.

- [ ] **Step 3: Propose missing markdown/plain text**

If a markdown/plain text version of the complaint PDF does not exist, include a
proposed change in `change-set.yaml` to create that artifact. If implementation
also creates the artifact immediately, check the latest stable PDF extraction
dependency before adding it.

- [ ] **Step 4: Keep extracted text analysis-local**

If complaint text is extracted, write it inside the workflow directory and
reference it from workflow files. Do not mutate the complaint node in the main
case graph.

### Task 4: Hard-Code Incident Workflow

**Files:**

- Modify: `src/cases/analysis/new/command.ts`
- Modify or create focused helpers under `src/cases/analysis/workflows/incident-from-complaint/`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Detect existing main incident**

Read main graph nodes and reject if any node has `kind: incident`.

- [ ] **Step 2: Build proposed changes**

Create incident-scoped proposed changes only: incident, actors, source
references, and data requests. The incident narrative belongs in the proposed
incident's ordered embedded `events` array, not separate event nodes.

- [ ] **Step 3: Require source references**

Before writing `change-set.yaml`, validate that every proposed change has at
least one source reference and a source-support kind.

- [ ] **Step 4: Write incident report**

Write a concise `report.md` that explains the incident, actors,
embedded events, statements/actions/movements derived from those events, source support, missing sources, and what
the user should review.

- [ ] **Step 5: Reject out-of-scope categories**

Add tests or validation so the workflow does not emit claims, defenses, Monell
theories, legal standards, motion arguments, or litigation strategy.

### Task 5: Command Flow and Output

**Files:**

- Modify: `src/cases/analysis/new/command.ts`
- Modify: `src/cases/analysis/new/history.ts` or remove its usage
- Test: `test/cli.test.ts`

- [ ] **Step 1: Update help text**

Explain that `analysis new` starts `incident-from-complaint` and proposes an
incident change set without changing main.

- [ ] **Step 2: Refuse current analysis overwrite**

If `analysis/current/root.yaml` exists, return:

```text
Analysis not created.

Reason:
A current analysis already exists.
```

- [ ] **Step 3: Refuse missing complaint or incident-present cases**

Use the exact failure shapes in the spec. Do not print audit details.

- [ ] **Step 4: Write files exclusively**

Create directories and files with overwrite protection. Do not leave partial
workflow files behind after precondition failure.

- [ ] **Step 5: Remove `.history` writes from analysis new**

Do not write a mutation manifest for this command. Preserve history inside the
analysis current root, workflow root, and change set.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- test/cli.test.ts -t "casegraph cases analysis new"
```

Expected: PASS.

### Task 6: Full Validation

**Files:**

- All changed files

- [ ] **Step 1: Format**

Run: `npm run format`

- [ ] **Step 2: Lint**

Run: `npm run lint`

- [ ] **Step 3: Test**

Run: `npm test`

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 5: Build**

Run: `npm run build`

- [ ] **Step 6: OpenSpec validation**

Run: `npm run openspec:validate`

- [ ] **Step 7: Full validation**

Run: `npm run validate`
