import { constants } from "node:fs";
import { access, open, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveOnlyCaseId } from "../../workspaces.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { loadCaseWorkspace } from "../../workspaces/load.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export const casesAddDocumentHelp = `Usage: casegraph cases add document <case-id> complaint <path-to-pdf>
       casegraph cases add document complaint <path-to-pdf>

Record a complaint document node in an existing case workspace.

Only complaint documents are supported.
The source file must exist, be readable, and be a PDF.
The PDF is not copied, parsed, or hashed.
The case ID may be omitted only when exactly one valid case exists.
`;

function unexpectedAddDocumentArgument(argument: string): CommandResult {
  return {
    exitCode: 1,
    stderr: `Unexpected add document argument: ${argument}\n\n${casesAddDocumentHelp}`,
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

async function validateReadablePdf(
  filePath: string,
): Promise<CommandResult | undefined> {
  let sourceStat;

  try {
    sourceStat = await stat(filePath);
    await access(filePath, constants.R_OK);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT" || nodeError.code === "EACCES") {
      return {
        exitCode: 1,
        stderr: `Complaint PDF is not readable: ${filePath}\n`,
      };
    }

    throw error;
  }

  if (!sourceStat.isFile()) {
    return {
      exitCode: 1,
      stderr: `Complaint PDF is not a readable file: ${filePath}\n`,
    };
  }

  const file = await open(filePath, "r");
  try {
    const signature = Buffer.alloc(5);
    const { bytesRead } = await file.read(signature, 0, signature.length, 0);

    if (
      bytesRead < signature.length ||
      signature.toString("utf8") !== "%PDF-"
    ) {
      return {
        exitCode: 1,
        stderr: `Only PDF files are supported: ${filePath}\n`,
      };
    }
  } finally {
    await file.close();
  }

  return undefined;
}

async function addComplaintDocument(
  caseId: string | undefined,
  documentType: string | undefined,
  pdfPath: string | undefined,
  cwd: string,
  runtime: WorkspaceRuntime,
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

  const resolved = await loadCaseWorkspace(caseId, cwd, runtime, {
    requireWritableHome: true,
  });
  if ("exitCode" in resolved) {
    return resolved;
  }

  const complaintPath = path.join(resolved.homeDirectory, "complaint.yaml");

  if (await pathExists(complaintPath)) {
    return {
      exitCode: 1,
      stderr: `Complaint document already exists: ${complaintPath}\n`,
    };
  }

  const pdfValidationError = await validateReadablePdf(pdfPath);
  if (pdfValidationError) {
    return pdfValidationError;
  }

  const timestamp = new Date().toISOString();
  await writeFile(complaintPath, complaintDocumentContent(pdfPath, timestamp), {
    flag: "wx",
  });

  return {
    exitCode: 0,
    stdout: `Created complaint document: ${complaintPath}\nNext: run casegraph cases augment to report directly referenced items not yet in the graph.\n`,
  };
}

export async function runAddDocumentCommand(
  resource: string | undefined,
  documentArgs: readonly string[],
  cwd: string,
  runtime: WorkspaceRuntime,
): Promise<CommandResult> {
  if (resource !== "document") {
    return { exitCode: 1, stderr: casesAddDocumentHelp };
  }

  if (documentArgs.length === 2 && documentArgs[0] === "complaint") {
    const [, pdfPath] = documentArgs;
    const resolvedCaseId = await resolveOnlyCaseId(cwd, runtime);

    if (typeof resolvedCaseId !== "string") {
      return resolvedCaseId;
    }

    return addComplaintDocument(
      resolvedCaseId,
      "complaint",
      pdfPath,
      cwd,
      runtime,
    );
  }

  if (
    documentArgs[0] === "complaint" &&
    documentArgs[1] !== "complaint" &&
    documentArgs.length !== 2
  ) {
    return unexpectedAddDocumentArgument(documentArgs[2] ?? "");
  }

  if (documentArgs.length > 3) {
    return unexpectedAddDocumentArgument(documentArgs[3] ?? "");
  }

  const [caseId, documentType, pdfPath] = documentArgs;
  return addComplaintDocument(caseId, documentType, pdfPath, cwd, runtime);
}
