import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { init as initCuid2 } from "@paralleldrive/cuid2";
import { resolveOnlyCaseId } from "../../workspaces.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { loadCaseWorkspace } from "../../workspaces/load.js";
import type { DocumentNode, GraphNode } from "../../graph/records.js";
import { readGraphNodes, type ParsedGraphNode } from "../../graph/records.js";
import {
  downloadPdfArtifact,
  readMarkdownTextArtifact,
  readablePdf,
} from "../../documents/source-artifacts.js";
import {
  currentAnalysisRootYaml,
  incidentFromComplaintChangeSetYaml,
  incidentFromComplaintWorkflowRootYaml,
  incidentFromComplaintWorkflowRunYaml,
  type CurrentAnalysisRoot,
  type IncidentFromComplaintChange,
  type IncidentFromComplaintChangeSet,
  type IncidentFromComplaintWorkflowRoot,
} from "../workflows/incident-from-complaint/contract.js";
import {
  openAiCommandAvailable,
  openAiIncidentFromComplaintExtractor,
  incidentFromComplaintReport,
  runIncidentFromComplaintWorkflow,
  writeExtractionArtifact,
  type IncidentFromComplaintAiExtractor,
} from "../workflows/incident-from-complaint/run.js";
import {
  runPdfToMarkdownWorkflow,
  type PdfToMarkdownOriginalPdfPrompt,
  type PdfToMarkdownVisionExtractor,
} from "../tasks/pdf-to-markdown/run.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export type AnalysisNewRuntime = WorkspaceRuntime & {
  emitProgress?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  incidentFromComplaintAiExtractor?: IncidentFromComplaintAiExtractor;
  pdfToMarkdownVisionExtractor?: PdfToMarkdownVisionExtractor | null;
  promptForOriginalPdfPath?: PdfToMarkdownOriginalPdfPrompt;
};

export const casesAnalysisNewHelp = `Usage: casegraph cases analysis new <case-id>
       casegraph cases analysis new

Start the incident-from-complaint workflow and propose an incident change set without changing main.

The case ID may be omitted only when exactly one valid case exists.
`;

export const casesAnalysisResumeHelp = `Usage: casegraph cases analysis resume <case-id>
       casegraph cases analysis resume

Continue the current analysis from analysis/current/root.yaml without changing main.

The case ID may be omitted only when exactly one valid case exists.
`;

const createDefaultAnalysisId = initCuid2({ length: 10 });

type ComplaintSource = {
  downloadUrl?: string;
  docketEntryId?: string;
  pdfPath?: string;
  plainText?: string;
  recordId: string;
  recordKind: string;
  selectionReason: string;
};

type AvailableComplaintSource = Omit<ComplaintSource, "pdfPath"> & {
  pdfPath: string;
  workflowTextArtifactId?: string;
  workflowPdfPath?: string;
  workflowTextPath?: string;
};

type AnalysisProgress = {
  lines: string[];
  write: (message: string) => void;
};

type MainGraphSnapshot = {
  captured_at: string;
  case_id: string;
  hash_algorithm: "sha256";
  graph_hash: string;
  records: Record<string, string>;
};

type WorkingGraphSnapshot = {
  graph_hash: string;
  records: Record<string, string>;
};

type AnalysisTaskPlan = {
  extractIncidentTaskRunId: string;
  extractIncidentTaskRunRelativePath: string;
  pdfToMarkdownTaskRunId: string;
  pdfToMarkdownTaskRunRelativePath: string;
};

type AnalysisCommandRun = {
  id: string;
  operation: "analysis new" | "analysis resume";
  path: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at?: string;
};

function taskRunRelativePath(
  taskName: "extract-incident" | "pdf-to-markdown",
  taskRunId: string,
): string {
  return path.join("tasks", taskName, taskRunId, "root.yaml");
}

function createAnalysisTaskPlan(): AnalysisTaskPlan {
  const pdfToMarkdownTaskRunId = createDefaultAnalysisId();
  const extractIncidentTaskRunId = createDefaultAnalysisId();

  return {
    extractIncidentTaskRunId,
    extractIncidentTaskRunRelativePath: taskRunRelativePath(
      "extract-incident",
      extractIncidentTaskRunId,
    ),
    pdfToMarkdownTaskRunId,
    pdfToMarkdownTaskRunRelativePath: taskRunRelativePath(
      "pdf-to-markdown",
      pdfToMarkdownTaskRunId,
    ),
  };
}

function invalidCurrentAnalysisRoot(message: string): never {
  throw new Error(`Invalid current analysis root: ${message}`);
}

function createAnalysisProgress(runtime: AnalysisNewRuntime): AnalysisProgress {
  const lines: string[] = [];

  return {
    lines,
    write(message) {
      const line = `${message}\n`;
      lines.push(line);
      runtime.emitProgress?.(line);
    },
  };
}

function progressOutput(
  progress: AnalysisProgress,
  runtime: AnalysisNewRuntime,
): string | undefined {
  if (runtime.emitProgress) {
    return undefined;
  }

  return progress.lines.join("");
}

function errorOutput(
  progress: AnalysisProgress,
  runtime: AnalysisNewRuntime,
  message: string,
): string {
  if (runtime.emitProgress) {
    return message;
  }

  return `${progress.lines.join("")}${message}`;
}

function unexpectedAnalysisNewArgument(argument: string): CommandResult {
  return {
    exitCode: 1,
    stderr: `Unexpected analysis new argument: ${argument}\n\n${casesAnalysisNewHelp}`,
  };
}

