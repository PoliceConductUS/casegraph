# Complaint Document Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `casegraph cases add document <case-id> complaint <path-to-pdf>` to record one complaint document node in an existing case workspace.

**Architecture:** Extend the existing single-file CLI in `src/cli.ts` with a direct `cases add document` command path. Keep persistence filesystem-based by writing exactly `workspace/<case-id>/complaint.yaml` and rejecting every unsupported command shape before writing.

**Tech Stack:** Node.js, TypeScript, Vitest, OpenSpec, existing `./casegraph` wrapper.

---

### Task 1: Add failing CLI acceptance tests

**Files:**

- Modify: `test/cli.test.ts`

- [ ] **Step 1: Add tests for the successful complaint path**

Add this new describe block after the existing `casegraph cases new` block in `test/cli.test.ts`:

```ts
describe("casegraph cases add document", () => {
  test("records a complaint document node in an existing case workspace", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
        {
          recursive: true,
        },
      );

      const result = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          "/records/complaint.pdf",
        ],
        workingDirectory,
      );
      const complaintPath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
        "complaint.yaml",
      );
      const complaint = await readFile(complaintPath, "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "workspace/example-v-example-city/complaint.yaml",
      );
      expect(complaint).toContain("type: node\n");
      expect(complaint).toContain("kind: document\n");
      expect(complaint).toContain("id: complaint\n");
      expect(complaint).toContain("document_type: complaint\n");
      expect(complaint).toContain('path: "/records/complaint.pdf"\n');
      expect(complaint).not.toContain("parent");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("records the external PDF path only", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
        {
          recursive: true,
        },
      );

      const result = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          "/records/complaint.pdf",
        ],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "example-v-example-city",
            "complaint.pdf",
          ),
        ),
      ).rejects.toThrow();
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "example-v-example-city",
            "edges",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npm test -- test/cli.test.ts -t "casegraph cases add document"
```

Expected: tests fail because `cases add` is currently reported as an unknown cases command.

- [ ] **Step 3: Add rejection tests**

Add these tests inside the same `describe("casegraph cases add document", ...)` block:

```ts
test("rejects unsupported document types", async () => {
  const workingDirectory = await makeWorkingDirectory();

  try {
    await mkdir(
      path.join(workingDirectory, "workspace", "example-v-example-city"),
      {
        recursive: true,
      },
    );

    const result = await runCasegraph(
      [
        "cases",
        "add",
        "document",
        "example-v-example-city",
        "motion",
        "/records/motion.pdf",
      ],
      workingDirectory,
    );

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Only complaint documents are supported",
    );
    await expect(
      stat(
        path.join(
          workingDirectory,
          "workspace",
          "example-v-example-city",
          "complaint.yaml",
        ),
      ),
    ).rejects.toThrow();
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("rejects missing path and extra tokens", async () => {
  const workingDirectory = await makeWorkingDirectory();

  try {
    await mkdir(
      path.join(workingDirectory, "workspace", "example-v-example-city"),
      {
        recursive: true,
      },
    );

    const missingPath = await runCasegraph(
      ["cases", "add", "document", "example-v-example-city", "complaint"],
      workingDirectory,
    );
    const extraToken = await runCasegraph(
      [
        "cases",
        "add",
        "document",
        "example-v-example-city",
        "complaint",
        "/records/complaint.pdf",
        "extra",
      ],
      workingDirectory,
    );

    expect(missingPath.exitCode).not.toBe(0);
    expect(`${missingPath.stdout}\n${missingPath.stderr}`).toContain(
      "Usage: casegraph cases add document <case-id> complaint <path-to-pdf>",
    );
    expect(extraToken.exitCode).not.toBe(0);
    expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
      "Usage: casegraph cases add document <case-id> complaint <path-to-pdf>",
    );
    await expect(
      stat(
        path.join(
          workingDirectory,
          "workspace",
          "example-v-example-city",
          "complaint.yaml",
        ),
      ),
    ).rejects.toThrow();
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("rejects missing case workspace", async () => {
  const workingDirectory = await makeWorkingDirectory();

  try {
    const result = await runCasegraph(
      [
        "cases",
        "add",
        "document",
        "missing-case",
        "complaint",
        "/records/complaint.pdf",
      ],
      workingDirectory,
    );

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Case workspace does not exist",
    );
    await expect(
      stat(path.join(workingDirectory, "workspace", "missing-case")),
    ).rejects.toThrow();
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});

test("rejects a second complaint without overwriting the first", async () => {
  const workingDirectory = await makeWorkingDirectory();

  try {
    const complaintPath = path.join(
      workingDirectory,
      "workspace",
      "example-v-example-city",
      "complaint.yaml",
    );
    await mkdir(path.dirname(complaintPath), { recursive: true });
    await writeFile(
      complaintPath,
      "type: node\nkind: document\nid: complaint\n",
    );

    const result = await runCasegraph(
      [
        "cases",
        "add",
        "document",
        "example-v-example-city",
        "complaint",
        "/records/replacement.pdf",
      ],
      workingDirectory,
    );

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Complaint document already exists",
    );
    expect(await readFile(complaintPath, "utf8")).toBe(
      "type: node\nkind: document\nid: complaint\n",
    );
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
npm test -- test/cli.test.ts -t "casegraph cases add document"
```

