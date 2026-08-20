import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { runCasegraph as runCasegraphInProcess } from "../src/cli.js";
import {
  CASEGRAPH_API_VERSION,
  readCaseHome,
  writeCaseHome,
} from "../src/cases/workspaces/case-home-document.js";
import {
  readCaseLocator,
  writeCaseLocator,
} from "../src/cases/workspaces/case-locator-document.js";
import { isUsableExtractedPdfText } from "../src/cases/documents/source-artifacts.js";
import { runPdfToMarkdownWorkflow } from "../src/cases/analysis/tasks/pdf-to-markdown/run.js";
import {
  IncidentExtractionJsonSchema,
  type IncidentFromComplaintAiExtractor,
} from "../src/cases/analysis/workflows/incident-from-complaint/run.js";
import { openAiResponsesJsonWithResponse } from "../src/system/ai/openai/responses.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "casegraph");
const evidenceFileSha256 =
  "c52fa72b5f4be9a86cd7bf69559025bae760a974e1c9d998e33d6981993df412";

type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runCasegraph(
  args: string[],
  cwd = repoRoot,
): Promise<CliResult> {
  if (
    args[0] === "cases" &&
    args[1] === "analysis" &&
    (args[2] === "new" || args[2] === "resume") &&
    !args.includes("--help") &&
    !args.includes("-h")
  ) {
    return runCasegraphWithFixtureAi(args, cwd);
  }

  try {
    const { stdout, stderr } = await execFileAsync(cliPath, args, {
      cwd,
      env: { ...process.env, HOME: cwd },
    });

    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const failure = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
}

const fixtureIncidentFromComplaintAiExtractor: IncidentFromComplaintAiExtractor =
  {
    extractIncidentFromComplaint() {
      return Promise.resolve({
        incident: {
          label: "January 15, 2024 Example City arrest incident",
          summary:
            "A January 15, 2024 encounter with Example City police that allegedly led to Plaintiff's arrest.",
          incident_count: "one primary incident",
          date: {
            value: "January 15, 2024",
            certainty: "exact",
            source_locations: ["complaint text"],
          },
          time: {
            value: "unknown",
            certainty: "unknown",
            source_locations: [],
          },
          location: {
            primary: "Example City, Example State",
            specificity: "city",
            secondary_locations: [],
            movement_between_locations: "unknown",
            unclear_or_missing: "Street address not found in fixture text.",
            source_locations: ["complaint text"],
          },
          primary_actors: ["Alex Example", "Example City police officers"],
          events: [
            {
              type: "action",
              time: {
                value: "unknown",
                certainty: "unknown",
              },
              location: {
                value: "Example City, Example State",
                certainty: "approximate",
              },
              actors: [
                {
                  id: "alex-example",
                  role: "target",
                },
                {
                  id: "example-city-police-officers",
                  role: "actor",
                  target_id: "alex-example",
                },
              ],
              description:
                "Plaintiff alleges an encounter with Example City police occurred.",
              support: "directly-alleged",
              source_locations: ["complaint text"],
              review_note: "Review the exact location and officer identities.",
            },
            {
              type: "custody",
              time: {
                value: "unknown",
                certainty: "unknown",
              },
              location: {
                value: "Example City, Example State",
                certainty: "approximate",
              },
              actors: [
                {
                  id: "alex-example",
                  role: "arrestee",
                },
                {
                  id: "example-city-police-officers",
                  role: "arresting-actor",
                  target_id: "alex-example",
                },
              ],
              description: "Plaintiff alleges the encounter led to arrest.",
              support: "directly-alleged",
              source_locations: ["complaint text"],
              review_note: "Confirm the arrest sequence against source video.",
            },
          ],
          confidence_review_note:
            "Review required; extracted by fixture from complaint text.",
        },
        actors: [
          {
            id: "alex-example",
            name: "Alex Example",
            role: "plaintiff",
            identity_status: "named",
            category: "plaintiff",
            source_locations: ["complaint text"],
          },
          {
            id: "example-city-police-officers",
            name: "Example City police officers",
            role: "involved officers",
            identity_status: "unnamed",
            category: "officer",
            source_locations: ["complaint text"],
          },
        ],
        source_materials: [
          {
            name: "complaint",
            status: "available",
            review_note: "Available in workflow artifacts.",
            source_locations: ["complaint text"],
          },
          {
            name: "body-worn camera footage",
            status: "needed-to-verify",
            target_agency: "Example City Police Department",
            request_text:
              "Request body-worn camera footage for the January 15, 2024 Example City arrest incident.",
            review_note: "Would help verify the encounter and arrest.",
            source_locations: ["complaint text"],
          },
        ],
        uncertainties: ["Exact time and street address require review."],
      });
    },
  };

async function runCasegraphWithFixtureAi(
  args: string[],
  cwd: string,
): Promise<CliResult> {
  const originalHome = process.env.HOME;
  process.env.HOME = cwd;

  let result;
  try {
    result = await runCasegraphInProcess(args, cwd, {
      env: process.env,
      incidentFromComplaintAiExtractor: fixtureIncidentFromComplaintAiExtractor,
      pdfToMarkdownVisionExtractor: null,
    });
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function runNewCasegraph(
  args: string[],
  cwd: string,
  approveCreation: (request: unknown) => Promise<boolean>,
): Promise<CliResult> {
  const result = await runCasegraphInProcess(args, cwd, {
    env: process.env,
    casegraphHome: path.join(cwd, ".casegraph"),
    approveCreation,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function makeWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "casegraph-"));
}

async function writeMinimalPdf(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "%PDF-1.7\n");
}

async function writeEvidenceFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "not a pdf\n");
}

function arraySchemasMissingItems(
  schema: unknown,
  location = "schema",
): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const record = schema as Record<string, unknown>;
  const missing =
    record.type === "array" && !("items" in record) ? [location] : [];
  const nested = Object.entries(record).flatMap(([key, value]) =>
    arraySchemasMissingItems(value, `${location}.${key}`),
  );

  return [...missing, ...nested];
}

function aiCacheKey(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function writeValidCaseRoot(
  workingDirectory: string,
  caseId: string,
): Promise<void> {
  const rootPath = path.join(
    workingDirectory,
    "workspace",
    caseId,
    "root.yaml",
  );
  await mkdir(path.dirname(rootPath), { recursive: true });
  await writeFile(
    rootPath,
    'type: node\nkind: case\nid: root\ncreated_at: "2026-05-12T00:00:00.000Z"\nupdated_at: "2026-05-12T00:00:00.000Z"\n',
  );
  await writeExternalCaseLocator(workingDirectory, caseId);
}

async function writeExternalCaseLocator(
  workingDirectory: string,
  caseId: string,
): Promise<void> {
  const homeDirectory = path.join(workingDirectory, "case-homes", caseId);
  const homeRoot = path.join(homeDirectory, "root.yaml");
  const locatorRoot = path.join(
    workingDirectory,
    ".casegraph",
    caseId,
    "root.yaml",
  );
  await mkdir(homeDirectory, { recursive: true });
  await mkdir(path.dirname(locatorRoot), { recursive: true });
  await writeCaseHome(homeRoot, {
    type: "create",
    value: {
      apiVersion: CASEGRAPH_API_VERSION,
      kind: "CaseHome",
      metadata: { name: caseId },
      spec: {
        graphRoot: { type: "node", kind: "case", id: "root" },
        packagePath: [],
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    },
  });
  await writeCaseLocator(locatorRoot, {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseLocator",
    metadata: { name: caseId },
    spec: { home: homeRoot },
  });
}

async function writeImportedCaseState(
  workingDirectory: string,
  caseId: string,
): Promise<void> {
  const workspacePath = path.join(workingDirectory, "workspace", caseId);
  await mkdir(workspacePath, { recursive: true });
  await writeFile(
    path.join(workspacePath, "root.yaml"),
    'type: "node"\nkind: "case"\nid: "root"\ncreated_at: "2026-05-12T00:00:00.000Z"\nupdated_at: "2026-05-12T00:00:00.000Z"\nsources:\n  - source_system: "courtlistener"\n    source_model: "docket"\n    source_id: "10000001"\n',
  );
  await writeFile(
    path.join(workspacePath, "docket-node.yaml"),
    'type: "node"\nkind: "docket"\nid: "docket-node"\ncase_name: "Example v. Example City"\ndocket_entries:\n  - "entry-one"\n  - "entry-two"\nparties:\n  - "party-one"\nattorneys:\n  - "attorney-one"\nrecap_documents:\n  - "document-one"\nsources:\n  - source_system: "courtlistener"\n    source_model: "docket"\n    source_id: "10000001"\n',
  );
  await writeFile(
    path.join(workspacePath, "entry-one.yaml"),
    'type: "node"\nkind: "docket_entry"\nid: "entry-one"\nentry_number: 1\ndate_filed: "2026-01-10"\ndescription: "COMPLAINT against Example City filed by Alex Example."\nrecap_documents:\n  - "document-one"\nsources:\n  - source_system: "courtlistener"\n    source_model: "docket_entry"\n',
  );
  await writeFile(
    path.join(workspacePath, "entry-two.yaml"),
    'type: "node"\nkind: "docket_entry"\nid: "entry-two"\nentry_number: 16\ndate_filed: "2026-02-12"\ndescription: "RESPONSE filed by Alex Example with an intentionally long docket text that should be truncated before it wraps in a normal terminal."\nsources:\n  - source_system: "courtlistener"\n    source_model: "docket_entry"\n',
  );
  await writeFile(
    path.join(workspacePath, "document-one.yaml"),
    'type: "node"\nkind: "document"\nid: "document-one"\ndocket_entry: "entry-one"\ndocument_number: 1\ndocument_type: "complaint"\ndescription: "Complaint PDF"\ncites:\n  - 300001\nsources:\n  - source_system: "courtlistener"\n    source_model: "recap_document"\n  - source_system: "courtlistener"\n    source_model: "citation_lookup"\n',
  );
  await writeFile(
    path.join(workspacePath, "party-one.yaml"),
    'type: "node"\nkind: "party"\nid: "party-one"\nsources:\n  - source_system: "courtlistener"\n    source_model: "party"\n',
  );
  await writeFile(
    path.join(workspacePath, "attorney-one.yaml"),
    'type: "node"\nkind: "attorney"\nid: "attorney-one"\nsources:\n  - source_system: "courtlistener"\n    source_model: "attorney"\n',
  );
  await writeExternalCaseLocator(workingDirectory, caseId);
}

async function writeCaseWithAvailableComplaint(
  workingDirectory: string,
  caseId: string,
): Promise<string> {
  await writeValidCaseRoot(workingDirectory, caseId);
  const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
  await writeMinimalPdf(pdfPath);
  await writeFile(
    path.join(workingDirectory, "workspace", caseId, "complaint.yaml"),
    `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(pdfPath)}\nplain_text: "On January 15, 2024, Alex Example alleges an encounter with Example City police in Example City, Example State that led to his arrest."\ncreated_at: "2026-05-12T00:00:00.000Z"\nupdated_at: "2026-05-12T00:00:00.000Z"\n`,
  );

  return pdfPath;
}

async function snapshotFiles(directory: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();

  async function visit(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      snapshot.set(
        path.relative(directory, entryPath),
        await readFile(entryPath, "utf8"),
      );
    }
  }

  await visit(directory);

  return snapshot;
}

function outsideAnalysisSnapshot(
  snapshot: Map<string, string>,
): Map<string, string> {
  return new Map(
    [...snapshot.entries()].filter(([filePath]) => {
      return !filePath.startsWith("analysis/");
    }),
  );
}

function expectNoUnimplementedAnalysisCommands(output: string): void {
  expect(output).not.toContain("analysis apply");
  expect(output).not.toContain("analysis abandon");
  expect(output).not.toContain("analysis status");
  expect(output).not.toContain("analysis export");
  expect(output).not.toContain("analysis import");
}

async function expectAnalysisNotCreated(
  result: CliResult,
  workspacePath: string,
): Promise<void> {
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain(
    "Analysis not created.",
  );
  expectNoUnimplementedAnalysisCommands(`${result.stdout}\n${result.stderr}`);
  await expect(
    stat(path.join(workspacePath, "analysis", "current")),
  ).rejects.toThrow();
}

type MockRoute = {
  status?: number;
  body: unknown;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function makeCourtListenerFetch(
  routes: Partial<Record<string, MockRoute>>,
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    const route = routes[`${method} ${url}`];

    if (!route) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ detail: `Unexpected request: ${method} ${url}` }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

function courtListenerRoutes(overrides: Record<string, MockRoute> = {}) {
  const base = "https://www.courtlistener.com/api/rest/v4";

  return {
    [`GET ${base}/dockets/10000001/`]: {
      body: {
        id: 10000001,
        court: `${base}/courts/txnd/`,
        court_id: "txnd",
        case_name: "Example v. Example City",
        slug: "example-v-example-city",
        docket_number: "1:26-cv-00001",
        date_filed: "2026-01-10",
        jurisdiction_type: "Federal Question",
        nature_of_suit: "440 Civil Rights: Other Civil Rights",
        pacer_case_id: "412528",
      },
    },
    [`GET ${base}/docket-entries/?docket=10000001`]: {
      body: {
        next: null,
        previous: null,
        results: [
          {
            id: 454253864,
            docket: `${base}/dockets/10000001/`,
            date_filed: "2026-02-12",
            entry_number: 16,
            description: "RESPONSE filed by Alex Example",
            recap_documents: [`${base}/recap-documents/200000001/`],
          },
        ],
      },
    },
    [`GET ${base}/parties/?docket=10000001&filter_nested_results=True`]: {
      body: {
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            name: "Alex Example",
            party_types: ["Plaintiff"],
            attorneys: [],
          },
          {
            id: 2,
            name: "Example City",
            party_types: ["Defendant"],
            attorneys: [],
          },
        ],
      },
    },
    [`GET ${base}/attorneys/?docket=10000001&filter_nested_results=True`]: {
      body: {
        next: null,
        previous: null,
        results: [
          {
            id: 10,
            name: "Saul Pedregon",
            contact_raw: "raw contact",
            parties_represented: [`${base}/parties/2/`],
          },
        ],
      },
    },
    [`GET ${base}/recap-documents/?docket_entry__docket=10000001`]: {
      body: {
        next: null,
        previous: null,
        results: [
          {
            id: 200000001,
            absolute_url: "/docket/10000001/16/example-v-example-city/",
            docket_entry: `${base}/docket-entries/454253864/`,
            document_number: "16",
            attachment_number: null,
            description: "RESPONSE filed by Alex Example",
            filepath_local:
              "recap/gov.uscourts.txnd.412528/gov.uscourts.txnd.412528.16.0.pdf",
            is_available: true,
            is_sealed: false,
            plain_text: "Ashcroft v. Iqbal, 556 U.S. 662",
            cites: [300001],
          },
        ],
      },
    },
    [`POST ${base}/citation-lookup/`]: {
      body: [
        {
          citation: "556 U.S. 662",
          normalized_citations: ["556 U.S. 662"],
          start_index: 19,
          end_index: 31,
          status: 200,
          error_message: "",
          clusters: [{ id: 300001, case_name: "Ashcroft v. Iqbal" }],
        },
      ],
    },
    ...overrides,
  };
}