function unexpectedAnalysisResumeArgument(argument: string): CommandResult {
  return {
    exitCode: 1,
    stderr: `Unexpected analysis resume argument: ${argument}\n\n${casesAnalysisResumeHelp}`,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function complaintDocumentReason(node: DocumentNode): string | undefined {
  const searchableText = [node.document_type, node.description, node.id]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    searchableText.includes("complaint") ||
    searchableText.includes("pleading")
  ) {
    return "Existing document metadata identifies this record as a complaint source.";
  }

  return undefined;
}

function downloadUrl(node: DocumentNode): string | undefined {
  return node.sources?.find((source) => source.download_url)?.download_url;
}

function findComplaintSource(
  nodes: readonly GraphNode[],
): ComplaintSource | undefined {
  const documentCandidates = nodes.flatMap((node) => {
    if (node.kind !== "document") {
      return [];
    }

    const selectionReason = complaintDocumentReason(node);
    if (!selectionReason) {
      return [];
    }

    return [
      {
        downloadUrl: downloadUrl(node),
        docketEntryId: node.docket_entry,
        pdfPath: node.path,
        plainText: node.plain_text,
        recordId: node.id,
        recordKind: node.kind,
        selectionReason,
      },
    ];
  });

  if (documentCandidates.length > 0) {
    return documentCandidates.sort((left, right) =>
      left.recordId.localeCompare(right.recordId),
    )[0];
  }

  const docketEntryCandidate = nodes
    .filter((node) => node.kind === "docket_entry")
    .find((node) =>
      [node.description, node.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes("complaint"),
    );

  if (!docketEntryCandidate) {
    return undefined;
  }

  return {
    recordId: docketEntryCandidate.id,
    recordKind: docketEntryCandidate.kind,
    selectionReason:
      "Existing docket metadata identifies this entry as a complaint source.",
  };
}

function markdownTextPath(pdfPath: string): string {
  return pdfPath.replace(/\.pdf$/i, ".md");
}

async function markdownTextExists(pdfPath: string): Promise<boolean> {
  return path.extname(pdfPath).toLowerCase() === ".pdf"
    ? pathExists(markdownTextPath(pdfPath))
    : false;
}

function history(
  event: string,
  timestamp: string,
): { event: string; at: string } {
  return { event, at: timestamp };
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function hashRecords(records: Record<string, string>): string {
  return sha256(
    Object.entries(records)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([recordId, hash]) => `${recordId}\0${hash}`)
      .join("\n"),
  );
}

function workingGraphSnapshot(
  records: Record<string, string>,
): WorkingGraphSnapshot {
  return {
    graph_hash: hashRecords(records),
    records,
  };
}

function mainGraphWorkingSnapshot(
  snapshot: MainGraphSnapshot,
): WorkingGraphSnapshot {
  return workingGraphSnapshot({ ...snapshot.records });
}

function workflowOutputSnapshot({
  changeSetYaml,
  input,
}: {
  changeSetYaml: string;
  input: WorkingGraphSnapshot;
}): WorkingGraphSnapshot {
  const records = {
    ...input.records,
    "incident-from-complaint/change-set": sha256(changeSetYaml),
  };

  return workingGraphSnapshot(records);
}

async function mainGraphSnapshot({
  caseId,
  capturedAt,
  parsedNodes,
  workspacePath,
}: {
  caseId: string;
  capturedAt: string;
  parsedNodes: readonly ParsedGraphNode[];
  workspacePath: string;
}): Promise<MainGraphSnapshot> {
  const records: Record<string, string> = {};

  for (const { fileStem, node } of [...parsedNodes].sort((left, right) =>
    left.node.id.localeCompare(right.node.id),
  )) {
    records[node.id] = sha256(
      fileStem === "root"
        ? JSON.stringify(node)
        : await readFile(path.join(workspacePath, `${fileStem}.yaml`), "utf8"),
    );
  }

  return {
    captured_at: capturedAt,
    case_id: caseId,
    hash_algorithm: "sha256",
    graph_hash: hashRecords(records),
    records,
  };
}

function currentRoot({
  analysisId,
  caseId,
  createdAt,
  mainGraph,
  runs,
  taskPlan,
  workflowRunId,
  workflowCompletedAt,
  workflowStartedAt,
  updatedAt,
}: {
  analysisId: string;
  caseId: string;
  createdAt: string;
  mainGraph: MainGraphSnapshot;
  runs: readonly AnalysisCommandRun[];
  taskPlan: AnalysisTaskPlan;
  workflowRunId: string;
  workflowCompletedAt?: string;
  workflowStartedAt: string;
  updatedAt: string;
}): CurrentAnalysisRoot {
  return {
    analysis_id: analysisId,
    case_id: caseId,
    status: "draft",
    created_at: createdAt,
    updated_at: updatedAt,
    main_graph: mainGraph,
    change_stack: ["main", "incident-from-complaint"],
    working_graph: "main + incident-from-complaint change set",
    runs: [...runs],
    workflows: [
      {
        id: workflowRunId,
        name: "incident-from-complaint",
        path: "incident-from-complaint/root.yaml",
        status: "draft",
        started_at: workflowStartedAt,
        completed_at: workflowCompletedAt,
        tasks: [
          {
            id: taskPlan.pdfToMarkdownTaskRunId,
            name: "pdf-to-markdown",
            path: taskPlan.pdfToMarkdownTaskRunRelativePath,
          },
          {
            id: taskPlan.extractIncidentTaskRunId,
            name: "extract-incident",
            path: taskPlan.extractIncidentTaskRunRelativePath,
          },
        ],
      },
    ],
    history: [history("analysis_created", createdAt)],
  };
}

function workflowRoot({
  analysisId,
  caseId,
  complaintSource,
  extractIncidentTask,
  inputSnapshot,
  outputSnapshot,
  pdfTask,
  timestamp,
}: {
  analysisId: string;
  caseId: string;
  complaintSource: AvailableComplaintSource;
  extractIncidentTask: { id: string; path: string; status: "completed" };
  inputSnapshot: WorkingGraphSnapshot;
  outputSnapshot: WorkingGraphSnapshot;
  pdfTask?: { id: string; path: string; status: "completed" | "paused" };
  timestamp: string;
}): IncidentFromComplaintWorkflowRoot {
  return {
    analysis_id: analysisId,
    case_id: caseId,
    status: "draft",
    created_at: timestamp,
    updated_at: timestamp,
    workflow: {
      name: "incident-from-complaint",
      version: 1,
    },
    working_graph: {
      input_snapshot: inputSnapshot,
      output_snapshot: outputSnapshot,
    },
    complaint_source: {
      record_id: complaintSource.recordId,
      record_kind: complaintSource.recordKind,
      pdf_path: complaintSource.pdfPath,
      docket_entry_id: complaintSource.docketEntryId,
      selection_reason: complaintSource.selectionReason,
    },
    artifacts: {
      change_set: "change-set.yaml",
      complaint_pdf: complaintSource.workflowPdfPath,
      complaint_text: complaintSource.workflowTextPath,
      extraction: "artifacts/extraction.yaml",
      report: "report.md",
      workflow_run: "workflow-run.yaml",
    },
    tasks: [
      ...(pdfTask
        ? [
            {
              id: pdfTask.id,
              name: "pdf-to-markdown" as const,
              path: pdfTask.path,
              status: pdfTask.status,
            },
          ]
        : []),
      {
        id: extractIncidentTask.id,
        name: "extract-incident",
        path: extractIncidentTask.path,
        status: extractIncidentTask.status,
      },
    ],
    history: [
      history("workflow_created", timestamp),
      history("workflow_completed", timestamp),
    ],
  };
}

function sourceReference(
  complaintSource: AvailableComplaintSource,
  supportKind:
    | "direct-quote"
    | "paraphrase"
    | "summary"
    | "inference"
    | "missing-source-observation",
): IncidentFromComplaintChange["source_references"][number] {
  return {
    source_record_id: complaintSource.recordId,
    source_record_kind: complaintSource.recordKind,
    complaint_locator: complaintSourceLocator(complaintSource),
    support_kind: supportKind,
  };
}

function complaintSourceLocator(
  complaintSource: AvailableComplaintSource,
): string {
  return complaintSource.docketEntryId === undefined
    ? "complaint PDF"
    : `docket entry ${complaintSource.docketEntryId}`;
}

async function supportingChanges(
  complaintSource: AvailableComplaintSource,
  sourceTaskRunIds: readonly string[],
): Promise<IncidentFromComplaintChange[]> {
  const changes: IncidentFromComplaintChange[] = [];

  if (
    !complaintSource.workflowTextPath &&
    !(await markdownTextExists(complaintSource.pdfPath))
  ) {
    changes.push({
      id: "change-create-complaint-markdown",
      type: "create-markdown-text-artifact",
      review_state: "proposed",
      summary: "Create a markdown/plain text version of the complaint PDF",
      counts_as_proof: false,
      proposed_record: {
        source_pdf_path: complaintSource.pdfPath,
        proposed_text_path: markdownTextPath(complaintSource.pdfPath),
      },
      source_references: [
        sourceReference(complaintSource, "missing-source-observation"),
      ],
      source_task_run_ids: [...sourceTaskRunIds],
    });
  }

  if (complaintSource.workflowTextPath) {
    if (!complaintSource.workflowTextArtifactId) {
      throw new Error("Complaint text artifact ID is missing.");
    }

    changes.push({
      id: "change-add-complaint-text-representation",
      type: "update-document-sources",
      review_state: "proposed",
      summary:
        "Attach the extracted complaint text artifact as an alternate representation of the complaint document",
      counts_as_proof: false,
      proposed_record: {
        document_id: complaintSource.recordId,
        alternate_representations: {
          [complaintSource.workflowTextArtifactId]: {
            artifact_path: complaintSource.workflowTextPath,
            kind: "markdown",
            source_pdf_path:
              complaintSource.workflowPdfPath ?? complaintSource.pdfPath,
          },
        },
      },
      source_references: [sourceReference(complaintSource, "summary")],
      source_task_run_ids: [...sourceTaskRunIds],
    });
  }

  if (complaintSource.workflowPdfPath) {
    changes.push({
      id: "change-promote-complaint-pdf-artifact",
      type: "promote-artifact-to-case-files",
      review_state: "proposed",
      summary: "Preserve the downloaded complaint PDF with the case files",
      counts_as_proof: false,
      proposed_record: {
        artifact_path: complaintSource.workflowPdfPath,
        source_record_id: complaintSource.recordId,
      },
      source_references: [sourceReference(complaintSource, "summary")],
      source_task_run_ids: [...sourceTaskRunIds],
    });

    if (
      complaintSource.workflowPdfPath !== "artifacts/original-complaint.pdf"
    ) {
      changes.push({
        id: "change-update-complaint-document-file-path",
        type: "update-document-file-path",
        review_state: "proposed",
        summary:
          "Record the preserved complaint PDF path on the complaint document",
        counts_as_proof: false,
        proposed_record: {
          document_id: complaintSource.recordId,
          source_artifact_path: complaintSource.workflowPdfPath,
        },
        source_references: [sourceReference(complaintSource, "summary")],
        source_task_run_ids: [...sourceTaskRunIds],
      });
    }
  }

  if (complaintSource.workflowPdfPath === "artifacts/original-complaint.pdf") {
    changes.push({
      id: "change-attach-original-complaint-pdf-source",
      type: "update-document-sources",
      review_state: "proposed",
      summary:
        "Attach the original complaint PDF artifact as an alternate source for the complaint document",
      counts_as_proof: false,
      proposed_record: {
        document_id: complaintSource.recordId,
        sources: [
          {
            filepath_local: complaintSource.workflowPdfPath,
            source_model: "alternate-original",
            source_system: "local_file",
          },
        ],
      },
      source_references: [sourceReference(complaintSource, "summary")],
      source_task_run_ids: [...sourceTaskRunIds],
    });
  }

  if (complaintSource.docketEntryId) {
    changes.push({
      id: "change-update-docket-entry-documents",
      type: "update-docket-entry-documents",
      review_state: "proposed",
      summary: "Link the docket entry to the complaint document",
      counts_as_proof: false,
      proposed_record: {
        docket_entry_id: complaintSource.docketEntryId,
        documents: {
          [complaintSource.recordId]: {
            role: "complaint",
          },
        },
      },
      source_references: [sourceReference(complaintSource, "summary")],
      source_task_run_ids: [...sourceTaskRunIds],
    });
  }

  return changes;
}

function changeSet({
  analysisId,
  caseId,
  changes,
  timestamp,
}: {
  analysisId: string;
  caseId: string;
  changes: readonly IncidentFromComplaintChange[];
  timestamp: string;
}): IncidentFromComplaintChangeSet {
  return {
    analysis_id: analysisId,
    case_id: caseId,
    workflow: "incident-from-complaint",
    status: "draft",
    created_at: timestamp,
    updated_at: timestamp,
    changes: [...changes],
    history: [history("change_set_created", timestamp)],
  };
}

function assertRequiredComplaintSource(
  complaintSource: ComplaintSource,
): AvailableComplaintSource {
  return {
    downloadUrl: complaintSource.downloadUrl,
    docketEntryId: complaintSource.docketEntryId,
    pdfPath: complaintSource.pdfPath ?? "",
    plainText: complaintSource.plainText,
    recordId: complaintSource.recordId,
    recordKind: complaintSource.recordKind,
    selectionReason: complaintSource.selectionReason,
  };
}

async function materializeComplaintPdf({
  complaintSource,
  progress,
  workflowDirectory,
}: {
  complaintSource: ComplaintSource;
  progress: AnalysisProgress;
  workflowDirectory: string;
}): Promise<
  { pdfPath: string; workflowPdfPath?: "artifacts/complaint.pdf" } | undefined
> {
  const localPdfPath = complaintSource.pdfPath;
  if (localPdfPath && (await readablePdf(localPdfPath))) {
    progress.write(
      `incident-from-complaint: using complaint PDF ${localPdfPath}`,
    );
    return { pdfPath: localPdfPath };
  }

  const artifactPdfPath = path.join(
    workflowDirectory,
    "artifacts",
    "complaint.pdf",
  );

  if (await readablePdf(artifactPdfPath)) {
    progress.write(
      `incident-from-complaint: using existing workflow complaint PDF ${artifactPdfPath}`,
    );
    return {
      pdfPath: artifactPdfPath,
      workflowPdfPath: "artifacts/complaint.pdf",
    };
  }

  if (!complaintSource.downloadUrl) {
    progress.write(
      "incident-from-complaint: no downloadable complaint PDF source found",
    );
    return undefined;
  }

  progress.write(
    `incident-from-complaint: downloading complaint PDF from ${complaintSource.downloadUrl}`,
  );
  progress.write(
    `incident-from-complaint: writing workflow PDF ${artifactPdfPath}`,
  );
  if (
    !(await downloadPdfArtifact({
      destinationPath: artifactPdfPath,
      downloadUrl: complaintSource.downloadUrl,
    }))
  ) {
    progress.write("incident-from-complaint: complaint PDF download failed");
    return undefined;
  }

  return {
    pdfPath: artifactPdfPath,
    workflowPdfPath: "artifacts/complaint.pdf",
  };
}

type CurrentAnalysisIdentity = {
  analysisId: string;
  caseId: string;
  createdAt: string;
  mainGraph?: MainGraphSnapshot;
  runs: AnalysisCommandRun[];
  taskPlan: AnalysisTaskPlan;
  workflowRunId: string;
};

function scalarYamlValue(yaml: string, key: string): string | undefined {
  return yaml.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, "m"))?.[1];
}

