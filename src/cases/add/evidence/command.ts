import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { createReadStream } from "node:fs";
import { access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveOnlyCaseId, validCaseIds } from "../../workspaces.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { loadCaseWorkspace } from "../../workspaces/load.js";
import { writeEvidenceHistory } from "./history.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export const casesAddEvidenceHelp = `Usage: casegraph cases add evidence <case-id> <path-to-file>
       casegraph cases add evidence <path-to-file>

Record an external evidence file as a metadata-only graph node.

The source file must exist, be readable, and be a regular file.
The file is not copied, parsed, hashed, summarized, classified, or linked.
The case ID may be omitted only when exactly one valid case exists.
`;

function unexpectedAddEvidenceArgument(argument: string): CommandResult {
  return {
    exitCode: 1,
    stderr: `Unexpected add evidence argument: ${argument}\n\n${casesAddEvidenceHelp}`,
  };
}

async function validateReadableFile(
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
        stderr: `Evidence file is not readable: ${filePath}\n`,
      };
    }

    throw error;
  }

  if (!sourceStat.isFile()) {
    return {
      exitCode: 1,
      stderr: `Evidence path is not a readable file: ${filePath}\n`,
    };
  }

  return undefined;
}

async function sha256Hex(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      hash.update(chunk);
      continue;
    }

    hash.update(Buffer.from(String(chunk)));
  }

  return hash.digest("hex");
}

function evidenceContent(
  evidenceId: string,
  evidencePath: string,
  mutationId: string,
  timestamp: string,
): string {
  return [
    "type: node",
    "kind: evidence",
    `id: ${JSON.stringify(evidenceId)}`,
    `path: ${JSON.stringify(evidencePath)}`,
    "hash:",
    '  algorithm: "sha256"',
    `  value: ${JSON.stringify(evidenceId)}`,
    `created_at: "${timestamp}"`,
    `updated_at: "${timestamp}"`,
    "sources:",
    `  - mutation: ${JSON.stringify(mutationId)}`,
    '    source_system: "local_file"',
    '    source_model: "evidence"',
    `    source_id: ${JSON.stringify(evidenceId)}`,
    "",
  ].join("\n");
}

async function addEvidence(
  caseId: string,
  evidencePath: string,
  cwd: string,
  runtime: WorkspaceRuntime,
): Promise<CommandResult> {
  const resolved = await loadCaseWorkspace(caseId, cwd, runtime, {
    requireWritableHome: true,
  });
  if ("exitCode" in resolved) {
    return resolved;
  }
  const workspacePath = resolved.homeDirectory;

  const validationError = await validateReadableFile(evidencePath);
  if (validationError) {
    return validationError;
  }

  const evidenceId = await sha256Hex(evidencePath);
  const evidenceFilePath = path.join(workspacePath, `${evidenceId}.yaml`);
  const timestamp = new Date().toISOString();
  const mutationId = `m_${evidenceId}`;

  try {
    await writeFile(
      evidenceFilePath,
      evidenceContent(evidenceId, evidencePath, mutationId, timestamp),
      { flag: "wx" },
    );
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "EEXIST") {
      return {
        exitCode: 1,
        stderr: `Evidence already exists: ${evidenceFilePath}\n`,
      };
    }

    throw error;
  }

  await writeEvidenceHistory({
    caseId,
    completedAt: timestamp,
    evidenceId,
    evidencePath,
    mutationId,
    startedAt: timestamp,
    workspacePath,
  });

  return {
    exitCode: 0,
    stdout: `Created evidence node: ${evidenceFilePath}\nEvidence node ID: ${evidenceId}\nNext: run casegraph cases report ${caseId} to inspect remaining gaps.\n`,
  };
}

export async function runAddEvidenceCommand(
  evidenceArgs: readonly string[],
  cwd: string,
  runtime: WorkspaceRuntime,
): Promise<CommandResult> {
  if (evidenceArgs.length === 1) {
    const [evidencePath] = evidenceArgs;
    const caseIds = await validCaseIds(cwd, runtime);

    if (caseIds.includes(evidencePath)) {
      return { exitCode: 1, stderr: casesAddEvidenceHelp };
    }

    const resolvedCaseId = await resolveOnlyCaseId(cwd, runtime);

    if (typeof resolvedCaseId !== "string") {
      return resolvedCaseId;
    }

    return addEvidence(resolvedCaseId, evidencePath, cwd, runtime);
  }

  if (evidenceArgs.length === 2) {
    const [caseId, evidencePath] = evidenceArgs;
    return addEvidence(caseId, evidencePath, cwd, runtime);
  }

  if (evidenceArgs.length > 2) {
    return unexpectedAddEvidenceArgument(evidenceArgs[2] ?? "");
  }

  return { exitCode: 1, stderr: casesAddEvidenceHelp };
}
