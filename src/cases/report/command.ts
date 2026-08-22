import {
  graphTraversalSummary,
  readGraphNodes,
  type DocketEntryNode,
  type DocumentNode,
} from "../graph/records.js";
import { resolveOnlyCaseId } from "../workspaces.js";
import type { CaseGraphRoot } from "../workspaces/case-home-document.js";
import type { WorkspaceRuntime } from "../workspaces/create.js";
import { loadCaseWorkspace } from "../workspaces/load.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

type DocketEntryRecord = {
  dateFiled?: string;
  description?: string;
  entryNumber?: number;
  id: string;
  recapDocuments: string[];
};

type DocumentRecord = {
  description?: string;
  docketEntry?: string;
  documentNumber?: number;
  documentType?: string;
  id: string;
};

type MissingCategoryCounts = {
  claims: number;
  evidence: number;
  facts: number;
  supportAnalysis: number;
  unlinkedRecords: number;
};

type CaseReport = {
  docketEntries: DocketEntryRecord[];
  documents: DocumentRecord[];
  missingCategoryCounts: MissingCategoryCounts;
};

const docketRowMaxLength = 80;

export const casesReportHelp = `Usage: casegraph cases report <case-id>
       casegraph cases report

Print a read-only legal docket for an existing case workspace.

The report reads case-home graph records only.
The case ID may be omitted only when exactly one valid case exists.
`;

function initialMissingCategoryCounts(): MissingCategoryCounts {
  return {
    claims: 0,
    evidence: 0,
    facts: 0,
    supportAnalysis: 0,
    unlinkedRecords: 0,
  };
}

function addMissingCategoryKind(
  counts: MissingCategoryCounts,
  kind: string | undefined,
): void {
  if (kind === "claim") {
    counts.claims += 1;
  }

  if (kind === "evidence") {
    counts.evidence += 1;
  }

  if (kind === "fact") {
    counts.facts += 1;
  }

  if (kind === "support_analysis") {
    counts.supportAnalysis += 1;
  }
}

function docketEntryRecord(node: DocketEntryNode): DocketEntryRecord {
  return {
    dateFiled: node.date_filed,
    description: node.description,
    entryNumber: node.entry_number,
    id: node.id,
    recapDocuments: node.recap_documents ?? [],
  };
}

function documentRecord(node: DocumentNode): DocumentRecord {
  return {
    description: node.description,
    docketEntry: node.docket_entry,
    documentNumber: node.document_number,
    documentType: node.document_type,
    id: node.id,
  };
}

async function readCaseReport(
  homeDirectory: string,
  rootNode: CaseGraphRoot,
): Promise<CaseReport> {
  const graphNodes = await readGraphNodes(homeDirectory, rootNode);
  const docketEntries: DocketEntryRecord[] = [];
  const documents: DocumentRecord[] = [];
  const missingCategoryCounts = initialMissingCategoryCounts();
  const traversalSummary = graphTraversalSummary(graphNodes);

  missingCategoryCounts.unlinkedRecords = traversalSummary.unlinkedRecordCount;

  for (const { node } of graphNodes) {
    addMissingCategoryKind(missingCategoryCounts, node.kind);

    if (node.kind === "docket_entry") {
      docketEntries.push(docketEntryRecord(node));
    }

    if (node.kind === "document") {
      documents.push(documentRecord(node));
    }
  }

  return {
    docketEntries: docketEntries.sort(compareDocketEntries),
    documents,
    missingCategoryCounts,
  };
}

function compareDocketEntries(
  left: DocketEntryRecord,
  right: DocketEntryRecord,
): number {
  const leftDate = left.dateFiled ?? "9999-99-99";
  const rightDate = right.dateFiled ?? "9999-99-99";
  const dateComparison = leftDate.localeCompare(rightDate);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return (
    (left.entryNumber ?? Number.MAX_SAFE_INTEGER) -
    (right.entryNumber ?? Number.MAX_SAFE_INTEGER)
  );
}

function documentsForEntry(
  entry: DocketEntryRecord,
  documents: readonly DocumentRecord[],
): DocumentRecord[] {
  return documents
    .filter(
      (document) =>
        document.docketEntry === entry.id ||
        entry.recapDocuments.includes(document.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function formatDocument(document: DocumentRecord): string {
  const numberText =
    document.documentNumber === undefined
      ? ""
      : `#${String(document.documentNumber)}`;
  const typeText = document.documentType ?? "";
  const detail = [numberText, typeText].filter(Boolean).join(" ");
  const suffix = document.description ? ` - ${document.description}` : "";

  return `${document.id}${detail ? ` (${detail})` : ""}${suffix}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return ".".repeat(maxLength);
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function formatDocketEntryRow(entry: DocketEntryRecord): string {
  const date = entry.dateFiled ?? "date unavailable";
  const entryNumber =
    entry.entryNumber === undefined ? "#" : `#${String(entry.entryNumber)}`;
  const prefix = `${date} | ${entryNumber} | `;
  const description = entry.description ?? "No docket text available.";

  return `${prefix}${truncateText(description, docketRowMaxLength - prefix.length)}`;
}

function formatCount(count: number): string {
  return count === 0 ? "none" : String(count);
}

function appendMissingCategorySummary(
  output: string[],
  counts: MissingCategoryCounts,
): void {
  output.push(
    "",
    "Missing next-step categories:",
    `- Evidence records: ${formatCount(counts.evidence)}`,
    `- Unlinked records: ${formatCount(counts.unlinkedRecords)}`,
    `- Accepted facts: ${formatCount(counts.facts)}`,
    `- Accepted claims: ${formatCount(counts.claims)}`,
    `- Support analysis: ${formatCount(counts.supportAnalysis)}`,
  );
}

function formatReport(caseId: string, report: CaseReport): string {
  const output = [`Case: ${caseId}`, "", "Legal docket:"];

  if (report.docketEntries.length === 0) {
    output.push("No docket entries are present.");
    appendMissingCategorySummary(output, report.missingCategoryCounts);
    output.push("");
    return output.join("\n");
  }

  for (const entry of report.docketEntries) {
    output.push(formatDocketEntryRow(entry));

    const entryDocuments = documentsForEntry(entry, report.documents);
    if (entryDocuments.length > 0) {
      output.push(
        `  Documents: ${entryDocuments.map(formatDocument).join("; ")}`,
      );
    }
  }

  appendMissingCategorySummary(output, report.missingCategoryCounts);
  output.push("");
  return output.join("\n");
}

export async function runReportCommand(
  reportArgs: readonly string[],
  cwd: string,
  runtime: WorkspaceRuntime,
): Promise<CommandResult> {
  if (reportArgs.length > 1) {
    return {
      exitCode: 1,
      stderr: `Unexpected report argument: ${reportArgs[1] ?? ""}\n\n${casesReportHelp}`,
    };
  }

  const resolvedCaseId =
    reportArgs.length === 0
      ? await resolveOnlyCaseId(cwd, runtime)
      : (reportArgs[0] ?? "");

  if (typeof resolvedCaseId !== "string") {
    return resolvedCaseId;
  }

  const resolved = await loadCaseWorkspace(resolvedCaseId, cwd, runtime, {
    requireWritableHome: false,
  });
  if ("exitCode" in resolved) {
    return resolved;
  }

  const report = await readCaseReport(
    resolved.homeDirectory,
    resolved.graphRoot,
  );

  return {
    exitCode: 0,
    stdout: formatReport(resolvedCaseId, report),
  };
}