function mainGraphSnapshotFromYaml(
  yaml: string,
): MainGraphSnapshot | undefined {
  const mainGraphIndex = yaml
    .split("\n")
    .findIndex((line) => line === "main_graph:");
  if (mainGraphIndex === -1) {
    return undefined;
  }

  const capturedAt = yaml.match(/^  captured_at: "?([^"\n]+)"?\s*$/m)?.at(1);
  const caseId = yaml.match(/^  case_id: "?([^"\n]+)"?\s*$/m)?.at(1);
  const graphHash = yaml.match(/^  graph_hash: "?([^"\n]+)"?\s*$/m)?.at(1);
  const hashAlgorithm = yaml
    .match(/^  hash_algorithm: "?([^"\n]+)"?\s*$/m)
    ?.at(1);
  const lines = yaml.split("\n");
  const recordsIndex = lines.findIndex((line) => line === "  records:");

  if (
    !capturedAt ||
    !caseId ||
    !graphHash ||
    hashAlgorithm !== "sha256" ||
    recordsIndex === -1
  ) {
    return undefined;
  }

  const records: Record<string, string> = {};
  for (const line of lines.slice(recordsIndex + 1)) {
    if (!line.startsWith("    ")) {
      break;
    }

    const match = line.match(/^    ([A-Za-z0-9_-]+): "?([^"\n]+)"?\s*$/);
    if (match) {
      records[match[1]] = match[2];
    }
  }

  return {
    captured_at: capturedAt,
    case_id: caseId,
    hash_algorithm: "sha256",
    graph_hash: graphHash,
    records,
  };
}

