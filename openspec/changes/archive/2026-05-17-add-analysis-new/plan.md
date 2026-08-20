# Add Analysis New Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `casegraph cases analysis new` so an existing case can produce one review-only analysis artifact from current workspace metadata.

**Architecture:** Follow the existing feature-folder CLI pattern. Add a focused analysis command module under `src/cases/analysis/new/`, use existing case resolution helpers, read graph nodes through the graph record model, write the analysis artifact under `workspace/<case-id>/analysis/`, and write mutation history under `.history/`.

**Tech Stack:** TypeScript, Commander, Node.js `fs/promises`, existing YAML string-writing conventions, Zod, Vitest.

---

### Task 1: CLI Behavior Tests

**Files:**

- Modify: `test/cli.test.ts`
- Reference: `openspec/changes/add-analysis-new/specs/case-analysis/spec.md`

- [ ] **Step 1: Add help tests for the new command group**

Add tests near the existing help tests:

```ts
it("lists the analysis command group in cases help", async () => {
  const result = await runCasegraph(["cases", "--help"], tempDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("analysis");
});

it("shows analysis help", async () => {
  const result = await runCasegraph(["cases", "analysis", "--help"], tempDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("new <case-id>");
});

it("shows analysis new help", async () => {
  const result = await runCasegraph(
    ["cases", "analysis", "new", "--help"],
    tempDir,
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("review-only analysis artifact");
  expect(result.stdout).toContain("exactly one valid case exists");
});
```

- [ ] **Step 2: Add creation test**

Use existing test helpers for temporary workspaces. The test should create a valid case, add one evidence file if a helper exists, run `cases analysis new <case-id>`, then assert:

```ts
expect(result.exitCode).toBe(0);
expect(result.stdout).toContain("Created analysis:");
expect(result.stdout).toContain("Analysis ID:");
expect(result.stdout).toContain("Accepted graph unchanged.");
```

Then read `workspace/<case-id>/analysis/*.yaml` and assert it contains:

```ts
expect(content).toContain("case_id: example-v-example-city");
expect(content).toContain("status: draft");
expect(content).toContain("source_record_ids:");
expect(content).toContain("complaint_expansion:");
expect(content).toContain("evidence_review:");
expect(content).toContain("transcript_requests:");
expect(content).toContain("event_timeline:");
expect(content).toContain("issue_map:");
expect(content).toContain("unsupported_facts:");
expect(content).toContain("suggested_next_steps:");
expect(content).not.toContain("null");
```

- [ ] **Step 3: Add omitted-case test**

Create exactly one valid case and run:

```ts
const result = await runCasegraph(["cases", "analysis", "new"], tempDir);
```

Assert success and that the artifact is written under the single valid case workspace.

- [ ] **Step 4: Add validation failure tests**

Add tests for:

```ts
["cases", "analysis", "new"];
```

with zero valid cases, expecting `No case exists`.

```ts
["cases", "analysis", "new"];
```

with two valid cases, expecting `Multiple cases exist`.

```ts
["cases", "analysis", "new", "missing-case"];
```

expecting `Case workspace does not exist`.

```ts
["cases", "analysis", "new", "example-v-example-city", "extra"];
```

expecting `Unexpected analysis new argument: extra`.

- [ ] **Step 5: Run focused tests and confirm red**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: new tests fail because the analysis command does not exist yet.

### Task 2: Analysis Artifact Model And Builder

**Files:**

- Create: `src/cases/analysis/new/artifact.ts`
- Modify: `src/cases/graph/records.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Add the analysis artifact model**

Create `src/cases/analysis/new/artifact.ts` with an exported Zod schema and type:

```ts
import { z } from "zod";

export const AnalysisArtifactSchema = z.object({
  type: z.literal("analysis"),
  kind: z.literal("case_analysis"),
  id: z.string(),
  case_id: z.string(),
  status: z.literal("draft"),
  created_at: z.string(),
  updated_at: z.string(),
  source_record_ids: z.array(z.string()),
  complaint_expansion: z.array(z.unknown()),
  evidence_review: z.array(z.unknown()),
  transcript_requests: z.array(z.unknown()),
  event_timeline: z.array(z.unknown()),
  issue_map: z.array(z.unknown()),
  unsupported_facts: z.array(z.unknown()),
  suggested_next_steps: z.array(z.string()),
});

export type AnalysisArtifact = z.infer<typeof AnalysisArtifactSchema>;
```

- [ ] **Step 2: Add artifact serialization**

In the same file, add a small YAML writer function that emits only known fields and empty arrays:

```ts
export function analysisArtifactYaml(artifact: AnalysisArtifact): string {
  AnalysisArtifactSchema.parse(artifact);

  return [
    "type: analysis",
    "kind: case_analysis",
    `id: ${JSON.stringify(artifact.id)}`,
    `case_id: ${JSON.stringify(artifact.case_id)}`,
    "status: draft",
    `created_at: ${JSON.stringify(artifact.created_at)}`,
    `updated_at: ${JSON.stringify(artifact.updated_at)}`,
    "source_record_ids:",
    ...artifact.source_record_ids.map((id) => `  - ${JSON.stringify(id)}`),
    "complaint_expansion: []",
    "evidence_review: []",
    "transcript_requests: []",
    "event_timeline: []",
    "issue_map: []",
    "unsupported_facts: []",
    "suggested_next_steps:",
    '  - "Review candidate evidence and pleading inputs before applying any analysis to the graph."',
    "",
  ].join("\n");
}
```

- [ ] **Step 3: Add graph metadata reader if needed**

If `src/cases/graph/records.ts` already exports parsed graph-node loading, reuse it. If not, add a minimal exported function that returns parsed graph nodes for a workspace, using the existing `GraphNodeSchema`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: failures move from missing model/serialization toward missing command wiring.

### Task 3: History And Persistence

**Files:**

- Create: `src/cases/analysis/new/history.ts`
- Create: `src/cases/analysis/new/command.ts`
- Reference: `src/cases/add/evidence/history.ts`

- [ ] **Step 1: Create history writer**

Create `src/cases/analysis/new/history.ts` modeled on evidence history. Export:

```ts
export type AnalysisHistoryInput = {
  analysisId: string;
  analysisPath: string;
  caseId: string;
  completedAt: string;
  mutationId: string;
  sourceRecordIds: readonly string[];
  startedAt: string;
  workspacePath: string;
};
```

Write a manifest under `.history/<mutationId>/manifest.yaml` and update `.history/index.yaml` using the existing history style. Include command, case ID, analysis ID, analysis path, source record IDs, started/completed timestamps.

- [ ] **Step 2: Create command module skeleton**

Create `src/cases/analysis/new/command.ts` exporting:

```ts
export const casesAnalysisNewHelp = `Usage: casegraph cases analysis new <case-id>
       casegraph cases analysis new

Create a review-only analysis artifact from existing case workspace metadata.

The case ID may be omitted only when exactly one valid case exists.
`;

