import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadCaseWorkspace } from "./workspaces/load.js";
import type { WorkspaceRuntime } from "./workspaces/create.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export async function validCaseIds(
  cwd: string,
  runtime: WorkspaceRuntime = {},
): Promise<string[]> {
  const casegraphHome =
    runtime.casegraphHome ?? path.join(homedir(), ".casegraph");
  let entries;

  try {
    entries = await readdir(casegraphHome, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const caseIds: string[] = [];
  const locatorDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const caseId of locatorDirectories) {
    const loaded = await loadCaseWorkspace(
      caseId,
      cwd,
      { casegraphHome },
      { requireWritableHome: false },
    );
    if (!("exitCode" in loaded)) {
      caseIds.push(caseId);
    }
  }

  return caseIds;
}

export async function resolveOnlyCaseId(
  cwd: string,
  runtime?: WorkspaceRuntime,
): Promise<string | CommandResult> {
  const caseIds = await validCaseIds(cwd, runtime);

  if (caseIds.length === 0) {
    return {
      exitCode: 1,
      stderr:
        "No case exists.\n\nCreate one with:\n  casegraph cases new <case-id> --home <directory>\n",
    };
  }

  if (caseIds.length > 1) {
    return {
      exitCode: 1,
      stderr: `Multiple cases exist. Please provide <case-id> explicitly.\n\nAvailable cases:\n${caseIds.map((caseId) => `  ${caseId}`).join("\n")}\n`,
    };
  }

  return (
    caseIds[0] ?? {
      exitCode: 1,
      stderr:
        "No case exists.\n\nCreate one with:\n  casegraph cases new <case-id> --home <directory>\n",
    }
  );
}