function workflowRunIdFromYaml(yaml: string): string | undefined {
  const workflowsIndex = yaml
    .split("\n")
    .findIndex((line) => line === "workflows:");
  if (workflowsIndex === -1) {
    return undefined;
  }

  return yaml
    .split("\n")
    .slice(workflowsIndex + 1)
    .join("\n")
    .match(/^\s+-\s+id:\s*"?([^"\n]+)"?\s*$/m)?.[1];
}

function commandRunsFromYaml(yaml: string): AnalysisCommandRun[] {
  const lines = yaml.split("\n");
  const runsIndex = lines.findIndex((line) => line === "runs:");
  if (runsIndex === -1) {
    return [];
  }

  const workflowIndex = lines.findIndex(
    (line, index) => index > runsIndex && line === "workflows:",
  );
  const runLines = lines.slice(
    runsIndex + 1,
    workflowIndex === -1 ? undefined : workflowIndex,
  );
  const runBlocks: string[][] = [];

  for (const line of runLines) {
    if (line === "  -" || line.startsWith("  - id:")) {
      runBlocks.push([line]);
      continue;
    }

    runBlocks.at(-1)?.push(line);
  }

  return runBlocks.map((linesInBlock) => {
    const block = linesInBlock.join("\n");
    const id =
      block.match(/^\s+- id: "?([^"\n]+)"?/m)?.[1] ??
      block.match(/^\s+id: "?([^"\n]+)"?/m)?.[1];
    const operation = block.match(/^\s+operation: "?([^"\n]+)"?/m)?.[1];
    const pathValue = block.match(/^\s+path: "?([^"\n]+)"?/m)?.[1];
    const status = block.match(/^\s+status: "?([^"\n]+)"?/m)?.[1];
    const startedAt = block.match(/^\s+started_at: "?([^"\n]+)"?/m)?.[1];
    const completedAt = block.match(/^\s+completed_at: "?([^"\n]+)"?/m)?.[1];

    if (
      !id ||
      (operation !== "analysis new" && operation !== "analysis resume") ||
      !pathValue ||
      (status !== "running" && status !== "completed" && status !== "failed") ||
      !startedAt
    ) {
      invalidCurrentAnalysisRoot("invalid command run record.");
    }

    return {
      id,
      operation,
      path: pathValue,
      status,
      started_at: startedAt,
      completed_at: completedAt,
    };
  });
}

function taskPlanFromYaml(yaml: string): AnalysisTaskPlan | undefined {
  const pdfMatch = yaml.match(
    /name:\s*"pdf-to-markdown"[\s\S]*?path:\s*"([^"]+)"/,
  );
  const extractMatch = yaml.match(
    /name:\s*"extract-incident"[\s\S]*?path:\s*"([^"]+)"/,
  );

  const pdfPath = pdfMatch?.[1];
  const extractPath = extractMatch?.[1];
  if (!pdfPath || !extractPath) {
    return undefined;
  }

  const pdfId = pdfPath
    .match(/^tasks\/pdf-to-markdown\/([^/]+)\/root\.yaml$/)
    ?.at(1);
  const extractId = extractPath
    .match(/^tasks\/extract-incident\/([^/]+)\/root\.yaml$/)
    ?.at(1);

  if (!pdfId || !extractId) {
    return undefined;
  }

  return {
    extractIncidentTaskRunId: extractId,
    extractIncidentTaskRunRelativePath: extractPath,
    pdfToMarkdownTaskRunId: pdfId,
    pdfToMarkdownTaskRunRelativePath: pdfPath,
  };
}

function changedMainGraphRecordIds(
  expected: MainGraphSnapshot,
  actual: MainGraphSnapshot,
): string[] {
  const recordIds = new Set([
    ...Object.keys(expected.records),
    ...Object.keys(actual.records),
  ]);

  return [...recordIds]
    .filter(
      (recordId) => expected.records[recordId] !== actual.records[recordId],
    )
    .sort((left, right) => left.localeCompare(right));
}