Expected: all new tests fail for behavior that is not implemented yet.

### Task 2: Implement the complaint document command

**Files:**

- Modify: `src/cli.ts`

- [ ] **Step 1: Add help text and YAML writer**

In `src/cli.ts`, add this help text after `casesNewHelp`:

```ts
const casesAddDocumentHelp = `Usage: casegraph cases add document <case-id> complaint <path-to-pdf>

Record a complaint document node in an existing case workspace.

Only complaint documents are supported.
The source file must exist, be readable, and be a PDF.
The PDF is not copied, parsed, or hashed.
`;
```

Add this function after `rootNodeContent`:

```ts
function complaintDocumentContent(pdfPath: string, timestamp: string): string {
  return [
    "type: node",
    "kind: document",
    "id: complaint",
    "document_type: complaint",
    `path: ${JSON.stringify(pdfPath)}`,
    `created_at: "${timestamp}"`,
    `updated_at: "${timestamp}"`,
    "",
  ].join("\n");
}
```

- [ ] **Step 2: Add command implementation**

Add this function after `createCaseWorkspace`:

```ts
async function addComplaintDocument(
  caseId: string | undefined,
  documentType: string | undefined,
  pdfPath: string | undefined,
  cwd: string,
): Promise<CommandResult> {
  if (!caseId || !documentType || !pdfPath) {
    return { exitCode: 1, stderr: casesAddDocumentHelp };
  }

  if (documentType !== "complaint") {
    return {
      exitCode: 1,
      stderr: `Only complaint documents are supported.\n\n${casesAddDocumentHelp}`,
    };
  }

  const displayWorkspacePath = workspaceDisplayPath(caseId);
  const workspacePath = path.join(cwd, "workspace", caseId);
  const complaintPath = path.join(workspacePath, "complaint.yaml");
  const complaintDisplayPath = path.posix.join(
    displayWorkspacePath,
    "complaint.yaml",
  );

  if (!(await pathExists(workspacePath))) {
    return {
      exitCode: 1,
      stderr: `Case workspace does not exist: ${displayWorkspacePath}\n`,
    };
  }

  if (await pathExists(complaintPath)) {
    return {
      exitCode: 1,
      stderr: `Complaint document already exists: ${complaintDisplayPath}\n`,
    };
  }

  const timestamp = new Date().toISOString();
  await writeFile(complaintPath, complaintDocumentContent(pdfPath, timestamp), {
    flag: "wx",
  });

  return {
    exitCode: 0,
    stdout: `Created complaint document: ${complaintDisplayPath}\n`,
  };
}
```

- [ ] **Step 3: Route `cases add document`**

Replace the destructuring in `runCasegraph`:

```ts
const [command, subcommand, caseId] = args;
```

with:

```ts
const [command, subcommand] = args;
```

Then insert this branch before the existing `if (subcommand !== "new")` block:

```ts
if (subcommand === "add") {
  const [, , resource, caseId, documentType, pdfPath, ...extraTokens] = args;

  if (resource !== "document" || extraTokens.length > 0) {
    return { exitCode: 1, stderr: casesAddDocumentHelp };
  }

  return addComplaintDocument(caseId, documentType, pdfPath, cwd);
}
```

Then update the `new` command call to derive `caseId` locally:

```ts
const [, , caseId] = args;
return createCaseWorkspace(caseId, cwd);
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- test/cli.test.ts -t "casegraph cases add document"
```

Expected: the new complaint document tests pass.

### Task 3: Validate full project and spec

**Files:**

- Read: `openspec/changes/add-complaint-document/specs/case-documents/spec.md`
- Read: `openspec/changes/add-complaint-document/tasks.md`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both commands complete successfully.

- [ ] **Step 3: Run formatting, lint, and OpenSpec validation**

Run:

```bash
npm run format
npm run lint
npm run openspec:validate
```

Expected: formatting completes, lint passes, and OpenSpec validates all changes.

- [ ] **Step 4: Run final validation**

Run:

```bash
npm run validate
```

Expected: the repository validation command passes end to end.

- [ ] **Step 5: Commit the completed implementation**

Run:

```bash
git add src/cli.ts test/cli.test.ts openspec/changes/add-complaint-document
git commit -m "feat(cli): add complaint document command"
```

Expected: one focused Conventional Commit containing the OpenSpec artifacts, tests, and implementation.
