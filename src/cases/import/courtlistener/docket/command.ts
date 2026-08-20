import { constants } from "node:fs";
import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { init as initCuid2 } from "@paralleldrive/cuid2";
import { fetchCourtListenerDocket } from "./api.js";
import { deriveCaseIdFromDocket } from "./case-id.js";
import { writeImportedGraphRecords } from "./graph-records.js";
import { writeHistory } from "./history.js";
import { loadMappings } from "./mapping.js";
import type { CommandResult, CourtListenerImportRuntime } from "./types.js";

export const casesImportCourtListenerHelp = `Usage: casegraph cases import courtlistener <docket-id> [--dry-run | --write]

Bootstrap a new case workspace from CourtListener REST docket data.

The command uses COURTLISTENER_API_TOKEN from the environment.
Dry-run is the default. Use --write to create the workspace.
CourtListener API tokens are never printed or persisted.
`;

const createDefaultMutationId = initCuid2({ length: 10 });

function workspaceDisplayPath(caseId: string): string {
  return path.posix.join("workspace", caseId);
}

function commandShapeError(unexpectedArgument?: string): CommandResult {
  return {
    exitCode: 1,
    stderr: unexpectedArgument
      ? `Unexpected import argument: ${unexpectedArgument}\n\n${casesImportCourtListenerHelp}`
      : casesImportCourtListenerHelp,
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

async function caseInsensitiveWorkspaceExists(
  workspaceRoot: string,
  caseId: string,
): Promise<boolean> {
  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toLowerCase() === caseId.toLowerCase(),
    );
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function importCourtListenerDocket(
  docketId: string | undefined,
  flags: readonly string[],
  cwd: string,
  runtime: CourtListenerImportRuntime,
  argv: readonly string[],
): Promise<CommandResult> {
  const unexpectedArgument = flags.find((flag) => !flag.startsWith("--"));

  if (!docketId || unexpectedArgument) {
    return commandShapeError(unexpectedArgument);
  }

  const dryRun = flags.includes("--dry-run");
  const write = flags.includes("--write");
  const unknownFlag = flags.find(
    (flag) => flag !== "--dry-run" && flag !== "--write",
  );

  if (unknownFlag) {
    return commandShapeError();
  }

  if (dryRun && write) {
    return {
      exitCode: 1,
      stderr: "`--dry-run` and `--write` cannot be used together.\n",
    };
  }

  const token = runtime.env?.COURTLISTENER_API_TOKEN;
  if (!token) {
    return {
      exitCode: 1,
      stderr: "COURTLISTENER_API_TOKEN is required for CourtListener import.\n",
    };
  }

  const fetchFunction = runtime.fetch ?? fetch;
  const { responses, error } = await fetchCourtListenerDocket(
    docketId,
    token,
    fetchFunction,
  );

  if (error) {
    return error;
  }

  if (!responses) {
    return {
      exitCode: 1,
      stderr: "CourtListener import failed without a response.\n",
    };
  }

  const caseId = deriveCaseIdFromDocket(responses.docket);
  if (!caseId) {
    return {
      exitCode: 1,
      stderr:
        "No safe case ID could be derived from CourtListener docket data.\n",
    };
  }

  const workspaceRoot = path.join(cwd, "workspace");
  const workspacePath = path.join(workspaceRoot, caseId);
  const displayPath = workspaceDisplayPath(caseId);

  if (
    write &&
    ((await pathExists(workspacePath)) ||
      (await caseInsensitiveWorkspaceExists(workspaceRoot, caseId)))
  ) {
    return {
      exitCode: 1,
      stderr: `Case workspace already exists: ${displayPath}\n`,
    };
  }

  const output = [
    `CourtListener docket: ${docketId}`,
    `Derived case ID: ${caseId}`,
    `Docket entries: ${String(responses.docketEntries.length)}`,
    `Parties: ${String(responses.parties.length)}`,
    `Attorneys: ${String(responses.attorneys.length)}`,
    `RECAP documents: ${String(responses.recapDocuments.length)}`,
  ];

  if (responses.citationLookupIncomplete) {
    output.push("Citation lookup incomplete for one or more RECAP documents.");
  }

  if (!write) {
    output.push("Dry run only. No case workspace created.");
    return { exitCode: 0, stdout: `${output.join("\n")}\n` };
  }

  await mkdir(workspacePath, { recursive: true });
  const timestamp = (runtime.now?.() ?? new Date()).toISOString();
  const mutationId = `m_${runtime.createMutationId?.() ?? createDefaultMutationId()}`;
  const allRequests = [
    responses.docketRequest,
    ...responses.docketEntryRequests,
    ...responses.partyRequests,
    ...responses.attorneyRequests,
    ...responses.recapDocumentRequests,
    ...responses.citationLookupRequests,
  ];

  await writeHistory(
    workspacePath,
    mutationId,
    ["casegraph", ...argv],
    responses.citationLookupIncomplete ? "incomplete" : "success",
    timestamp,
    timestamp,
    allRequests,
  );
  await writeImportedGraphRecords(
    workspacePath,
    timestamp,
    mutationId,
    responses,
    runtime.createGraphRecordId ?? createDefaultMutationId,
    await loadMappings(),
  );

  output.push(`Created case workspace: ${displayPath}`);
  output.push(
    `Created mutation history: ${path.posix.join(displayPath, ".history", mutationId)}`,
  );

  return { exitCode: 0, stdout: `${output.join("\n")}\n` };
}