export async function runAnalysisNewCommand(
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  // implement in the next steps
}
```

- [ ] **Step 3: Implement case resolution and validation**

In `runAnalysisNewCommand`, follow the evidence command shape:

- `args.length === 0`: resolve with `resolveOnlyCaseId(cwd)`.
- `args.length === 1`: use the provided case ID.
- `args.length > 1`: return `Unexpected analysis new argument: ${args[1]}` plus help.
- Missing or invalid workspace returns `Case workspace does not exist: workspace/<case-id>`.

- [ ] **Step 4: Implement artifact persistence**

In the command module:

- Create `analysis/` with `mkdir(..., { recursive: true })`.
- Generate an opaque local ID using the existing project convention available in code; if no helper exists, create a small local generator consistent with existing CUID2-style IDs.
- Write `analysis/<analysis-id>.yaml` with `{ flag: "wx" }`.
- On `EEXIST`, return a non-zero result explaining the file already exists.
- Collect graph record IDs from current workspace YAML records and sort them for deterministic output.

- [ ] **Step 5: Write history after artifact creation**

Call `writeAnalysisHistory` after the artifact file is written. If history writing fails, allow the command to fail loudly rather than reporting partial success.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: most analysis tests still fail until Commander wiring is added.

### Task 4: Commander Integration

**Files:**

- Modify: `src/cli.ts`
- Create or modify: `src/cases/analysis/new/command.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Import analysis command exports**

Add imports in `src/cli.ts`:

```ts
import {
  casesAnalysisNewHelp,
  runAnalysisNewCommand,
} from "./cases/analysis/new/command.js";
```

- [ ] **Step 2: Add help text**

Update `casesHelp` to list:

```text
  analysis         Create and inspect review-only analysis artifacts
```

Add:

```ts
const casesAnalysisHelp = `Usage: casegraph cases analysis <command>

Create and inspect review-only case analysis artifacts.

Commands:
  new <case-id>    Create a review-only analysis artifact
  new              Create analysis for the only valid case
`;
```

- [ ] **Step 3: Add help routing**

Before unknown command validation, add:

```ts
if (subcommand === "analysis" && isHelpRequest(args.slice(2, 3))) {
  return { exitCode: 0, stdout: casesAnalysisHelp };
}

if (
  subcommand === "analysis" &&
  args[2] === "new" &&
  isHelpRequest(args.slice(3))
) {
  return { exitCode: 0, stdout: casesAnalysisNewHelp };
}
```

- [ ] **Step 4: Include analysis in allowed cases commands**

Update the allowed subcommand list to include `"analysis"`.

- [ ] **Step 5: Add Commander subcommand**

After `const casesCommand = program.command("cases").helpOption(false);`, add:

```ts
const analysisCommand = casesCommand.command("analysis").helpOption(false);

analysisCommand
  .command("new")
  .helpOption(false)
  .argument("[caseId]")
  .argument("[extra...]")
  .action(async (caseId: string | undefined, extra: string[]) => {
    commandResult = await runAnalysisNewCommand(
      commandArguments(caseId, extra),
      cwd,
    );
  });
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: analysis tests pass or expose exact remaining behavior mismatches.

### Task 5: Validation And Cleanup

**Files:**

- Modify: `openspec/changes/add-analysis-new/tasks.md`
- All files changed by implementation.

- [ ] **Step 1: Run OpenSpec validation**

Run:

```bash
npm run openspec:validate
```

Expected: passes with the new `case-analysis` delta spec.

- [ ] **Step 2: Run full project validation**

Run:

```bash
npm run validate
```

Expected: format, lint, tests, typecheck, build, and OpenSpec validation pass.

- [ ] **Step 3: Mark tasks complete as implemented**

Update `openspec/changes/add-analysis-new/tasks.md` from `- [ ]` to `- [x]` only for tasks actually completed.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git status --short
git add src test openspec/changes/add-analysis-new
git commit -m "feat(case-analysis): add analysis artifact creation"
```

Expected: one focused implementation commit for `add-analysis-new`.

### Self-Review Checklist

- [ ] Every scenario in `openspec/changes/add-analysis-new/specs/case-analysis/spec.md` has a corresponding test or explicit implementation check.
- [ ] The command is a real Commander subcommand.
- [ ] Extra positional tokens are hard errors.
- [ ] Analysis creation does not mutate existing graph node files.
- [ ] The artifact does not claim AI review, transcript generation, fact extraction, or legal conclusions.
- [ ] `npm run validate` passes before final handoff.