async function readCurrentAnalysisIdentity(
  currentRootPath: string,
): Promise<CurrentAnalysisIdentity | undefined> {
  try {
    const yaml = await readFile(currentRootPath, "utf8");
    const analysisId = scalarYamlValue(yaml, "analysis_id");
    const caseId = scalarYamlValue(yaml, "case_id");
    const createdAt = scalarYamlValue(yaml, "created_at");

    if (!analysisId || !caseId || !createdAt) {
      return undefined;
    }

    return {
      analysisId,
      caseId,
      createdAt,
      mainGraph: mainGraphSnapshotFromYaml(yaml),
      runs: commandRunsFromYaml(yaml),
      taskPlan:
        taskPlanFromYaml(yaml) ??
        invalidCurrentAnalysisRoot("missing planned task run IDs."),
      workflowRunId:
        workflowRunIdFromYaml(yaml) ??
        invalidCurrentAnalysisRoot("missing workflow run ID."),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function writeCurrentRoot({
  analysisId,
  caseId,
  createdAt,
  currentRootPath,
  flag,
  mainGraph,
  runs,
  taskPlan,
  updatedAt,
  workflowCompletedAt,
  workflowRunId,
  workflowStartedAt,
}: {
  analysisId: string;
  caseId: string;
  createdAt: string;
  currentRootPath: string;
  flag?: "wx";
  mainGraph: MainGraphSnapshot;
  runs: readonly AnalysisCommandRun[];
  taskPlan: AnalysisTaskPlan;
  updatedAt: string;
  workflowCompletedAt?: string;
  workflowRunId: string;
  workflowStartedAt: string;
}): Promise<void> {
  await writeFile(
    currentRootPath,
    currentAnalysisRootYaml(
      currentRoot({
        analysisId,
        caseId,
        createdAt,
        mainGraph,
        runs,
        taskPlan,
        workflowCompletedAt,
        workflowRunId,
        workflowStartedAt,
        updatedAt,
      }),
    ),
    flag ? { flag } : undefined,
  );
}

function analysisCommandRunYaml({
  caseId,
  completedAt,
  error,
  id,
  operation,
  report,
  startedAt,
  status,
  usedExistingWorkflowRun,
  workflow,
}: {
  caseId: string;
  completedAt: string;
  error?: string;
  id: string;
  operation: "analysis new" | "analysis resume";
  report?: string;
  startedAt: string;
  status: "completed" | "failed";
  usedExistingWorkflowRun?: boolean;
  workflow: "incident-from-complaint";
}): string {
  return [
    `id: ${JSON.stringify(id)}`,
    `case_id: ${JSON.stringify(caseId)}`,
    `operation: ${JSON.stringify(operation)}`,
    `workflow: ${JSON.stringify(workflow)}`,
    `status: ${JSON.stringify(status)}`,
    `started_at: ${JSON.stringify(startedAt)}`,
    `completed_at: ${JSON.stringify(completedAt)}`,
    ...(report ? [`report: ${JSON.stringify(report)}`] : []),
    ...(usedExistingWorkflowRun === undefined
      ? []
      : [`used_existing_workflow_run: ${String(usedExistingWorkflowRun)}`]),
    ...(error ? [`error: ${JSON.stringify(error)}`] : []),
    "",
  ].join("\n");
}

async function writeAnalysisCommandRunResult({
  caseId,
  currentDirectory,
  error,
  operation,
  report,
  runId,
  startedAt,
  status,
  timestamp,
  usedExistingWorkflowRun,
}: {
  caseId: string;
  currentDirectory: string;
  error?: string;
  operation: "analysis new" | "analysis resume";
  report?: string;
  runId: string;
  startedAt: string;
  status: "completed" | "failed";
  timestamp: string;
  usedExistingWorkflowRun?: boolean;
}): Promise<void> {
  await writeFile(
    path.join(currentDirectory, `${runId}.yaml`),
    analysisCommandRunYaml({
      caseId,
      completedAt: timestamp,
      error,
      id: runId,
      operation,
      report,
      startedAt,
      status,
      usedExistingWorkflowRun,
      workflow: "incident-from-complaint",
    }),
    { flag: "wx" },
  );
}

async function writeExtractIncidentTask({
  taskRunId,
  timestamp,
  workflowDirectory,
  workflowOutput,
}: {
  taskRunId: string;
  timestamp: string;
  workflowDirectory: string;
  workflowOutput: Awaited<ReturnType<typeof runIncidentFromComplaintWorkflow>>;
}): Promise<void> {
  const taskDirectory = path.join(
    workflowDirectory,
    "tasks",
    "extract-incident",
    taskRunId,
  );
  const artifactDirectory = path.join(taskDirectory, "artifacts");
  await mkdir(artifactDirectory, { recursive: true });

  await writeFile(
    path.join(taskDirectory, "root.yaml"),
    [
      'id: "extract-incident"',
      `run_id: ${JSON.stringify(taskRunId)}`,
      'name: "extract-incident"',
      'workflow: "incident-from-complaint"',
      'status: "completed"',
      `created_at: ${JSON.stringify(timestamp)}`,
      `updated_at: ${JSON.stringify(timestamp)}`,
      "executor:",
      '  engine: "langgraph"',
      '  ai: "openai-responses"',
      "artifacts:",
      '  extraction: "../../artifacts/extraction.yaml"',
      ...(workflowOutput.aiAudit
        ? [
            '  prompt: "artifacts/prompt.md"',
            '  prompt_response: "artifacts/prompt-response.json"',
          ]
        : []),
      "history:",
      `  - event: "task_completed"`,
      `    at: ${JSON.stringify(timestamp)}`,
      "",
    ].join("\n"),
  );

  await writeFile(
    path.join(taskDirectory, "report.md"),
    [
      "# Extract Incident Task",
      "",
      "This task extracted incident facts from the complaint text and produced the workflow extraction artifact.",
      "",
      ...(workflowOutput.aiAudit
        ? [
            "Audit artifacts:",
            "",
            "- `artifacts/prompt.md`",
            "- `artifacts/prompt-response.json`",
            "",
          ]
        : ["No external AI audit artifacts were produced for this run.", ""]),
    ].join("\n"),
  );

  if (!workflowOutput.aiAudit) {
    return;
  }

  await writeFile(
    path.join(artifactDirectory, "prompt.md"),
    workflowOutput.aiAudit.prompt,
  );
  await writeFile(
    path.join(artifactDirectory, "prompt-response.json"),
    `${JSON.stringify(workflowOutput.aiAudit.response, null, 2)}\n`,
  );
}

async function readExistingCompletedWorkflowReport({
  taskPlan,
  workflowDirectory,
}: {
  taskPlan: AnalysisTaskPlan;
  workflowDirectory: string;
}): Promise<string | undefined> {
  const workflowOutputFiles = [
    "root.yaml",
    "change-set.yaml",
    "report.md",
    "artifacts/extraction.yaml",
    "workflow-run.yaml",
  ];
  const requiredFiles = [
    ...workflowOutputFiles,
    taskPlan.pdfToMarkdownTaskRunRelativePath,
    taskPlan.extractIncidentTaskRunRelativePath,
    path.posix.join(
      path.posix.dirname(taskPlan.extractIncidentTaskRunRelativePath),
      "report.md",
    ),
  ];
  const existing = await Promise.all(
    requiredFiles.map(async (relativePath) => ({
      exists: await pathExists(path.join(workflowDirectory, relativePath)),
      relativePath,
    })),
  );
  const workflowOutputCount = existing.filter(
    (file) => workflowOutputFiles.includes(file.relativePath) && file.exists,
  ).length;

  if (workflowOutputCount === 0) {
    return undefined;
  }

  const missing = existing.filter((file) => !file.exists);
  if (missing.length > 0) {
    throw new Error(
      `Existing workflow output is incomplete.\n\nMissing files:\n${missing.map((file) => `- incident-from-complaint/${file.relativePath}`).join("\n")}`,
    );
  }

  const extractTaskRootPath = path.join(
    workflowDirectory,
    taskPlan.extractIncidentTaskRunRelativePath,
  );
  const extractTaskRoot = await readFile(extractTaskRootPath, "utf8");
  const auditFiles = extractTaskRoot.includes('prompt: "artifacts/prompt.md"')
    ? [
        path.posix.join(
          path.posix.dirname(taskPlan.extractIncidentTaskRunRelativePath),
          "artifacts/prompt.md",
        ),
        path.posix.join(
          path.posix.dirname(taskPlan.extractIncidentTaskRunRelativePath),
          "artifacts/prompt-response.json",
        ),
      ]
    : [];
  const missingAuditFiles = (
    await Promise.all(
      auditFiles.map(async (relativePath) => ({
        exists: await pathExists(path.join(workflowDirectory, relativePath)),
        relativePath,
      })),
    )
  ).filter((file) => !file.exists);

  if (missingAuditFiles.length > 0) {
    throw new Error(
      `Existing workflow output is incomplete.\n\nMissing files:\n${missingAuditFiles.map((file) => `- incident-from-complaint/${file.relativePath}`).join("\n")}`,
    );
  }

  return readFile(path.join(workflowDirectory, "report.md"), "utf8");
}

async function runCurrentIncidentFromComplaintAnalysis({
  analysisId,
  caseId,
  commandRunId,
  commandRunStartedAt,
  commandRuns,
  createdAt,
  currentDirectory,
  currentRootPath,
  mainGraph,
  nodes,
  operation,
  progress,
  runtime,
  aiCacheDirectory,
  taskPlan,
  workflowDirectory,
  workflowRunId,
}: {
  analysisId: string;
  caseId: string;
  commandRunId: string;
  commandRunStartedAt: string;
  commandRuns: readonly AnalysisCommandRun[];
  createdAt: string;
  currentDirectory: string;
  currentRootPath: string;
  mainGraph: MainGraphSnapshot;
  nodes: readonly GraphNode[];
  operation: "analysis new" | "analysis resume";
  progress: AnalysisProgress;
  runtime: AnalysisNewRuntime;
  aiCacheDirectory: string;
  taskPlan: AnalysisTaskPlan;
  workflowDirectory: string;
  workflowRunId: string;
}): Promise<CommandResult> {
  progress.write(`${operation}: finding complaint source`);
  const complaintSource = findComplaintSource(nodes);

  if (!complaintSource) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `${operation === "analysis new" ? "Analysis not created." : "Analysis not resumed."}\n\nReason:\nNo complaint source was found.\n\nNext:\nAdd or identify a complaint source, then run:\ncasegraph cases analysis ${operation === "analysis new" ? "new" : "resume"} ${caseId}\n`,
      ),
    };
  }
  progress.write(
    `${operation}: complaint source ${complaintSource.recordKind}/${complaintSource.recordId}`,
  );

  const timestamp = new Date().toISOString();
  const runningCommandRuns: AnalysisCommandRun[] = [
    ...commandRuns,
    {
      id: commandRunId,
      operation,
      path: `${commandRunId}.yaml`,
      status: "running",
      started_at: commandRunStartedAt,
    },
  ];

  async function completeCommandRun({
    error,
    report,
    status,
    usedExistingWorkflowRun,
  }: {
    error?: string;
    report?: string;
    status: "completed" | "failed";
    usedExistingWorkflowRun?: boolean;
  }): Promise<void> {
    const completedAt = new Date().toISOString();
    const completedRuns = runningCommandRuns.map((run) =>
      run.id === commandRunId
        ? { ...run, completed_at: completedAt, status }
        : run,
    );
    await writeAnalysisCommandRunResult({
      caseId,
      currentDirectory,
      error,
      operation,
      report,
      runId: commandRunId,
      startedAt: commandRunStartedAt,
      status,
      timestamp: completedAt,
      usedExistingWorkflowRun,
    });
    await writeCurrentRoot({
      analysisId,
      caseId,
      createdAt,
      currentRootPath,
      mainGraph,
      runs: completedRuns,
      taskPlan,
      updatedAt: completedAt,
      workflowCompletedAt: status === "completed" ? completedAt : undefined,
      workflowRunId,
      workflowStartedAt: createdAt,
    });
  }

  progress.write(
    `${operation}: creating workflow directory ${workflowDirectory}`,
  );
  await mkdir(path.join(workflowDirectory, "artifacts"), { recursive: true });

  progress.write(`${operation}: recording command run ${commandRunId}`);
  await writeCurrentRoot({
    analysisId,
    caseId,
    createdAt,
    currentRootPath,
    flag: operation === "analysis new" ? "wx" : undefined,
    mainGraph,
    runs: runningCommandRuns,
    taskPlan,
    updatedAt: timestamp,
    workflowRunId,
    workflowStartedAt: createdAt,
  });

  if (operation === "analysis resume") {
    let existingReport: string | undefined;
    try {
      existingReport = await readExistingCompletedWorkflowReport({
        taskPlan,
        workflowDirectory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await completeCommandRun({
        error: message,
        status: "failed",
      });
      return {
        exitCode: 1,
        stderr: errorOutput(
          progress,
          runtime,
          `Analysis not resumed.\n\nReason:\n${message}\n\nNext:\nReview or abandon the current analysis before starting a new one.\n`,
        ),
      };
    }

    if (existingReport) {
      await completeCommandRun({
        report: "incident-from-complaint/report.md",
        status: "completed",
        usedExistingWorkflowRun: true,
      });
      progress.write("analysis resume: using existing completed workflow run");
      progress.write("analysis resume: done");
      return {
        exitCode: 0,
        stdout: `Analysis resumed.\n\n${existingReport}\nMain graph:\nunchanged\n`,
        stderr: progressOutput(progress, runtime),
      };
    }
  }

  const materializedPdf = await materializeComplaintPdf({
    complaintSource,
    progress,
    workflowDirectory,
  });

  if (!materializedPdf) {
    const message = "The complaint PDF is unavailable.";
    await completeCommandRun({
      error: message,
      status: "failed",
    });
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not completed.\n\nReason:\n${message}\n\nNext:\nAfter adding or identifying a usable complaint PDF, run:\ncasegraph cases analysis resume ${caseId}\n`,
      ),
    };
  }

  const pdfOutput = await runPdfToMarkdownWorkflow({
    analysisId,
    caseId,
    env: runtime.env,
    progress: progress.write,
    promptForOriginalPdfPath: runtime.promptForOriginalPdfPath,
    source: {
      ...complaintSource,
      pdfPath: materializedPdf.pdfPath,
    },
    taskRunId: taskPlan.pdfToMarkdownTaskRunId,
    timestamp,
    visionExtractor: runtime.pdfToMarkdownVisionExtractor,
    workflowDirectory,
  });

  if (!pdfOutput.markdownPath) {
    const message =
      "The complaint PDF text is unavailable after native text, OCR, and vision extraction attempts.";
    await completeCommandRun({
      error: message,
      status: "failed",
    });
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not completed.\n\nReason:\n${message}\n\nNext:\nAfter adding usable complaint text or fixing extraction support, run:\ncasegraph cases analysis resume ${caseId}\n`,
      ),
    };
  }

  const complaintTextPath = pdfOutput.markdownPath;
  progress.write(`${operation}: reading complaint text ${complaintTextPath}`);
  const complaintText = readMarkdownTextArtifact(
    await readFile(complaintTextPath, "utf8"),
  );
  const requiredComplaintSource: AvailableComplaintSource = {
    ...assertRequiredComplaintSource({
      ...complaintSource,
      pdfPath: materializedPdf.pdfPath,
    }),
    pdfPath: pdfOutput.pdfPath,
    workflowPdfPath:
      pdfOutput.alternateOriginalPdfRelativePath ??
      materializedPdf.workflowPdfPath,
    workflowTextArtifactId: pdfOutput.markdownArtifactId,
    workflowTextPath: pdfOutput.markdownRelativePath,
  };

  if (
    !runtime.incidentFromComplaintAiExtractor &&
    !openAiCommandAvailable({ env: runtime.env })
  ) {
    const message = "The configured AI API key is unavailable: OPENAI_API_KEY.";
    await completeCommandRun({
      error: message,
      status: "failed",
    });
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not completed.\n\nReason:\n${message}\n\nSetup:\nSet OPENAI_API_KEY for the shell running CaseGraph.\n\nNext:\nAfter OPENAI_API_KEY is available, run:\ncasegraph cases analysis resume ${caseId}\n`,
      ),
    };
  }

  progress.write(
    `incident-from-complaint: starting workflow with ${String(complaintText.length)} complaint text characters`,
  );
  let workflowOutput: Awaited<
    ReturnType<typeof runIncidentFromComplaintWorkflow>
  >;
  try {
    workflowOutput = await runIncidentFromComplaintWorkflow({
      aiExtractor:
        runtime.incidentFromComplaintAiExtractor ??
        openAiIncidentFromComplaintExtractor(progress.write, runtime.env, {
          directory: aiCacheDirectory,
          taskRunId: taskPlan.extractIncidentTaskRunId,
        }),
      input: {
        analysisId,
        caseId,
        complaintSource: requiredComplaintSource,
        complaintText,
        sourceTaskRunIds: [
          taskPlan.pdfToMarkdownTaskRunId,
          taskPlan.extractIncidentTaskRunId,
        ],
        timestamp,
      },
      progress: progress.write,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeCommandRun({
      error: `OpenAI extraction failed: ${message}`,
      status: "failed",
    });
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not completed.\n\nReason:\nOpenAI extraction failed: ${message}\n\nNext:\nAfter fixing the configured AI request, run:\ncasegraph cases analysis resume ${caseId}\n`,
      ),
    };
  }
  progress.write("incident-from-complaint: workflow completed");
  progress.write(`${operation}: creating supporting proposed changes`);
  const changes = [
    ...workflowOutput.changes,
    ...(await supportingChanges(requiredComplaintSource, [
      taskPlan.pdfToMarkdownTaskRunId,
    ])),
  ];
  const report = incidentFromComplaintReport(
    {
      analysisId,
      caseId,
      complaintSource: requiredComplaintSource,
      complaintText,
      sourceTaskRunIds: [
        taskPlan.pdfToMarkdownTaskRunId,
        taskPlan.extractIncidentTaskRunId,
      ],
      timestamp,
    },
    workflowOutput.extraction,
    changes,
  );
  const changeSetYaml = incidentFromComplaintChangeSetYaml(
    changeSet({ analysisId, caseId, changes, timestamp }),
  );

  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, "root.yaml")}`,
  );
  const inputSnapshot = mainGraphWorkingSnapshot(mainGraph);
  const outputSnapshot = workflowOutputSnapshot({
    changeSetYaml,
    input: inputSnapshot,
  });
  await writeFile(
    path.join(workflowDirectory, "root.yaml"),
    incidentFromComplaintWorkflowRootYaml(
      workflowRoot({
        analysisId,
        caseId,
        complaintSource: requiredComplaintSource,
        extractIncidentTask: {
          id: taskPlan.extractIncidentTaskRunId,
          path: taskPlan.extractIncidentTaskRunRelativePath,
          status: "completed",
        },
        inputSnapshot,
        outputSnapshot,
        pdfTask: {
          id: pdfOutput.taskRunId,
          path: pdfOutput.taskRunRelativePath,
          status: pdfOutput.status,
        },
        timestamp,
      }),
    ),
    { flag: "wx" },
  );
  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, "change-set.yaml")}`,
  );
  await writeFile(
    path.join(workflowDirectory, "change-set.yaml"),
    changeSetYaml,
    { flag: "wx" },
  );
  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, "report.md")}`,
  );
  await writeFile(path.join(workflowDirectory, "report.md"), report, {
    flag: "wx",
  });
  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, "artifacts", "extraction.yaml")}`,
  );
  await writeExtractionArtifact({
    extraction: workflowOutput.extraction,
    path: path.join(workflowDirectory, "artifacts", "extraction.yaml"),
  });
  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, taskPlan.extractIncidentTaskRunRelativePath)}`,
  );
  await writeExtractIncidentTask({
    taskRunId: taskPlan.extractIncidentTaskRunId,
    timestamp,
    workflowDirectory,
    workflowOutput,
  });
  progress.write(
    `${operation}: writing ${path.join(workflowDirectory, "workflow-run.yaml")}`,
  );
  await writeFile(
    path.join(workflowDirectory, "workflow-run.yaml"),
    incidentFromComplaintWorkflowRunYaml(workflowOutput.workflowRun),
    { flag: "wx" },
  );

  progress.write(`${operation}: updating ${currentRootPath}`);
  await writeCurrentRoot({
    analysisId,
    caseId,
    createdAt,
    currentRootPath,
    mainGraph,
    runs: runningCommandRuns.map((run) =>
      run.id === commandRunId
        ? { ...run, completed_at: timestamp, status: "completed" }
        : run,
    ),
    taskPlan,
    updatedAt: timestamp,
    workflowCompletedAt: timestamp,
    workflowRunId,
    workflowStartedAt: createdAt,
  });
  await writeAnalysisCommandRunResult({
    caseId,
    currentDirectory,
    operation,
    report: "incident-from-complaint/report.md",
    runId: commandRunId,
    startedAt: commandRunStartedAt,
    status: "completed",
    timestamp,
    usedExistingWorkflowRun: false,
  });
  progress.write(`${operation}: done`);

  return {
    exitCode: 0,
    stdout: `${operation === "analysis new" ? "Analysis created." : "Analysis resumed."}\n\n${report}\nMain graph:\nunchanged\n`,
    stderr: progressOutput(progress, runtime),
  };
}

async function createAnalysis(
  caseId: string,
  cwd: string,
  runtime: AnalysisNewRuntime = {},
): Promise<CommandResult> {
  const progress = createAnalysisProgress(runtime);
  progress.write(`analysis new: resolving case ${caseId}`);
  const resolved = await loadCaseWorkspace(caseId, cwd, runtime, {
    requireWritableHome: true,
  });
  if ("exitCode" in resolved) {
    return {
      ...resolved,
      stderr: errorOutput(
        progress,
        runtime,
        resolved.stderr ?? "Unable to load case workspace.\n",
      ),
    };
  }
  const workspacePath = resolved.homeDirectory;
  progress.write(`analysis new: checking workspace ${workspacePath}`);

  const currentDirectory = path.join(workspacePath, "analysis", "current");
  const currentRootPath = path.join(currentDirectory, "root.yaml");

  progress.write("analysis new: checking current analysis");
  if (await pathExists(currentRootPath)) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not created.\n\nReason:\nA current analysis already exists.\n\nNext:\ncasegraph cases analysis resume ${caseId}\n`,
      ),
    };
  }

  progress.write("analysis new: loading main case graph");
  const parsedNodes = await readGraphNodes(workspacePath, resolved.graphRoot);
  const nodes = parsedNodes.map(({ node }) => node);

  progress.write("analysis new: checking main graph for existing incident");
  if (nodes.some((node) => node.kind === "incident")) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        "Analysis not created.\n\nReason:\nMain already has an incident.\n\nNext:\nNo next analysis workflow is defined yet.\n",
      ),
    };
  }

  const analysisId = createDefaultAnalysisId();
  const commandRunId = createDefaultAnalysisId();
  const workflowRunId = createDefaultAnalysisId();
  const taskPlan = createAnalysisTaskPlan();
  progress.write(`analysis new: created analysis id ${analysisId}`);
  const workflowDirectory = path.join(
    currentDirectory,
    "incident-from-complaint",
  );
  const timestamp = new Date().toISOString();
  const graphSnapshot = await mainGraphSnapshot({
    caseId,
    capturedAt: timestamp,
    parsedNodes,
    workspacePath,
  });
  return runCurrentIncidentFromComplaintAnalysis({
    analysisId,
    caseId,
    commandRunId,
    commandRunStartedAt: timestamp,
    commandRuns: [],
    createdAt: timestamp,
    currentDirectory,
    currentRootPath,
    mainGraph: graphSnapshot,
    nodes,
    operation: "analysis new",
    progress,
    runtime,
    aiCacheDirectory: path.join(cwd, ".cache"),
    taskPlan,
    workflowDirectory,
    workflowRunId,
  });
}

