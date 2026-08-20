import { constants } from "node:fs";
import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export const casesNewHelp = `Usage: casegraph cases new <case-id>

Create a repo-local case workspace at workspace/<case-id>.

Use this when starting analysis for a case that needs its own graph and notes.
Case workspaces are separated by case ID.
Case IDs must use letters, numbers, hyphens, and underscores.
Case workspaces may be checked into this repository.
`;

const validCaseIdPattern = /^[A-Za-z0-9_-]+$/;
const windowsReservedDeviceNames = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

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

function workspaceDisplayPath(caseId: string): string {
  return path.posix.join("workspace", caseId);
}

function rootNodeContent(timestamp: string): string {
  return [
    "type: node",
    "kind: case",
    "id: root",
    `created_at: "${timestamp}"`,
    `updated_at: "${timestamp}"`,
    "",
  ].join("\n");
}

function suggestCaseId(caseId: string): string | undefined {
  const suggestion = caseId
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (suggestion.length === 0) {
    return undefined;
  }

  if (windowsReservedDeviceNames.has(suggestion.toUpperCase())) {
    return `${suggestion}-case`;
  }

  return suggestion;
}

function isValidCaseId(caseId: string): boolean {
  return (
    validCaseIdPattern.test(caseId) &&
    caseId !== "." &&
    caseId !== ".." &&
    !windowsReservedDeviceNames.has(caseId.toUpperCase())
  );
}

function invalidCaseIdResult(caseId: string): CommandResult {
  const suggestion = suggestCaseId(caseId);
  const suggestionText = suggestion
    ? `\nSuggested case ID: ${suggestion}\n\nRun:\n  casegraph cases new ${suggestion}\n`
    : "\n";

  return {
    exitCode: 1,
    stderr: `Invalid case ID: ${caseId}\n\nThis case ID is not a safe folder name. Case IDs must use only letters, numbers, hyphens, and underscores, and must avoid reserved filesystem names.${suggestionText}`,
  };
}

export function extraCaseIdArgumentsResult(
  caseIdParts: readonly string[],
): CommandResult {
  const suggestion = suggestCaseId(caseIdParts.join(" "));
  const suggestionText = suggestion
    ? `\nSuggested case ID: ${suggestion}\n\nRun:\n  casegraph cases new ${suggestion}\n`
    : "\n";

  return {
    exitCode: 1,
    stderr: `Case ID must be provided as one argument.\n\nReceived: ${caseIdParts.join(" ")}${suggestionText}`,
  };
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

export async function createCaseWorkspace(
  caseId: string,
  cwd: string,
): Promise<CommandResult> {
  if (!caseId) {
    return {
      exitCode: 1,
      stderr: "Missing required case ID.\n\n" + casesNewHelp,
    };
  }

  if (!isValidCaseId(caseId)) {
    return invalidCaseIdResult(caseId);
  }

  const displayPath = workspaceDisplayPath(caseId);
  const workspaceRoot = path.join(cwd, "workspace");
  const workspacePath = path.join(cwd, "workspace", caseId);
  const rootNodePath = path.join(workspacePath, "root.yaml");
  const rootNodeDisplayPath = path.posix.join(displayPath, "root.yaml");

  if (
    (await pathExists(workspacePath)) ||
    (await caseInsensitiveWorkspaceExists(workspaceRoot, caseId))
  ) {
    return {
      exitCode: 1,
      stderr: `Case workspace already exists: ${displayPath}\n`,
    };
  }

  await mkdir(workspacePath, { recursive: true });
  const timestamp = new Date().toISOString();
  await writeFile(rootNodePath, rootNodeContent(timestamp), { flag: "wx" });

  return {
    exitCode: 0,
    stdout: `Created case workspace: ${displayPath}\nCreated root node: ${rootNodeDisplayPath}\nNext: add the complaint document with:\n  casegraph cases add document ${caseId} complaint <path-to-pdf>\n`,
  };
}