function createSequentialIds(...ids: string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (!id) {
      throw new Error("No test ID available");
    }

    return id;
  };
}

describe("casegraph help", () => {
  test("root help lists the cases command group", async () => {
    const result = await runCasegraph(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: casegraph");
    expect(result.stdout).toContain("cases");
  });

  test("cases help lists the new case command", async () => {
    const result = await runCasegraph(["cases", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: casegraph cases");
    expect(result.stdout).toContain("new <case-id>");
    expect(result.stdout).toContain("analysis");
    expect(result.stdout).toContain(
      "add document <case-id> complaint <path-to-pdf>",
    );
    expect(result.stdout).toContain("add evidence <case-id> <path-to-file>");
  });

  test("cases add help lists add commands", async () => {
    const result = await runCasegraph(["cases", "add", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "casegraph cases add document <case-id> complaint <path-to-pdf>",
    );
    expect(result.stdout).toContain(
      "casegraph cases add evidence <case-id> <path-to-file>",
    );
  });

  test("cases add document help explains complaint document recording", async () => {
    const result = await runCasegraph(["cases", "add", "document", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Usage: casegraph cases add document <case-id> complaint <path-to-pdf>",
    );
    expect(result.stdout).toContain("Only complaint documents are supported");
    expect(result.stdout).toContain("must exist, be readable, and be a PDF");
  });

  test("cases new help explains explicit external homes", async () => {
    const result = await runCasegraph(["cases", "new", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "cases new <case-id> --home <directory> [--yes]",
    );
    expect(result.stdout).toContain("explicit external directory");
    expect(result.stdout).toContain("registered on this machine");
    expect(result.stdout).toContain(
      "letters, numbers, hyphens, and underscores",
    );
    expect(result.stdout).toContain("asks before creating");
  });

  test("cases import help explains CourtListener import", async () => {
    const result = await runCasegraph(["cases", "import", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "casegraph cases import courtlistener <docket-id>",
    );
    expect(result.stdout).toContain("COURTLISTENER_API_TOKEN");
    expect(result.stdout).toContain("Dry-run is the default");
  });

  test("cases report help explains read-only legal docket reporting", async () => {
    const result = await runCasegraph(["cases", "report", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: casegraph cases report <case-id>");
    expect(result.stdout).toContain("read-only legal docket");
    expect(result.stdout).toContain(
      "omitted only when exactly one valid case exists",
    );
  });

  test("cases analysis help lists analysis commands", async () => {
    const result = await runCasegraph(["cases", "analysis", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: casegraph cases analysis");
    expect(result.stdout).toContain("new <case-id>");
    expect(result.stdout).toContain("resume <case-id>");
  });

  test("cases analysis new help explains review-only artifacts", async () => {
    const result = await runCasegraph(["cases", "analysis", "new", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Usage: casegraph cases analysis new <case-id>",
    );
    expect(result.stdout).toContain("incident-from-complaint workflow");
    expect(result.stdout).toContain(
      "propose an incident change set without changing main",
    );
    expect(result.stdout).toContain(
      "omitted only when exactly one valid case exists",
    );
    expectNoUnimplementedAnalysisCommands(result.stdout);
  });

  test("does not replace analysis action failures with generic cases help", async () => {
    const result = await runCasegraphInProcess(
      ["cases", "analysis", "new", "example-v-example-city"],
      repoRoot,
      {
        emitProgress() {
          throw new Error("workflow diagnostics stream failed");
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("workflow diagnostics stream failed");
    expect(result.stderr).not.toContain("Usage: casegraph cases <command>");
  });

  test("cases analysis resume help explains current analysis continuation", async () => {
    const result = await runCasegraph([
      "cases",
      "analysis",
      "resume",
      "--help",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "Usage: casegraph cases analysis resume <case-id>",
    );
    expect(result.stdout).toContain("Continue the current analysis");
    expect(result.stdout).toContain("analysis/current/root.yaml");
    expectNoUnimplementedAnalysisCommands(result.stdout);
  });
});

describe("casegraph cases analysis new", () => {
  test("OpenAI extraction JSON schema defines items for every array", () => {
    expect(arraySchemasMissingItems(IncidentExtractionJsonSchema)).toEqual([]);
  });

  test("OpenAI JSON responses are cached by domain, task ID, and exact request", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const cacheDirectory = path.join(workingDirectory, ".cache");
    const responseBody = {
      output_text: JSON.stringify({ status: "cached-result" }),
    };
    let fetchCount = 0;
    const request = {
      input: "prompt text",
      jsonSchema: {
        additionalProperties: false,
        properties: { status: { type: "string" } },
        required: ["status"],
        type: "object",
      },
      model: "gpt-test",
      schemaName: "test_schema",
    };
    const cacheKey = aiCacheKey({
      input: request.input,
      jsonSchema: request.jsonSchema,
      model: request.model,
      schemaName: request.schemaName,
    });
    const cachePath = path.join(
      cacheDirectory,
      "case-analysis",
      "extract-incident",
      "task-123",
      `${cacheKey}.json`,
    );

    try {
      const first = await openAiResponsesJsonWithResponse({
        ...request,
        apiKey: "test-key",
        cache: {
          directory: cacheDirectory,
          domain: ["case-analysis", "extract-incident"],
          taskId: "task-123",
        },
        fetch: () => {
          fetchCount += 1;
          return Promise.resolve(
            new Response(JSON.stringify(responseBody), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          );
        },
        prompt: request.input,
      });
      const second = await openAiResponsesJsonWithResponse({
        ...request,
        apiKey: "test-key",
        cache: {
          directory: cacheDirectory,
          domain: ["case-analysis", "extract-incident"],
          taskId: "task-123",
        },
        fetch: () => {
          throw new Error("Network call should not happen on cache hit.");
        },
        prompt: request.input,
      });

      expect(fetchCount).toBe(1);
      expect(first.parsed).toEqual({ status: "cached-result" });
      expect(second.parsed).toEqual({ status: "cached-result" });
      expect(await readFile(cachePath, "utf8")).toBe(
        `${JSON.stringify(responseBody, null, 2)}\n`,
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects extracted complaint text that only contains PDF page headers", () => {
    expect(
      isUsableExtractedPdfText(
        [
          "Case 1:26-cv-00001 Document 3 Filed 01/10/26 Page 1 of 32 PageID 5",
          "",
          "-- 1 of 32 --",
          "",
          "Case 1:26-cv-00001 Document 3 Filed 01/10/26 Page 2 of 32 PageID 6",
          "",
          "-- 2 of 32 --",
        ].join("\n"),
      ),
    ).toBe(false);
    expect(
      isUsableExtractedPdfText(
        "COMPLAINT FOR A CIVIL CASE\n".repeat(30) +
          "Plaintiff alleges facts in the complaint body.",
      ),
    ).toBe(true);
  });

  test("pdf-to-markdown asks for an original PDF before OCR fallback", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const workflowDirectory = path.join(
        workingDirectory,
        "analysis",
        "current",
        "incident-from-complaint",
      );
      const downloadedPdf = path.join(workingDirectory, "downloaded.pdf");
      const originalPdf = path.join(
        workingDirectory,
        "My Drive",
        "original complaint.pdf",
      );
      await writeMinimalPdf(downloadedPdf);
      await writeMinimalPdf(originalPdf);

      const answers = [`'${originalPdf}'`, ""];
      const progress: string[] = [];
      const result = await runPdfToMarkdownWorkflow({
        analysisId: "analysis-test",
        caseId: "example-v-example-city",
        progress(message) {
          progress.push(message);
        },
        promptForOriginalPdfPath() {
          return Promise.resolve(answers.shift());
        },
        source: {
          pdfPath: downloadedPdf,
          recordId: "complaint",
          recordKind: "document",
          selectionReason: "test complaint",
        },
        taskRunId: "task-test",
        timestamp: "2026-05-17T00:00:00.000Z",
        visionExtractor: null,
        workflowDirectory,
      });

      const extraction = await readFile(
        path.join(
          workflowDirectory,
          "artifacts",
          "pdf-to-markdown-extraction.yaml",
        ),
        "utf8",
      );

      expect(result.status).toBe("paused");
      expect(result.alternateOriginalPdfRelativePath).toBeUndefined();
      expect(result.pdfPath).toBe(downloadedPdf);
      expect(progress).toContain(
        "pdf-to-markdown: native text was not usable; asking for original complaint PDF before OCR",
      );
      expect(progress).toContain(
        `pdf-to-markdown: provided original complaint PDF native text is not usable: ${originalPdf}`,
      );
      expect(extraction).toContain('method: "alternate-original"');
      expect(extraction).toContain(
        "No original complaint PDF path was provided.",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("pdf-to-markdown keeps asking until original path is blank or usable", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const workflowDirectory = path.join(
        workingDirectory,
        "analysis",
        "current",
        "incident-from-complaint",
      );
      const downloadedPdf = path.join(workingDirectory, "downloaded.pdf");
      const missingPdf = path.join(workingDirectory, "missing.pdf");
      const originalPdf = path.join(workingDirectory, "original.pdf");
      await writeMinimalPdf(downloadedPdf);
      await writeMinimalPdf(originalPdf);

      const prompts: {
        invalidPath?: string;
        unusableNativeTextPath?: string;
      }[] = [];
      const answers = [`'${missingPdf}'`, `"${originalPdf}"`, ""];
      const progress: string[] = [];
      const result = await runPdfToMarkdownWorkflow({
        analysisId: "analysis-test",
        caseId: "example-v-example-city",
        progress(message) {
          progress.push(message);
        },
        promptForOriginalPdfPath(input) {
          prompts.push({
            invalidPath: input.invalidPath,
            unusableNativeTextPath: input.unusableNativeTextPath,
          });
          return Promise.resolve(answers.shift());
        },
        source: {
          pdfPath: downloadedPdf,
          recordId: "complaint",
          recordKind: "document",
          selectionReason: "test complaint",
        },
        taskRunId: "task-test",
        timestamp: "2026-05-17T00:00:00.000Z",
        visionExtractor: null,
        workflowDirectory,
      });

      expect(result.status).toBe("paused");
      expect(prompts).toEqual([
        {},
        { invalidPath: missingPdf },
        { unusableNativeTextPath: originalPdf },
      ]);
      expect(progress).toContain(
        `pdf-to-markdown: provided original complaint PDF is not readable: ${missingPdf}`,
      );
      expect(progress).toContain(
        `pdf-to-markdown: provided original complaint PDF native text is not usable: ${originalPdf}`,
      );
      expect(progress).toContain(
        `pdf-to-markdown: rendering PDF pages from ${downloadedPdf}`,
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("creates the incident-from-complaint current analysis workflow from an available complaint", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const before = await snapshotFiles(workspacePath);

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );
      const currentRootPath = path.join(
        workspacePath,
        "analysis",
        "current",
        "root.yaml",
      );
      const workflowDirectory = path.join(
        workspacePath,
        "analysis",
        "current",
        "incident-from-complaint",
      );
      const workflowRootPath = path.join(workflowDirectory, "root.yaml");
      const changeSetPath = path.join(workflowDirectory, "change-set.yaml");
      const reportPath = path.join(workflowDirectory, "report.md");
      const extractionPath = path.join(
        workflowDirectory,
        "artifacts",
        "extraction.yaml",
      );
      const workflowRunPath = path.join(workflowDirectory, "workflow-run.yaml");
      const after = await snapshotFiles(workspacePath);

      expect(result.exitCode).toBe(0);
      expect((await stat(currentRootPath)).isFile()).toBe(true);
      expect((await stat(workflowRootPath)).isFile()).toBe(true);
      expect((await stat(changeSetPath)).isFile()).toBe(true);
      expect((await stat(reportPath)).isFile()).toBe(true);
      expect((await stat(extractionPath)).isFile()).toBe(true);
      expect((await stat(workflowRunPath)).isFile()).toBe(true);
      const currentRoot = await readFile(currentRootPath, "utf8");
      const workflowRoot = await readFile(workflowRootPath, "utf8");
      const changeSet = await readFile(changeSetPath, "utf8");
      const incidentReport = await readFile(reportPath, "utf8");
      const extraction = await readFile(extractionPath, "utf8");
      const workflowRun = await readFile(workflowRunPath, "utf8");
      const pdfTaskRootPath = workflowRoot.match(
        /path: "(tasks\/pdf-to-markdown\/[^"]+\/root\.yaml)"/,
      )?.[1];
      const extractIncidentTaskRootPath = workflowRoot.match(
        /path: "(tasks\/extract-incident\/[^"]+\/root\.yaml)"/,
      )?.[1];
      expect(pdfTaskRootPath).toBeDefined();
      expect(extractIncidentTaskRootPath).toBeDefined();
      if (!pdfTaskRootPath || !extractIncidentTaskRootPath) {
        throw new Error("Expected workflow root to record task run paths.");
      }
      const pdfTaskRunId = path.basename(path.dirname(pdfTaskRootPath));
      const extractIncidentTaskRunId = path.basename(
        path.dirname(extractIncidentTaskRootPath),
      );
      expect(
        (await stat(path.join(workflowDirectory, pdfTaskRootPath))).isFile(),
      ).toBe(true);
      expect(
        (
          await stat(path.join(workflowDirectory, extractIncidentTaskRootPath))
        ).isFile(),
      ).toBe(true);
      const extractIncidentTaskDirectory = path.dirname(
        path.join(workflowDirectory, extractIncidentTaskRootPath),
      );
      expect(
        (
          await stat(path.join(extractIncidentTaskDirectory, "report.md"))
        ).isFile(),
      ).toBe(true);
      expect(result.stdout).toContain("Analysis created.");
      expect(result.stdout).toContain("# Incident From Complaint Report");
      expect(result.stdout).toContain("Main graph:");
      expect(result.stdout).toContain("unchanged");
      expect(result.stdout).toContain(
        "- label: January 15, 2024 Example City arrest incident",
      );
      expect(result.stdout).not.toContain("Read:");
      expect(result.stderr).toContain(
        "analysis new: resolving case example-v-example-city",
      );
      expect(result.stderr).toContain(
        "analysis new: checking main graph for existing incident",
      );
      expect(result.stderr).toContain("pdf-to-markdown: starting task");
      expect(result.stderr).toContain(
        "incident-from-complaint: starting workflow",
      );
      expect(result.stderr).toContain(
        "incident-from-complaint: compiling LangGraph workflow",
      );
      expect(result.stderr).toContain(
        "incident-from-complaint: invoking LangGraph workflow",
      );
      expect(result.stderr).toContain(
        "incident-from-complaint: validating source grounding",
      );
      expect(result.stderr).toContain("analysis new: writing");
      expect(result.stderr).toContain("analysis new: done");
      expectNoUnimplementedAnalysisCommands(result.stdout);
      expect(currentRoot).toMatch(/^analysis_id: "?[^"\n]+"?$/m);
      expect(currentRoot).toContain('case_id: "example-v-example-city"\n');
      expect(currentRoot).toContain("main_graph:");
      expect(currentRoot).toContain('hash_algorithm: "sha256"');
      expect(currentRoot).toMatch(/graph_hash: "sha256:[a-f0-9]{64}"/);
      expect(currentRoot).toContain("records:");
      expect(currentRoot).toMatch(/complaint: "sha256:[a-f0-9]{64}"/);
      expect(currentRoot).toMatch(/root: "sha256:[a-f0-9]{64}"/);
      expect(currentRoot).toContain("runs:");
      const commandRunPath = currentRoot.match(
        /runs:[\s\S]*?path: "([^"]+\.yaml)"/,
      )?.[1];
      expect(commandRunPath).toMatch(/^[a-z0-9]+\.yaml$/);
      if (!commandRunPath) {
        throw new Error("Expected current root to record command run path.");
      }
      const commandRun = await readFile(
        path.join(workspacePath, "analysis", "current", commandRunPath),
        "utf8",
      );
      expect(commandRun).toContain('operation: "analysis new"');
      expect(commandRun).toContain('status: "completed"');
      expect(commandRun).toContain('workflow: "incident-from-complaint"');
      expect(commandRun).toContain(
        'report: "incident-from-complaint/report.md"',
      );
      expect(currentRoot).not.toContain("based_on:");
      expect(currentRoot).not.toContain("main_graph_source_record_ids:");
      expect(currentRoot.indexOf('"main"')).toBeLessThan(
        currentRoot.indexOf('"incident-from-complaint"'),
      );
      expect(currentRoot).toContain(
        'path: "incident-from-complaint/root.yaml"',
      );
      expect(currentRoot).not.toContain('path: "pdf-to-markdown/root.yaml"');
      expect(result.stdout).not.toContain("# PDF To Markdown Report");
      expect(currentRoot).toMatch(/^created_at: "[^"]+"$/m);
      expect(currentRoot).toMatch(/^updated_at: "[^"]+"$/m);
      expect(currentRoot).not.toContain("null");
      expect(workflowRoot).toContain('name: "incident-from-complaint"');
      expect(workflowRoot).toContain("status:");
      expect(workflowRoot).toContain("working_graph:");
      expect(workflowRoot).toContain("input_snapshot:");
      expect(workflowRoot).toContain("output_snapshot:");
      expect(workflowRoot).toMatch(/graph_hash: "sha256:[a-f0-9]{64}"/);
      expect(workflowRoot).toContain(
        'incident-from-complaint/change-set: "sha256:',
      );
      expect(workflowRoot).toContain("complaint_source:");
      expect(workflowRoot).toContain('record_id: "complaint"');
      expect(workflowRoot).toContain('change_set: "change-set.yaml"');
      expect(workflowRoot).toContain('report: "report.md"');
      expect(workflowRoot).toContain('workflow_run: "workflow-run.yaml"');
      expect(workflowRoot).toContain('extraction: "artifacts/extraction.yaml"');
      expect(workflowRoot).toContain("tasks:");
      expect(workflowRoot).toContain('name: "pdf-to-markdown"');
      expect(workflowRoot).toContain('path: "tasks/pdf-to-markdown/');
      expect(workflowRoot).toContain('name: "extract-incident"');
      expect(workflowRoot).toContain('path: "tasks/extract-incident/');
      expect(workflowRoot).toContain("history:");
      expect(workflowRoot).toContain("workflow_created");
      expect(workflowRoot).toMatch(/workflow_(completed|paused)/);
      expect(workflowRoot).not.toContain("null");
      expect(changeSet).toContain('workflow: "incident-from-complaint"');
      expect(changeSet).toContain('review_state: "proposed"');
      expect(changeSet).not.toContain('review_state: "approved"');
      expect(changeSet).not.toContain('review_state: "applied"');
      for (const match of changeSet.matchAll(/^review_state: ([^\n]+)$/gm)) {
        expect([
          "proposed",
          "approved",
          "discarded",
          "conflicted",
          "applied",
        ]).toContain(match[1].replaceAll('"', ""));
      }
      expect(changeSet).toContain('kind: "incident"');
      expect(changeSet).toContain(
        'label: "January 15, 2024 Example City arrest incident"',
      );
      expect(changeSet).toContain(
        'summary: "A January 15, 2024 encounter with Example City police that allegedly led to Plaintiff\'s arrest."',
      );
      expect(changeSet).toContain('date: "January 15, 2024"');
      expect(changeSet).toContain('time: "unknown"');
      expect(changeSet).toContain('location: "Example City, Example State"');
      expect(changeSet).toContain("actors:");
      expect(changeSet).toContain("sources:");
      expect(changeSet).not.toContain("authorities:");
      expect(changeSet).toContain("review_note:");
      expect(changeSet).toContain("events:");
      expect(changeSet).toContain('type: "custody"');
      expect(changeSet).toContain('role: "arresting-actor"');
      expect(changeSet).not.toContain('type: "add-timeline-event"');
      expect(changeSet).not.toContain('type: "add-action-or-movement"');
      expect(changeSet).toContain('type: "add-source-reference"');
      expect(changeSet).toContain('type: "add-data-request"');
      expect(changeSet).not.toContain('type: "add-missing-source-note"');
      expect(changeSet).toContain('kind: "data-request"');
      expect(changeSet).toContain(
        'target_agency: "Example City Police Department"',
      );
      expect(changeSet).toContain(
        'request_text: "Request body-worn camera footage for the January 15, 2024 Example City arrest incident."',
      );
      expect(changeSet).toContain("source_references:");
      expect(changeSet).toContain("source_task_run_ids:");
      expect(changeSet).toContain(`- "${pdfTaskRunId}"`);
      expect(changeSet).toContain(`- "${extractIncidentTaskRunId}"`);
      expect(changeSet).toContain("complaint_locator:");
      expect(changeSet).toMatch(
        /support_kind: "?(?:direct-quote|paraphrase|summary|inference|missing-source-observation)"?/,
      );
      expect(changeSet).toContain('support_kind: "missing-source-observation"');
      expect(changeSet).toContain("counts_as_proof: false");
      expect(changeSet).not.toMatch(
        /kind: (claim|defense|legal_standard|motion_argument|litigation_strategy)/,
      );
      expect(incidentReport).toContain("# Incident From Complaint Report");
      for (const heading of [
        "## Incident",
        "## Date and Time",
        "## Location",
        "## Actors",
        "## Sequence of Events",
        "## Statements",
        "## Source Materials",
        "## Change Review Tree",
        "## Proposed Changes",
        "## Uncertainties and Review Items",
        "## Next Review Actions",
      ]) {
        expect(incidentReport).toContain(heading);
      }
      expect(incidentReport).toContain(
        "- label: January 15, 2024 Example City arrest incident",
      );
      expect(incidentReport).toContain(
        "- summary: A January 15, 2024 encounter with Example City police that allegedly led to Plaintiff's arrest.",
      );
      expect(incidentReport).toContain("- count: one primary incident");
      expect(incidentReport).toContain("- date: January 15, 2024");
      expect(incidentReport).toContain("- time: unknown");
      expect(incidentReport).toContain("- certainty: unknown");
      expect(incidentReport).toContain(
        "- primary: Example City, Example State",
      );
      expect(incidentReport).toContain("Example City police officers");
      expect(incidentReport).toContain(
        "| time | label | actors | description | locations |",
      );
      expect(incidentReport).toContain("| --- | --- | --- | --- | --- |");
      expect(incidentReport).toContain("| unknown | action |");
      expect(incidentReport).toContain("| unknown | custody |");
      expect(incidentReport).toContain(
        "alex-example as target, example-city-police-officers as actor targeting alex-example",
      );
      expect(incidentReport).toContain("complaint: complaint text");
      expect(incidentReport).not.toContain("## Actions and Movements");
      expect(incidentReport).not.toContain("- base: main");
      expect(incidentReport).toContain("  - new-node");
      expect(incidentReport).toContain("    - kind: incident");
      expect(incidentReport).toContain(
        "    - label: January 15, 2024 Example City arrest incident",
      );
      expect(incidentReport).toContain("  - update-node: complaint");
      expect(incidentReport).toContain(
        "    - property: alternate_representations",
      );
      expect(incidentReport).toContain("    - action: add-to-map");
      expect(incidentReport).toContain("  - new-node");
      expect(incidentReport).toContain("    - kind: data-request");
      expect(incidentReport).toContain(
        "    - incomplete: source material is needed-to-verify; data request needs review.",
      );
      expect(incidentReport).not.toContain("  - add-incident: Add incident");
      expect(incidentReport).toContain("- no source reference: no change");
      expect(incidentReport).toContain("- no pinpoint: no support");
      expect(incidentReport).toContain("- review change-set.yaml");
      expect(incidentReport).not.toMatch(
        /claims|defenses|Monell|legal standards|motion arguments|settlement value|litigation strategy/i,
      );
      expect(extraction).toContain(
        'label: "January 15, 2024 Example City arrest incident"',
      );
      expect(workflowRun).toContain('engine: "langgraph"');
      expect(workflowRun).toContain('ai: "openai-responses"');
      expect(workflowRun).toContain('extraction: "artifacts/extraction.yaml"');
      expect(outsideAnalysisSnapshot(after)).toEqual(
        outsideAnalysisSnapshot(before),
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("creates analysis for the only valid case when case ID is omitted", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );

      const result = await runCasegraph(
        ["cases", "analysis", "new"],
        workingDirectory,
      );
      const analysisEntries = await readdir(
        path.join(
          workingDirectory,
          "workspace",
          "example-v-example-city",
          "analysis",
          "current",
        ),
      );

      expect(result.exitCode).toBe(0);
      expect(analysisEntries).toContain("root.yaml");
      expect(analysisEntries).toContain("incident-from-complaint");
      await expect(
        stat(path.join(workingDirectory, "current-case")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph-current")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, "case.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("downloads missing complaint PDF into the workflow run and proposes durable graph updates", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      await writeFile(
        path.join(workspacePath, "entry-one.yaml"),
        'type: "node"\nkind: "docket_entry"\nid: "entry-one"\ndescription: "COMPLAINT against Example City filed by Alex Example."\ndocuments:\n  complaint:\n    role: "complaint"\n',
      );
      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        'type: "node"\nkind: "document"\nid: "complaint"\ndocket_entry: "entry-one"\ndocument_type: "complaint"\ndescription: "Complaint"\nplain_text: "Complaint text from source metadata."\nsources:\n  - source_system: "courtlistener"\n    source_model: "recap_document"\n    source_id: "200000002"\n    download_url: "data:application/pdf,%25PDF-1.7%0A"\n',
      );
      const before = await snapshotFiles(workspacePath);

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      const workflowDirectory = path.join(
        workspacePath,
        "analysis",
        "current",
        "incident-from-complaint",
      );
      const downloadedPdfPath = path.join(
        workflowDirectory,
        "artifacts",
        "complaint.pdf",
      );
      const workflowRoot = await readFile(
        path.join(workflowDirectory, "root.yaml"),
        "utf8",
      );
      const complaintTextRelativePath = workflowRoot.match(
        /complaint_text: "([^"]+)"/,
      )?.[1];
      expect(complaintTextRelativePath).toMatch(/^artifacts\/[a-z0-9]+\.yaml$/);
      if (!complaintTextRelativePath) {
        throw new Error(
          "Expected workflow root to record complaint text path.",
        );
      }
      const complaintTextPath = path.join(
        workflowDirectory,
        complaintTextRelativePath,
      );
      const changeSet = await readFile(
        path.join(
          workspacePath,
          "analysis",
          "current",
          "incident-from-complaint",
          "change-set.yaml",
        ),
        "utf8",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(
        "incident-from-complaint: downloading complaint PDF from data:application/pdf,%25PDF-1.7%0A",
      );
      expect(result.stderr).toContain(
        `incident-from-complaint: writing workflow PDF ${downloadedPdfPath}`,
      );
      expect(result.stderr).not.toContain("pdf-to-markdown: downloading");
      expect(await readFile(downloadedPdfPath, "utf8")).toBe("%PDF-1.7\n");
      const textArtifact = await readFile(complaintTextPath, "utf8");
      const textArtifactId = textArtifact.match(/^id: "([^"]+)"$/m)?.[1];
      expect(textArtifactId).toBeDefined();
      if (!textArtifactId) {
        throw new Error("Expected complaint text artifact to have an id.");
      }
      expect(textArtifact).toContain('type: "node"');
      expect(textArtifact).toContain('kind: "markdown"');
      expect(await readFile(complaintTextPath, "utf8")).toContain(
        'method: "source-metadata"',
      );
      expect(textArtifact).not.toContain('Complaint text"');
      expect(textArtifact).toContain(
        "text: |-\n  Complaint text from source metadata.",
      );
      expect(workflowRoot).toContain(
        'complaint_pdf: "artifacts/complaint.pdf"',
      );
      expect(workflowRoot).toContain(
        `complaint_text: "${complaintTextRelativePath}"`,
      );
      expect(changeSet).toContain('type: "promote-artifact-to-case-files"');
      expect(changeSet).toContain("alternate_representations:");
      expect(changeSet).toContain(`  ${textArtifactId}:`);
      expect(changeSet).toContain('kind: "markdown"');
      expect(changeSet).toContain(
        `artifact_path: "${complaintTextRelativePath}"`,
      );
      expect(changeSet).toContain('type: "update-document-file-path"');
      expect(changeSet).toContain('type: "update-docket-entry-documents"');
      expect(changeSet).toContain('role: "complaint"');
      expect(
        outsideAnalysisSnapshot(await snapshotFiles(workspacePath)),
      ).toEqual(outsideAnalysisSnapshot(before));
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to create analysis when current analysis already exists", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const currentPath = path.join(workspacePath, "analysis", "current");
      await mkdir(currentPath, { recursive: true });
      await writeFile(
        path.join(currentPath, "root.yaml"),
        'analysis_id: "existing-analysis"\ncase_id: "example-v-example-city"\n',
      );

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Analysis not created.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "A current analysis already exists.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases analysis resume example-v-example-city",
      );
      expectNoUnimplementedAnalysisCommands(
        `${result.stdout}\n${result.stderr}`,
      );
      await expect(
        stat(path.join(currentPath, "incident-from-complaint")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("uses the current root, not the directory alone, as the current analysis lock", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const currentPath = path.join(workspacePath, "analysis", "current");
      await mkdir(path.join(currentPath, "incident-from-complaint"), {
        recursive: true,
      });

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect((await stat(path.join(currentPath, "root.yaml"))).isFile()).toBe(
        true,
      );
      expect(
        (
          await stat(
            path.join(
              currentPath,
              "incident-from-complaint",
              "change-set.yaml",
            ),
          )
        ).isFile(),
      ).toBe(true);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("creates current root early and resumes after complaint text becomes available", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);
      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(pdfPath)}\n`,
      );

      const firstResult = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );
      const currentRootPath = path.join(
        workspacePath,
        "analysis",
        "current",
        "root.yaml",
      );
      const workflowDirectory = path.join(
        workspacePath,
        "analysis",
        "current",
        "incident-from-complaint",
      );

      expect(firstResult.exitCode).not.toBe(0);
      expect((await stat(currentRootPath)).isFile()).toBe(true);
      const createdRoot = await readFile(currentRootPath, "utf8");
      const pdfTaskRootPath = createdRoot.match(
        /path: "(tasks\/pdf-to-markdown\/[^"]+\/root\.yaml)"/,
      )?.[1];
      const extractIncidentTaskRootPath = createdRoot.match(
        /path: "(tasks\/extract-incident\/[^"]+\/root\.yaml)"/,
      )?.[1];
      expect(pdfTaskRootPath).toBeDefined();
      expect(extractIncidentTaskRootPath).toBeDefined();
      expect(`${firstResult.stdout}\n${firstResult.stderr}`).toContain(
        "Analysis not completed.",
      );
      expect(`${firstResult.stdout}\n${firstResult.stderr}`).toContain(
        "after native text, OCR, and vision extraction attempts",
      );
      expect(`${firstResult.stdout}\n${firstResult.stderr}`).toContain(
        "casegraph cases analysis resume example-v-example-city",
      );
      await expect(
        stat(
          path.join(
            workspacePath,
            "analysis",
            "current",
            "incident-from-complaint",
            "artifacts",
            "extraction.yaml",
          ),
        ),
      ).rejects.toThrow();

      if (!pdfTaskRootPath) {
        throw new Error("Expected current root to record PDF task path.");
      }
      if (!extractIncidentTaskRootPath) {
        throw new Error(
          "Expected current root to record extract incident task path.",
        );
      }
      const textNodeId = path.basename(path.dirname(pdfTaskRootPath));
      await writeFile(
        path.join(workflowDirectory, "artifacts", `${textNodeId}.yaml`),
        `type: "node"\nkind: "markdown"\nid: ${JSON.stringify(textNodeId)}\ntext: |-\n  On January 15, 2024, Alex Example alleges an encounter with Example City police in Example City, Example State that led to his arrest.\n`,
      );

      const resumeResult = await runCasegraph(
        ["cases", "analysis", "resume", "example-v-example-city"],
        workingDirectory,
      );

      expect(resumeResult.exitCode).toBe(0);
      expect(resumeResult.stdout).toContain("Analysis resumed.");
      expect(resumeResult.stdout).toContain("# Incident From Complaint Report");
      expect(resumeResult.stdout).toContain("Main graph:");
      expect(resumeResult.stdout).toContain("unchanged");
      expect(
        (await stat(path.join(workflowDirectory, "root.yaml"))).isFile(),
      ).toBe(true);
      expect(
        (await stat(path.join(workflowDirectory, pdfTaskRootPath))).isFile(),
      ).toBe(true);
      expect(
        (
          await stat(path.join(workflowDirectory, extractIncidentTaskRootPath))
        ).isFile(),
      ).toBe(true);
      expect(
        (
          await stat(
            path.join(
              workspacePath,
              "analysis",
              "current",
              "incident-from-complaint",
              "change-set.yaml",
            ),
          )
        ).isFile(),
      ).toBe(true);
      expect(
        (
          await stat(
            path.join(
              workspacePath,
              "analysis",
              "current",
              "incident-from-complaint",
              "artifacts",
              "extraction.yaml",
            ),
          )
        ).isFile(),
      ).toBe(true);
      expect(resumeResult.stderr).toContain(
        "analysis resume: reading current analysis root",
      );
      expect(resumeResult.stderr).toContain("analysis resume: done");

      const workflowRootBeforeSecondResume = await readFile(
        path.join(workflowDirectory, "root.yaml"),
        "utf8",
      );
      const changeSetBeforeSecondResume = await readFile(
        path.join(workflowDirectory, "change-set.yaml"),
        "utf8",
      );
      const reportBeforeSecondResume = await readFile(
        path.join(workflowDirectory, "report.md"),
        "utf8",
      );
      const extractionBeforeSecondResume = await readFile(
        path.join(workflowDirectory, "artifacts", "extraction.yaml"),
        "utf8",
      );
      const workflowRunBeforeSecondResume = await readFile(
        path.join(workflowDirectory, "workflow-run.yaml"),
        "utf8",
      );

      const secondResumeResult = await runCasegraph(
        ["cases", "analysis", "resume", "example-v-example-city"],
        workingDirectory,
      );

      expect(secondResumeResult.exitCode).toBe(0);
      expect(secondResumeResult.stdout).toContain("Analysis resumed.");
      expect(secondResumeResult.stdout).toContain(
        "# Incident From Complaint Report",
      );
      expect(secondResumeResult.stderr).toContain(
        "analysis resume: using existing completed workflow run",
      );
      const rootAfterSecondResume = await readFile(
        path.join(workspacePath, "analysis", "current", "root.yaml"),
        "utf8",
      );
      const rootRunsBlock = rootAfterSecondResume
        .slice(rootAfterSecondResume.indexOf("runs:"))
        .split("\nworkflows:")[0];
      const runPathsAfterSecondResume = [
        ...rootRunsBlock.matchAll(/path: "?([^"\n]+\.yaml)"?/g),
      ].map((match) => match[1]);
      expect(runPathsAfterSecondResume).toHaveLength(3);
      const secondRunPath = runPathsAfterSecondResume[2];
      if (!secondRunPath) {
        throw new Error("Expected second resume to append a command run.");
      }
      const secondCommandRun = await readFile(
        path.join(workspacePath, "analysis", "current", secondRunPath),
        "utf8",
      );
      expect(secondCommandRun).toContain('operation: "analysis resume"');
      expect(secondCommandRun).toContain('status: "completed"');
      expect(secondCommandRun).toContain("used_existing_workflow_run: true");
      expect(
        await readFile(path.join(workflowDirectory, "root.yaml"), "utf8"),
      ).toBe(workflowRootBeforeSecondResume);
      expect(
        await readFile(path.join(workflowDirectory, "change-set.yaml"), "utf8"),
      ).toBe(changeSetBeforeSecondResume);
      expect(
        await readFile(path.join(workflowDirectory, "report.md"), "utf8"),
      ).toBe(reportBeforeSecondResume);
      expect(
        await readFile(
          path.join(workflowDirectory, "artifacts", "extraction.yaml"),
          "utf8",
        ),
      ).toBe(extractionBeforeSecondResume);
      expect(
        await readFile(
          path.join(workflowDirectory, "workflow-run.yaml"),
          "utf8",
        ),
      ).toBe(workflowRunBeforeSecondResume);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to resume when workflow output artifacts are incomplete", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);
      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(pdfPath)}\n`,
      );

      const firstResult = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );
      const workflowDirectory = path.join(
        workspacePath,
        "analysis",
        "current",
        "incident-from-complaint",
      );
      const workflowRootPath = path.join(workflowDirectory, "root.yaml");

      expect(firstResult.exitCode).not.toBe(0);
      await writeFile(workflowRootPath, "status: incomplete\n");

      const resumeResult = await runCasegraph(
        ["cases", "analysis", "resume", "example-v-example-city"],
        workingDirectory,
      );

      expect(resumeResult.exitCode).not.toBe(0);
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "Analysis not resumed.",
      );
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "Existing workflow output is incomplete.",
      );
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "- incident-from-complaint/change-set.yaml",
      );
      expect(await readFile(workflowRootPath, "utf8")).toBe(
        "status: incomplete\n",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to resume when the main graph changed since analysis started", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);
      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(pdfPath)}\n`,
      );

      const firstResult = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );
      const currentRootPath = path.join(
        workspacePath,
        "analysis",
        "current",
        "root.yaml",
      );
      const beforeRoot = await readFile(currentRootPath, "utf8");

      expect(firstResult.exitCode).not.toBe(0);
      expect(beforeRoot).toContain("main_graph:");

      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(pdfPath)}\nplain_text: "On January 15, 2024, Alex Example alleges an encounter with Example City police in Example City, Example State that led to his arrest."\ndescription: "Changed after analysis started."\n`,
      );

      const resumeResult = await runCasegraph(
        ["cases", "analysis", "resume", "example-v-example-city"],
        workingDirectory,
      );

      expect(resumeResult.exitCode).not.toBe(0);
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "Analysis not resumed.",
      );
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "The main graph changed since this analysis started.",
      );
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "- complaint",
      );
      expect(`${resumeResult.stdout}\n${resumeResult.stderr}`).toContain(
        "Review or abandon the current analysis before starting a new one.",
      );
      expect(await readFile(currentRootPath, "utf8")).toBe(beforeRoot);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("stops before AI extraction when OPENAI_API_KEY is unavailable", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );

      const result = await runCasegraphInProcess(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
        { env: { PATH: "" } },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Analysis not completed.");
      expect(result.stderr).toContain(
        "The configured AI API key is unavailable: OPENAI_API_KEY.",
      );
      expect(result.stderr).toContain("Set OPENAI_API_KEY");
      expect(result.stderr).toContain(
        "casegraph cases analysis resume example-v-example-city",
      );
      expect(
        (
          await stat(
            path.join(workspacePath, "analysis", "current", "root.yaml"),
          )
        ).isFile(),
      ).toBe(true);
      await expect(
        stat(
          path.join(
            workspacePath,
            "analysis",
            "current",
            "incident-from-complaint",
            "artifacts",
            "extraction.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("stops when configured OpenAI extraction times out", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const originalFetch = globalThis.fetch;

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      globalThis.fetch = (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("This operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });

      const result = await runCasegraphInProcess(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
        {
          env: {
            CASEGRAPH_OPENAI_TIMEOUT_MS: "50",
            OPENAI_API_KEY: "test-key",
          },
          pdfToMarkdownVisionExtractor: null,
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Analysis not completed.");
      expect(result.stderr).toContain(
        "OpenAI extraction failed: OpenAI Responses API timed out after 50ms",
      );
      expect(result.stderr).toContain(
        "casegraph cases analysis resume example-v-example-city",
      );
    } finally {
      globalThis.fetch = originalFetch;
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("redacts OpenAI API keys from extraction errors", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const originalFetch = globalThis.fetch;

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                message: "Incorrect API key provided: sk-testsecret1234567890.",
              },
            }),
            {
              headers: { "content-type": "application/json" },
              status: 401,
            },
          ),
        );

      const result = await runCasegraphInProcess(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
        {
          env: {
            OPENAI_API_KEY: "sk-testsecret1234567890",
          },
          pdfToMarkdownVisionExtractor: null,
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Analysis not completed.");
      expect(result.stderr).toContain("[redacted-openai-api-key]");
      expect(result.stderr).not.toContain("sk-testsecret1234567890");
    } finally {
      globalThis.fetch = originalFetch;
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to resume when no current root exists", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );

      const result = await runCasegraph(
        ["cases", "analysis", "resume", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Analysis not resumed.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "No current analysis exists.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases analysis new example-v-example-city",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to create analysis when the main case graph already has an incident", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeCaseWithAvailableComplaint(
        workingDirectory,
        "example-v-example-city",
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const before = await snapshotFiles(workspacePath);
      await writeFile(
        path.join(workspacePath, "incident.yaml"),
        'type: node\nkind: incident\nid: incident\nlabel: "Existing incident"\n',
      );
      const withIncident = await snapshotFiles(workspacePath);

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      await expectAnalysisNotCreated(result, workspacePath);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Main already has an incident",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "No next analysis workflow is defined yet",
      );
      expect(
        outsideAnalysisSnapshot(await snapshotFiles(workspacePath)),
      ).toEqual(outsideAnalysisSnapshot(withIncident));
      expect(outsideAnalysisSnapshot(withIncident)).not.toEqual(
        outsideAnalysisSnapshot(before),
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to create analysis when no complaint metadata exists", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      await expectAnalysisNotCreated(result, workspacePath);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "No complaint source was found",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases analysis new",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to create analysis when complaint metadata points to an unavailable PDF", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const missingPdfPath = path.join(
        workingDirectory,
        "records",
        "missing-complaint.pdf",
      );
      await writeFile(
        path.join(workspacePath, "complaint.yaml"),
        `type: node\nkind: document\nid: complaint\ndocument_type: complaint\npath: ${JSON.stringify(missingPdfPath)}\n`,
      );
      const before = await snapshotFiles(workspacePath);

      const result = await runCasegraph(
        ["cases", "analysis", "new", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).toBe(1);
      expect(
        (
          await stat(path.join(workspacePath, "analysis", "current"))
        ).isDirectory(),
      ).toBe(true);
      expect(
        (
          await stat(
            path.join(workspacePath, "analysis", "current", "root.yaml"),
          )
        ).isFile(),
      ).toBe(true);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Analysis not completed.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "The complaint PDF is unavailable.",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases analysis resume example-v-example-city",
      );
      expect(
        outsideAnalysisSnapshot(await snapshotFiles(workspacePath)),
      ).toEqual(outsideAnalysisSnapshot(before));
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects invalid analysis command shapes and case resolution", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const zeroCases = await runCasegraph(
        ["cases", "analysis", "new"],
        workingDirectory,
      );
      await writeValidCaseRoot(workingDirectory, "case-one");
      await writeValidCaseRoot(workingDirectory, "case-two");
      const multipleCases = await runCasegraph(
        ["cases", "analysis", "new"],
        workingDirectory,
      );
      const missingCase = await runCasegraph(
        ["cases", "analysis", "new", "missing-case"],
        workingDirectory,
      );
      const extraToken = await runCasegraph(
        ["cases", "analysis", "new", "case-one", "extra"],
        workingDirectory,
      );

      expect(zeroCases.exitCode).not.toBe(0);
      expect(`${zeroCases.stdout}\n${zeroCases.stderr}`).toContain(
        "No case exists",
      );
      expect(`${zeroCases.stdout}\n${zeroCases.stderr}`).toContain(
        "casegraph cases new <case-id>",
      );
      expect(multipleCases.exitCode).not.toBe(0);
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "Multiple cases exist",
      );
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "case-one",
      );
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "case-two",
      );
      expect(missingCase.exitCode).not.toBe(0);
      expect(`${missingCase.stdout}\n${missingCase.stderr}`).toContain(
        "Case workspace does not exist: workspace/missing-case",
      );
      expect(extraToken.exitCode).not.toBe(0);
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Unexpected analysis new argument: extra",
      );
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Usage: casegraph cases analysis new <case-id>",
      );
      await expect(
        stat(path.join(workingDirectory, "workspace", "case-one", "analysis")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});

describe("casegraph cases report", () => {
  test("reports imported legal docket chronologically without mutating the workspace", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeImportedCaseState(workingDirectory, "example-v-example-city");
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const before = await snapshotFiles(workspacePath);

      const result = await runCasegraph(
        ["cases", "report", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Case: example-v-example-city");
      expect(result.stdout).toContain("Legal docket:");
      expect(result.stdout).toContain(
        "2026-01-10 | #1 | COMPLAINT against Example City filed by Alex Example.",
      );
      expect(result.stdout).toContain(
        "  Documents: document-one (#1 complaint) - Complaint PDF",
      );
      expect(result.stdout).toContain(
        "2026-02-12 | #16 | RESPONSE filed by Alex Example with an intentionally long ...",
      );
      const docketRows = result.stdout
        .split("\n")
        .filter((line) => /^\d{4}-\d{2}-\d{2} \|/.test(line));
      expect(docketRows.length).toBe(2);
      expect(docketRows.every((line) => line.length <= 80)).toBe(true);
      expect(result.stdout.indexOf("2026-01-10")).toBeLessThan(
        result.stdout.indexOf("2026-02-12"),
      );
      expect(result.stdout).not.toContain("Graph state:");
      expect(result.stdout).toContain("Missing next-step categories:");
      expect(result.stdout).toContain("Evidence records: none");
      expect(result.stdout).toContain("Unlinked records: none");
      expect(result.stdout).toContain("Accepted facts: none");
      expect(result.stdout).toContain("Accepted claims: none");
      expect(result.stdout).toContain("Support analysis: none");
      expect(result.stdout.indexOf("Legal docket:")).toBeLessThan(
        result.stdout.indexOf("Missing next-step categories:"),
      );
      expect(await snapshotFiles(workspacePath)).toEqual(before);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("reports when no docket entries are present", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");

      const result = await runCasegraph(
        ["cases", "report", "example-v-example-city"],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Legal docket:");
      expect(result.stdout).toContain("No docket entries are present.");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("reports registered evidence as unlinked until it is referenced by the graph", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeImportedCaseState(workingDirectory, "example-v-example-city");
      const evidencePath = path.join(workingDirectory, "records", "notes.txt");
      await writeEvidenceFile(evidencePath);

      const addResult = await runCasegraph(
        ["cases", "add", "evidence", "example-v-example-city", evidencePath],
        workingDirectory,
      );
      const reportResult = await runCasegraph(
        ["cases", "report", "example-v-example-city"],
        workingDirectory,
      );

      expect(addResult.exitCode).toBe(0);
      expect(reportResult.exitCode).toBe(0);
      expect(reportResult.stdout).toContain("Evidence records: 1");
      expect(reportResult.stdout).toContain("Unlinked records: 1");
      expect(reportResult.stdout).not.toContain("supports any fact");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("reports the only valid case when case ID is omitted", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeImportedCaseState(workingDirectory, "example-v-example-city");

      const result = await runCasegraph(["cases", "report"], workingDirectory);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Case: example-v-example-city");
      await expect(
        stat(path.join(workingDirectory, "current-case")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph-current")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, "case.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects omitted case ID when no valid case exists", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runCasegraph(["cases", "report"], workingDirectory);

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("No case exists");
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases new <case-id>",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects omitted case ID when multiple valid cases exist", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "case-one");
      await writeValidCaseRoot(workingDirectory, "case-two");

      const result = await runCasegraph(["cases", "report"], workingDirectory);

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Multiple cases exist",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain("case-one");
      expect(`${result.stdout}\n${result.stderr}`).toContain("case-two");
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "provide <case-id> explicitly",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects missing case workspace and extra report tokens", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");

      const missingCase = await runCasegraph(
        ["cases", "report", "missing-case"],
        workingDirectory,
      );
      const extraToken = await runCasegraph(
        ["cases", "report", "example-v-example-city", "extra"],
        workingDirectory,
      );

      expect(missingCase.exitCode).not.toBe(0);
      expect(`${missingCase.stdout}\n${missingCase.stderr}`).toContain(
        "Case workspace does not exist: workspace/missing-case",
      );
      expect(extraToken.exitCode).not.toBe(0);
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Unexpected report argument: extra",
      );
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Usage: casegraph cases report <case-id>",
      );
      expect(extraToken.stdout).toBe("");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});

describe("casegraph cases new external homes", () => {
  test("requires --home without creating a package or locator", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city"],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "required option '--home <directory>' not specified",
      );
      await expect(
        stat(path.join(workingDirectory, ".casegraph")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("resolves a relative home and creates validated roots after approval", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const approveCreation = vi.fn(() => Promise.resolve(true));
    const homeDirectory = path.join(
      workingDirectory,
      "homes",
      "example-v-example-city",
    );
    const homeRoot = path.join(homeDirectory, "root.yaml");
    const locatorRoot = path.join(
      workingDirectory,
      ".casegraph",
      "example-v-example-city",
      "root.yaml",
    );

    try {
      const result = await runNewCasegraph(
        [
          "cases",
          "new",
          "example-v-example-city",
          "--home",
          "homes/example-v-example-city",
        ],
        workingDirectory,
        approveCreation,
      );

      expect(result.exitCode).toBe(0);
      expect(approveCreation).toHaveBeenCalledTimes(2);
      expect(result.stdout).toContain(homeDirectory);
      expect(result.stdout).toContain(homeRoot);
      expect(result.stdout).toContain(locatorRoot);
      expect(result.stdout).toContain("External package roots: none");
      await expect(readCaseHome(homeRoot)).resolves.toMatchObject({
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseHome",
        metadata: { name: "example-v-example-city" },
        spec: {
          graphRoot: { type: "node", kind: "case", id: "root" },
          packagePath: [],
        },
      });
      await expect(readCaseLocator(locatorRoot)).resolves.toEqual({
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseLocator",
        metadata: { name: "example-v-example-city" },
        spec: { home: homeRoot },
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects a missing case ID without creating a home or locator", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Missing required case ID",
      );
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects extra case-ID positionals without creating a home or locator", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "Example", "v", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "too many arguments",
      );
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("creates separate external homes for an uppercase court-style case ID", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const firstHome = path.join(workingDirectory, "case-one");
    const secondHome = path.join(workingDirectory, "case-two");

    try {
      const first = await runNewCasegraph(
        ["cases", "new", "1-26-CV-00001", "--home", firstHome, "--yes"],
        workingDirectory,
        vi.fn(() => Promise.resolve(false)),
      );
      const second = await runNewCasegraph(
        ["cases", "new", "case-two", "--home", secondHome, "--yes"],
        workingDirectory,
        vi.fn(() => Promise.resolve(false)),
      );

      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      await expect(
        readCaseHome(path.join(firstHome, "root.yaml")),
      ).resolves.toMatchObject({
        metadata: { name: "1-26-CV-00001" },
      });
      await expect(
        readCaseHome(path.join(secondHome, "root.yaml")),
      ).resolves.toMatchObject({
        metadata: { name: "case-two" },
      });
      await expect(
        stat(path.join(workingDirectory, "current-case")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph-current")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects a Windows reserved case ID without creating a home or locator", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "CON", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "not a safe folder name",
      );
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("creates the root in an approved empty home directory", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const approveCreation = vi.fn(() => Promise.resolve(true));
    await mkdir(homeDirectory);

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city", "--home", homeDirectory],
        workingDirectory,
        approveCreation,
      );

      expect(result.exitCode).toBe(0);
      expect(approveCreation).toHaveBeenCalledWith({
        type: "createCaseHomeRoot",
        path: path.join(homeDirectory, "root.yaml"),
      });
      await expect(
        readCaseHome(path.join(homeDirectory, "root.yaml")),
      ).resolves.toMatchObject({
        metadata: { name: "example-v-example-city" },
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("--yes creates a missing home without asking for approval", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const approveCreation = vi.fn(() => Promise.resolve(false));

    try {
      const result = await runNewCasegraph(
        [
          "cases",
          "new",
          "example-v-example-city",
          "--home",
          homeDirectory,
          "--yes",
        ],
        workingDirectory,
        approveCreation,
      );

      expect(result.exitCode).toBe(0);
      expect(approveCreation).not.toHaveBeenCalled();
      await expect(
        readCaseHome(path.join(homeDirectory, "root.yaml")),
      ).resolves.toMatchObject({
        metadata: { name: "example-v-example-city" },
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("leaves declined home creation and locator creation absent", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(false)),
      );

      expect(result.exitCode).not.toBe(0);
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(
        stat(
          path.join(
            workingDirectory,
            ".casegraph",
            "example-v-example-city",
            "root.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects a nonempty uninitialized home without mutation", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const existingFile = path.join(homeDirectory, "notes.txt");
    await mkdir(homeDirectory);
    await writeFile(existingFile, "leave me alone");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("nonempty");
      await expect(readFile(existingFile, "utf8")).resolves.toBe(
        "leave me alone",
      );
      await expect(
        stat(path.join(homeDirectory, "root.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("attaches a matching CaseHome without rewriting it", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const homeRoot = path.join(homeDirectory, "root.yaml");
    await mkdir(homeDirectory);
    await writeCaseHome(homeRoot, {
      type: "create",
      value: {
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseHome",
        metadata: { name: "example-v-example-city" },
        spec: {
          graphRoot: { type: "node", kind: "case", id: "root" },
          packagePath: [],
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
      },
    });
    const before = await readFile(homeRoot, "utf8");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).toBe(0);
      await expect(readFile(homeRoot, "utf8")).resolves.toBe(before);
      await expect(
        readCaseLocator(
          path.join(
            workingDirectory,
            ".casegraph",
            "example-v-example-city",
            "root.yaml",
          ),
        ),
      ).resolves.toMatchObject({ spec: { home: homeRoot } });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects a case-insensitive locator collision before creating the home", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const locatorRoot = path.join(
      workingDirectory,
      ".casegraph",
      "Case-One",
      "root.yaml",
    );
    await mkdir(path.join(workingDirectory, ".casegraph", "Case-One"), {
      recursive: true,
    });
    await writeCaseLocator(locatorRoot, {
      apiVersion: CASEGRAPH_API_VERSION,
      kind: "CaseLocator",
      metadata: { name: "Case-One" },
      spec: { home: path.join(workingDirectory, "existing-home", "root.yaml") },
    });
    const locatorBefore = await readFile(locatorRoot, "utf8");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "case-one", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("already exists");
      await expect(stat(homeDirectory)).rejects.toThrow();
      await expect(readFile(locatorRoot, "utf8")).resolves.toBe(locatorBefore);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects a mismatched CaseHome name without creating a locator", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const homeDirectory = path.join(workingDirectory, "case-home");
    const homeRoot = path.join(homeDirectory, "root.yaml");
    await mkdir(homeDirectory);
    await writeCaseHome(homeRoot, {
      type: "create",
      value: {
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseHome",
        metadata: { name: "other-case" },
        spec: {
          graphRoot: { type: "node", kind: "case", id: "root" },
          packagePath: [],
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
      },
    });
    const before = await readFile(homeRoot, "utf8");

    try {
      const result = await runNewCasegraph(
        ["cases", "new", "example-v-example-city", "--home", homeDirectory],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("does not match");
      await expect(readFile(homeRoot, "utf8")).resolves.toBe(before);
      await expect(
        stat(
          path.join(
            workingDirectory,
            ".casegraph",
            "example-v-example-city",
            "root.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("keeps invalid-ID guidance and includes the required home option", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runNewCasegraph(
        [
          "cases",
          "new",
          "Example v. Example City / 2025",
          "--home",
          "case-home",
        ],
        workingDirectory,
        vi.fn(() => Promise.resolve(true)),
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Suggested case ID: Example-v-Example-City-2025",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases new Example-v-Example-City-2025 --home <directory>",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});

describe("casegraph cases add evidence", () => {
  test("records a non-PDF evidence file in an existing case workspace", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const evidencePath = path.join(workingDirectory, "records", "notes.txt");
      await writeEvidenceFile(evidencePath);
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );

      const result = await runCasegraph(
        ["cases", "add", "evidence", "example-v-example-city", evidencePath],
        workingDirectory,
      );
      const workspaceEntries = await readdir(workspacePath);
      const evidenceFiles = workspaceEntries.filter(
        (entry) => entry !== "root.yaml" && entry.endsWith(".yaml"),
      );

      expect(result.exitCode).toBe(0);
      expect(evidenceFiles).toHaveLength(1);

      const evidenceId = path.basename(evidenceFiles[0] ?? "", ".yaml");
      const evidencePathInWorkspace = path.join(
        workspacePath,
        evidenceFiles[0] ?? "",
      );
      const evidence = await readFile(evidencePathInWorkspace, "utf8");
      const historyIndex = await readFile(
        path.join(workspacePath, ".history", "index.yaml"),
        "utf8",
      );
      const manifest = await readFile(
        path.join(
          workspacePath,
          ".history",
          `m_${evidenceId}`,
          "manifest.yaml",
        ),
        "utf8",
      );
      const createdAt = evidence.match(/^created_at: "([^"]+)"$/m)?.[1];
      const updatedAt = evidence.match(/^updated_at: "([^"]+)"$/m)?.[1];

      expect(evidenceId).toBe(evidenceFileSha256);
      expect(evidence).toContain("type: node\n");
      expect(evidence).toContain("kind: evidence\n");
      expect(evidence).toContain(`id: ${JSON.stringify(evidenceId)}\n`);
      expect(evidence).toContain(`path: ${JSON.stringify(evidencePath)}\n`);
      expect(evidence).toContain("hash:\n");
      expect(evidence).toContain('  algorithm: "sha256"\n');
      expect(evidence).toContain(`  value: ${JSON.stringify(evidenceId)}\n`);
      expect(evidence).toContain("sources:\n");
      expect(evidence).toContain(`  - mutation: "m_${evidenceId}"\n`);
      expect(evidence).toContain('    source_system: "local_file"\n');
      expect(evidence).toContain('    source_model: "evidence"\n');
      expect(evidence).toContain(
        `    source_id: ${JSON.stringify(evidenceId)}\n`,
      );
      expect(createdAt).toBeDefined();
      expect(updatedAt).toBe(createdAt);
      expect(new Date(createdAt ?? "").toISOString()).toBe(createdAt);
      expect(evidence).not.toContain("null");
      expect(result.stdout).toContain(
        `Created evidence node: workspace/example-v-example-city/${evidenceId}.yaml`,
      );
      expect(result.stdout).toContain(`Evidence node ID: ${evidenceId}`);
      expect(result.stdout).toContain(
        "casegraph cases report example-v-example-city",
      );
      expect(historyIndex).toContain('type: "history_index"\n');
      expect(historyIndex).toContain(`id: "m_${evidenceId}"`);
      expect(historyIndex).toContain(
        `command: "casegraph cases add evidence example-v-example-city ${evidencePath}"`,
      );
      expect(manifest).toContain('type: "mutation"\n');
      expect(manifest).toContain(`id: "m_${evidenceId}"\n`);
      expect(manifest).toContain('status: "success"\n');
      expect(manifest).toContain("command:\n");
      expect(manifest).toContain('    - "casegraph"\n');
      expect(manifest).toContain('    - "cases"\n');
      expect(manifest).toContain('    - "add"\n');
      expect(manifest).toContain('    - "evidence"\n');
      expect(manifest).toContain('    - "example-v-example-city"\n');
      expect(manifest).toContain(`    - ${JSON.stringify(evidencePath)}\n`);
      expect(manifest).toContain("records_created:\n");
      expect(manifest).toContain(`  - ${JSON.stringify(evidenceId)}\n`);
      await expect(
        stat(path.join(workspacePath, path.basename(evidencePath))),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("records evidence for the only valid case when case ID is omitted", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const evidencePath = path.join(workingDirectory, "records", "notes.txt");
      await writeEvidenceFile(evidencePath);

      const result = await runCasegraph(
        ["cases", "add", "evidence", evidencePath],
        workingDirectory,
      );
      const workspaceEntries = await readdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
      );

      expect(result.exitCode).toBe(0);
      expect(
        workspaceEntries.filter(
          (entry) => entry !== "root.yaml" && entry.endsWith(".yaml"),
        ),
      ).toHaveLength(1);
      await expect(
        stat(path.join(workingDirectory, "current-case")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph-current")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, "case.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects evidence content that was already recorded", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const firstEvidencePath = path.join(
        workingDirectory,
        "records",
        "notes.txt",
      );
      const secondEvidencePath = path.join(
        workingDirectory,
        "other-records",
        "same-content.txt",
      );
      await writeEvidenceFile(firstEvidencePath);
      await writeEvidenceFile(secondEvidencePath);

      const firstResult = await runCasegraph(
        [
          "cases",
          "add",
          "evidence",
          "example-v-example-city",
          firstEvidencePath,
        ],
        workingDirectory,
      );
      const duplicateResult = await runCasegraph(
        [
          "cases",
          "add",
          "evidence",
          "example-v-example-city",
          secondEvidencePath,
        ],
        workingDirectory,
      );
      const workspaceEntries = await readdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
      );

      expect(firstResult.exitCode).toBe(0);
      expect(duplicateResult.exitCode).not.toBe(0);
      expect(`${duplicateResult.stdout}\n${duplicateResult.stderr}`).toContain(
        `Evidence already exists: workspace/example-v-example-city/${evidenceFileSha256}.yaml`,
      );
      expect(
        workspaceEntries.filter(
          (entry) => entry !== "root.yaml" && entry.endsWith(".yaml"),
        ),
      ).toEqual([`${evidenceFileSha256}.yaml`]);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects omitted evidence case ID when zero or multiple valid cases exist", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const evidencePath = path.join(workingDirectory, "records", "notes.txt");
      await writeEvidenceFile(evidencePath);

      const zeroCases = await runCasegraph(
        ["cases", "add", "evidence", evidencePath],
        workingDirectory,
      );
      await writeValidCaseRoot(workingDirectory, "case-one");
      await writeValidCaseRoot(workingDirectory, "case-two");
      const multipleCases = await runCasegraph(
        ["cases", "add", "evidence", evidencePath],
        workingDirectory,
      );

      expect(zeroCases.exitCode).not.toBe(0);
      expect(`${zeroCases.stdout}\n${zeroCases.stderr}`).toContain(
        "No case exists",
      );
      expect(`${zeroCases.stdout}\n${zeroCases.stderr}`).toContain(
        "casegraph cases new <case-id>",
      );
      expect(multipleCases.exitCode).not.toBe(0);
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "Multiple cases exist",
      );
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "case-one",
      );
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "case-two",
      );
      expect(`${multipleCases.stdout}\n${multipleCases.stderr}`).toContain(
        "provide <case-id> explicitly",
      );
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects invalid evidence command shapes and paths", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const evidencePath = path.join(workingDirectory, "records", "notes.txt");
      const missingPath = path.join(workingDirectory, "records", "missing.txt");
      const directoryPath = path.join(workingDirectory, "records", "folder");
      await writeEvidenceFile(evidencePath);
      await mkdir(directoryPath, { recursive: true });

      const missingArgument = await runCasegraph(
        ["cases", "add", "evidence", "example-v-example-city"],
        workingDirectory,
      );
      const missingFile = await runCasegraph(
        ["cases", "add", "evidence", "example-v-example-city", missingPath],
        workingDirectory,
      );
      const directory = await runCasegraph(
        ["cases", "add", "evidence", "example-v-example-city", directoryPath],
        workingDirectory,
      );
      const missingCase = await runCasegraph(
        ["cases", "add", "evidence", "missing-case", evidencePath],
        workingDirectory,
      );
      const extraToken = await runCasegraph(
        [
          "cases",
          "add",
          "evidence",
          "example-v-example-city",
          evidencePath,
          "extra",
        ],
        workingDirectory,
      );

      expect(missingArgument.exitCode).not.toBe(0);
      expect(`${missingArgument.stdout}\n${missingArgument.stderr}`).toContain(
        "Usage: casegraph cases add evidence <case-id> <path-to-file>",
      );
      expect(missingFile.exitCode).not.toBe(0);
      expect(`${missingFile.stdout}\n${missingFile.stderr}`).toContain(
        "Evidence file is not readable",
      );
      expect(directory.exitCode).not.toBe(0);
      expect(`${directory.stdout}\n${directory.stderr}`).toContain(
        "Evidence path is not a readable file",
      );
      expect(missingCase.exitCode).not.toBe(0);
      expect(`${missingCase.stdout}\n${missingCase.stderr}`).toContain(
        "Case workspace does not exist: workspace/missing-case",
      );
      expect(extraToken.exitCode).not.toBe(0);
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Unexpected add evidence argument: extra",
      );
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Usage: casegraph cases add evidence <case-id> <path-to-file>",
      );
      const workspaceEntries = await readdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
      );
      expect(workspaceEntries).toEqual(["root.yaml"]);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }, 10_000);
});

describe("casegraph cases add document", () => {
  test("records a complaint document for the only valid case when case ID is omitted", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        ["cases", "add", "document", "complaint", pdfPath],
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
      expect(complaint).toContain(`path: ${JSON.stringify(pdfPath)}\n`);
      await expect(
        stat(path.join(workingDirectory, "current-case")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, ".casegraph-current")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workingDirectory, "case.yaml")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("does not count stray workspace directories or invalid root nodes as valid cases", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(path.join(workingDirectory, "workspace", "stray-folder"), {
        recursive: true,
      });
      await mkdir(path.join(workingDirectory, "workspace", "not-a-case"), {
        recursive: true,
      });
      await writeFile(
        path.join(workingDirectory, "workspace", "not-a-case", "root.yaml"),
        "type: node\nkind: note\nid: root\n",
      );
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        ["cases", "add", "document", "complaint", pdfPath],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "workspace/example-v-example-city/complaint.yaml",
      );
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "stray-folder",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "not-a-case",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects omitted case ID when no valid case exists", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await mkdir(path.join(workingDirectory, "workspace", "stray-folder"), {
        recursive: true,
      });
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        ["cases", "add", "document", "complaint", pdfPath],
        workingDirectory,
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("No case exists");
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "casegraph cases new <case-id>",
      );
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "stray-folder",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects omitted case ID when multiple valid cases exist", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "case-one");
      await writeValidCaseRoot(workingDirectory, "case-two");
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        ["cases", "add", "document", "complaint", pdfPath],
        workingDirectory,
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Multiple cases exist",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain("case-one");
      expect(`${result.stdout}\n${result.stderr}`).toContain("case-two");
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "provide <case-id> explicitly",
      );
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "case-one",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "case-two",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("requires explicit case ID after a second case is created", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const firstPdfPath = path.join(
        workingDirectory,
        "records",
        "first-complaint.pdf",
      );
      const secondPdfPath = path.join(
        workingDirectory,
        "records",
        "second-complaint.pdf",
      );
      await writeMinimalPdf(firstPdfPath);
      await writeMinimalPdf(secondPdfPath);

      await writeValidCaseRoot(workingDirectory, "case-one");
      const addFirstComplaint = await runCasegraph(
        ["cases", "add", "document", "complaint", firstPdfPath],
        workingDirectory,
      );
      await writeValidCaseRoot(workingDirectory, "case-two");
      const addSecondComplaint = await runCasegraph(
        ["cases", "add", "document", "complaint", secondPdfPath],
        workingDirectory,
      );

      expect(addFirstComplaint.exitCode).toBe(0);
      expect(addSecondComplaint.exitCode).not.toBe(0);
      expect(
        `${addSecondComplaint.stdout}\n${addSecondComplaint.stderr}`,
      ).toContain("Multiple cases exist");
      expect(
        `${addSecondComplaint.stdout}\n${addSecondComplaint.stderr}`,
      ).toContain("provide <case-id> explicitly");
      expect(
        (
          await stat(
            path.join(
              workingDirectory,
              "workspace",
              "case-one",
              "complaint.yaml",
            ),
          )
        ).isFile(),
      ).toBe(true);
      await expect(
        stat(
          path.join(
            workingDirectory,
            "workspace",
            "case-two",
            "complaint.yaml",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects extra tokens in the omitted-case complaint command", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(workingDirectory, "example-v-example-city");
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        ["cases", "add", "document", "complaint", pdfPath, "extra"],
        workingDirectory,
      );

      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Unexpected add document argument: extra",
      );
      expect(`${result.stdout}\n${result.stderr}`).toContain(
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

  test("records a complaint document node in an existing case workspace", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
        {
          recursive: true,
        },
      );
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          pdfPath,
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
      expect(result.stdout).toContain("casegraph cases augment");
      expect(result.stdout).toContain("directly referenced");
      expect(result.stdout).toContain("not yet in the graph");
      expect(complaint).toContain("type: node\n");
      expect(complaint).toContain("kind: document\n");
      expect(complaint).toContain("id: complaint\n");
      expect(complaint).toContain("document_type: complaint\n");
      expect(complaint).toContain(`path: ${JSON.stringify(pdfPath)}\n`);
      expect(complaint).not.toContain("parent");
      expect(complaint).not.toContain("edge");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("records the external PDF path only", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const pdfPath = path.join(workingDirectory, "records", "complaint.pdf");
      await mkdir(workspacePath, { recursive: true });
      await writeMinimalPdf(pdfPath);

      const result = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          pdfPath,
        ],
        workingDirectory,
      );

      expect(result.exitCode).toBe(0);
      expect(await readdir(workspacePath)).toEqual(["complaint.yaml"]);
      await expect(
        stat(path.join(workspacePath, "complaint.pdf")),
      ).rejects.toThrow();
      await expect(stat(path.join(workspacePath, "edges"))).rejects.toThrow();
      await expect(
        stat(path.join(workspacePath, "analysis")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workspacePath, "facts.yaml")),
      ).rejects.toThrow();
      await expect(
        stat(path.join(workspacePath, "references.yaml")),
      ).rejects.toThrow();
      expect(await readFile(pdfPath, "utf8")).toBe("%PDF-1.7\n");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects missing, non-file, and non-PDF complaint paths", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
        {
          recursive: true,
        },
      );
      const recordsPath = path.join(workingDirectory, "records");
      const missingPdfPath = path.join(recordsPath, "missing.pdf");
      const directoryPdfPath = path.join(recordsPath, "directory.pdf");
      const textPdfPath = path.join(recordsPath, "not-a-pdf.pdf");
      await mkdir(directoryPdfPath, { recursive: true });
      await writeFile(textPdfPath, "not a pdf\n");

      const missingPdf = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          missingPdfPath,
        ],
        workingDirectory,
      );
      const directoryPdf = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          directoryPdfPath,
        ],
        workingDirectory,
      );
      const textPdf = await runCasegraph(
        [
          "cases",
          "add",
          "document",
          "example-v-example-city",
          "complaint",
          textPdfPath,
        ],
        workingDirectory,
      );

      expect(missingPdf.exitCode).not.toBe(0);
      expect(`${missingPdf.stdout}\n${missingPdf.stderr}`).toContain(
        "Complaint PDF is not readable",
      );
      expect(directoryPdf.exitCode).not.toBe(0);
      expect(`${directoryPdf.stdout}\n${directoryPdf.stderr}`).toContain(
        "Complaint PDF is not a readable file",
      );
      expect(textPdf.exitCode).not.toBe(0);
      expect(`${textPdf.stdout}\n${textPdf.stderr}`).toContain(
        "Only PDF files are supported",
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

  test("rejects missing document type, missing path, and extra tokens", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      await mkdir(
        path.join(workingDirectory, "workspace", "example-v-example-city"),
        {
          recursive: true,
        },
      );

      const missingDocumentType = await runCasegraph(
        ["cases", "add", "document", "example-v-example-city"],
        workingDirectory,
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

      for (const result of [missingDocumentType, missingPath, extraToken]) {
        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}\n${result.stderr}`).toContain(
          "Usage: casegraph cases add document <case-id> complaint <path-to-pdf>",
        );
      }
      expect(`${extraToken.stdout}\n${extraToken.stderr}`).toContain(
        "Unexpected add document argument: extra",
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
});

describe("casegraph cases import courtlistener", () => {
  test("rejects missing token, missing docket ID, extra tokens, and conflicting flags", async () => {
    const workingDirectory = await makeWorkingDirectory();
    const fetch = makeCourtListenerFetch(courtListenerRoutes());

    try {
      const missingToken = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "--dry-run"],
        workingDirectory,
        { env: {}, fetch },
      );
      const missingDocket = await runCasegraphInProcess(
        ["cases", "import", "courtlistener"],
        workingDirectory,
        { env: { COURTLISTENER_API_TOKEN: "secret-token" }, fetch },
      );
      const extraToken = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "extra", "--write"],
        workingDirectory,
        { env: { COURTLISTENER_API_TOKEN: "secret-token" }, fetch },
      );
      const conflictingFlags = await runCasegraphInProcess(
        [
          "cases",
          "import",
          "courtlistener",
          "10000001",
          "--dry-run",
          "--write",
        ],
        workingDirectory,
        { env: { COURTLISTENER_API_TOKEN: "secret-token" }, fetch },
      );

      expect(missingToken.exitCode).not.toBe(0);
      expect(missingToken.stderr).toContain("COURTLISTENER_API_TOKEN");
      expect(missingToken.stderr).not.toContain("secret-token");
      expect(missingDocket.exitCode).not.toBe(0);
      expect(missingDocket.stderr).toContain(
        "casegraph cases import courtlistener <docket-id>",
      );
      expect(extraToken.exitCode).not.toBe(0);
      expect(extraToken.stderr).toContain("Unexpected import argument: extra");
      expect(extraToken.stderr).toContain(
        "casegraph cases import courtlistener <docket-id>",
      );
      expect(conflictingFlags.exitCode).not.toBe(0);
      expect(conflictingFlags.stderr).toContain("cannot be used together");
      await expect(
        stat(path.join(workingDirectory, "workspace")),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("defaults to dry-run and does not create a workspace", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeCourtListenerFetch(courtListenerRoutes()),
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "Derived case ID: example-v-example-city",
      );
      expect(result.stdout).toContain("Docket entries: 1");
      expect(result.stdout).toContain("Dry run only");
      expect(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).not.toContain(
        "secret-token",
      );
      await expect(
        stat(
          path.join(workingDirectory, "workspace", "example-v-example-city"),
        ),
      ).rejects.toThrow();
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("writes imported workspace, history, source refs, and filing-level citations without edges", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "--write"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeCourtListenerFetch(courtListenerRoutes()),
          now: () => new Date("2026-05-12T14:10:03.123Z"),
          createMutationId: () => "ckd9p2xq7a",
          createGraphRecordId: createSequentialIds(
            "local01",
            "local02",
            "local03",
            "local04",
            "local05",
            "local06",
          ),
        },
      );
      const workspacePath = path.join(
        workingDirectory,
        "workspace",
        "example-v-example-city",
      );
      const mutationPath = path.join(workspacePath, ".history", "m_ckd9p2xq7a");
      const root = await readFile(
        path.join(workspacePath, "root.yaml"),
        "utf8",
      );
      const docket = await readFile(
        path.join(workspacePath, "local01.yaml"),
        "utf8",
      );
      const recapDocument = await readFile(
        path.join(workspacePath, "local06.yaml"),
        "utf8",
      );
      const manifest = await readFile(
        path.join(mutationPath, "manifest.yaml"),
        "utf8",
      );
      const requestDocket = await readFile(
        path.join(mutationPath, "request-docket.yaml"),
        "utf8",
      );
      const allWorkspaceFiles = await readdir(workspacePath, {
        recursive: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "Created case workspace: workspace/example-v-example-city",
      );
      expect(result.stdout).not.toContain("secret-token");
      expect(root).toContain('kind: "case"');
      expect(root).toContain('mutation: "m_ckd9p2xq7a"');
      expect(docket).toContain('kind: "docket"');
      expect(docket).toContain('id: "local01"');
      expect(docket).toContain('- "local02"');
      expect(docket).toContain('- "local03"');
      expect(docket).toContain('- "local04"');
      expect(docket).toContain('- "local05"');
      expect(docket).toContain('- "local06"');
      expect(docket).not.toContain("courtlistener_id");
      expect(docket).not.toMatch(/cites:/);
      expect(recapDocument).toContain('kind: "document"');
      expect(recapDocument).toContain('id: "local06"');
      expect(recapDocument).toContain('docket_entry: "local02"');
      expect(recapDocument).not.toContain("courtlistener_id");
      expect(recapDocument).toContain("cites:");
      expect(recapDocument).toContain("- 300001");
      expect(recapDocument).not.toContain("citation_lookup:");
      expect(recapDocument).not.toContain("Ashcroft v. Iqbal");
      expect(manifest).toContain("casegraph");
      expect(manifest).toContain("request-docket.yaml");
      expect(requestDocket).toContain('authorization: "redacted"');
      expect(requestDocket).not.toContain("secret-token");
      expect(allWorkspaceFiles.join("\n")).not.toMatch(/edge/i);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("rejects duplicate and unsafe derived case IDs without auto suffixing", async () => {
    const duplicateDirectory = await makeWorkingDirectory();
    const unsafeDirectory = await makeWorkingDirectory();

    try {
      await writeValidCaseRoot(duplicateDirectory, "example-v-example-city");
      const duplicate = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "--write"],
        duplicateDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeCourtListenerFetch(courtListenerRoutes()),
        },
      );
      const unsafe = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "--write"],
        unsafeDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeCourtListenerFetch(
            courtListenerRoutes({
              "GET https://www.courtlistener.com/api/rest/v4/dockets/10000001/":
                {
                  body: {
                    id: 10000001,
                    slug: "///",
                    case_name: "///",
                    case_name_full: "",
                    case_name_short: "",
                  },
                },
            }),
          ),
        },
      );

      expect(duplicate.exitCode).not.toBe(0);
      expect(duplicate.stderr).toContain("already exists");
      expect(await readdir(path.join(duplicateDirectory, "workspace"))).toEqual(
        ["example-v-example-city"],
      );
      expect(unsafe.exitCode).not.toBe(0);
      expect(unsafe.stderr).toContain("No safe case ID");
      await expect(
        stat(path.join(unsafeDirectory, "workspace")),
      ).rejects.toThrow();
    } finally {
      await rm(duplicateDirectory, { recursive: true, force: true });
      await rm(unsafeDirectory, { recursive: true, force: true });
    }
  });

  test("preserves visible incomplete citation lookup status", async () => {
    const workingDirectory = await makeWorkingDirectory();

    try {
      const result = await runCasegraphInProcess(
        ["cases", "import", "courtlistener", "10000001", "--write"],
        workingDirectory,
        {
          env: { COURTLISTENER_API_TOKEN: "secret-token" },
          fetch: makeCourtListenerFetch(
            courtListenerRoutes({
              "POST https://www.courtlistener.com/api/rest/v4/citation-lookup/":
                {
                  status: 429,
                  body: { detail: "rate limited" },
                },
            }),
          ),
          now: () => new Date("2026-05-12T14:10:03.123Z"),
          createMutationId: () => "rate1limit",
          createGraphRecordId: createSequentialIds(
            "local01",
            "local02",
            "local03",
            "local04",
            "local05",
            "local06",
          ),
        },
      );
      const recapDocument = await readFile(
        path.join(
          workingDirectory,
          "workspace",
          "example-v-example-city",
          "local06.yaml",
        ),
        "utf8",
      );
      const request = await readFile(
        path.join(
          workingDirectory,
          "workspace",
          "example-v-example-city",
          ".history",
          "m_rate1limit",
          "request-citation-lookup-recap-document-200000001.yaml",
        ),
        "utf8",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Citation lookup incomplete");
      expect(recapDocument).toContain("citation_lookup_status: 429");
      expect(request).toContain("status: 429");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