export async function runAnalysisNewCommand(
  analysisArgs: readonly string[],
  cwd: string,
  runtime: AnalysisNewRuntime = {},
): Promise<CommandResult> {
  if (analysisArgs.length === 0) {
    const resolvedCaseId = await resolveOnlyCaseId(cwd, runtime);

    if (typeof resolvedCaseId !== "string") {
      return resolvedCaseId;
    }

    return createAnalysis(resolvedCaseId, cwd, runtime);
  }

  if (analysisArgs.length === 1) {
    const [caseId] = analysisArgs;
    return createAnalysis(caseId, cwd, runtime);
  }

  return unexpectedAnalysisNewArgument(analysisArgs[1] ?? "");
}

async function resumeAnalysis(
  caseId: string,
  cwd: string,
  runtime: AnalysisNewRuntime = {},
): Promise<CommandResult> {
  const progress = createAnalysisProgress(runtime);
  progress.write(`analysis resume: resolving case ${caseId}`);
  const resolved = await loadCaseWorkspace(caseId, cwd, runtime, {
    requireWritableHome: true,
  });
  if ("exitCode" in resolved) {
    return {
      ...resolved,
      stderr: errorOutput(
        progress,
        runtime,
        resolved.stderr ?? "Unable to load case workspace.\n",
      ),
    };
  }
  const workspacePath = resolved.homeDirectory;
  progress.write(`analysis resume: checking workspace ${workspacePath}`);

  const currentDirectory = path.join(workspacePath, "analysis", "current");
  const currentRootPath = path.join(currentDirectory, "root.yaml");
  progress.write("analysis resume: reading current analysis root");
  let currentIdentity: CurrentAnalysisIdentity | undefined;
  try {
    currentIdentity = await readCurrentAnalysisIdentity(currentRootPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not resumed.\n\nReason:\n${message}\n\nNext:\nReview or abandon the current analysis before starting a new one.\n`,
      ),
    };
  }

  if (!currentIdentity) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not resumed.\n\nReason:\nNo current analysis exists.\n\nNext:\ncasegraph cases analysis new ${caseId}\n`,
      ),
    };
  }

  if (currentIdentity.caseId !== caseId) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not resumed.\n\nReason:\nThe current analysis root belongs to case ${currentIdentity.caseId}.\n`,
      ),
    };
  }

  progress.write("analysis resume: loading main case graph");
  const parsedNodes = await readGraphNodes(workspacePath, resolved.graphRoot);
  const nodes = parsedNodes.map(({ node }) => node);
  const timestamp = new Date().toISOString();
  const graphSnapshot = await mainGraphSnapshot({
    caseId,
    capturedAt: timestamp,
    parsedNodes,
    workspacePath,
  });

  if (!currentIdentity.mainGraph) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        "Analysis not resumed.\n\nReason:\nThe current analysis root does not record a main graph snapshot.\n\nNext:\nReview or abandon the current analysis before starting a new one.\n",
      ),
    };
  }

  const changedRecords = changedMainGraphRecordIds(
    currentIdentity.mainGraph,
    graphSnapshot,
  );
  if (changedRecords.length > 0) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        `Analysis not resumed.\n\nReason:\nThe main graph changed since this analysis started.\n\nChanged records:\n${changedRecords.map((recordId) => `- ${recordId}`).join("\n")}\n\nNext:\nReview or abandon the current analysis before starting a new one.\n`,
      ),
    };
  }

  progress.write("analysis resume: checking main graph for existing incident");
  if (nodes.some((node) => node.kind === "incident")) {
    return {
      exitCode: 1,
      stderr: errorOutput(
        progress,
        runtime,
        "Analysis not resumed.\n\nReason:\nMain already has an incident.\n",
      ),
    };
  }

  return runCurrentIncidentFromComplaintAnalysis({
    analysisId: currentIdentity.analysisId,
    caseId,
    commandRunId: createDefaultAnalysisId(),
    commandRunStartedAt: timestamp,
    commandRuns: currentIdentity.runs,
    createdAt: currentIdentity.createdAt,
    currentDirectory,
    currentRootPath,
    mainGraph: graphSnapshot,
    nodes,
    operation: "analysis resume",
    progress,
    runtime,
    aiCacheDirectory: path.join(cwd, ".cache"),
    taskPlan: currentIdentity.taskPlan,
    workflowDirectory: path.join(currentDirectory, "incident-from-complaint"),
    workflowRunId: currentIdentity.workflowRunId,
  });
}

export async function runAnalysisResumeCommand(
  analysisArgs: readonly string[],
  cwd: string,
  runtime: AnalysisNewRuntime = {},
): Promise<CommandResult> {
  if (analysisArgs.length === 0) {
    const resolvedCaseId = await resolveOnlyCaseId(cwd, runtime);

    if (typeof resolvedCaseId !== "string") {
      return resolvedCaseId;
    }

    return resumeAnalysis(resolvedCaseId, cwd, runtime);
  }

  if (analysisArgs.length === 1) {
    const [caseId] = analysisArgs;
    return resumeAnalysis(caseId, cwd, runtime);
  }

  return unexpectedAnalysisResumeArgument(analysisArgs[1] ?? "");
}
