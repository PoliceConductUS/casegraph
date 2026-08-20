import {
  createCaseWorkspace,
  type WorkspaceRuntime,
} from "../workspaces/create.js";
import type { CommandResult } from "../workspaces.js";

export const casesNewHelp = `Usage: casegraph cases new <case-id> --home <directory> [--yes]

Create a CaseHome package in an explicit external directory.

Use this when starting analysis for a case that needs its own graph and notes.
Case homes are separated by case ID and registered on this machine.
Case IDs must use letters, numbers, hyphens, and underscores.
CaseGraph asks before creating a missing home directory or root.yaml.
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
    ? `\nSuggested case ID: ${suggestion}\n\nRun:\n  casegraph cases new ${suggestion} --home <directory>\n`
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
    ? `\nSuggested case ID: ${suggestion}\n\nRun:\n  casegraph cases new ${suggestion} --home <directory>\n`
    : "\n";

  return {
    exitCode: 1,
    stderr: `Case ID must be provided as one argument.\n\nReceived: ${caseIdParts.join(" ")}${suggestionText}`,
  };
}

export async function runNewCaseCommand(
  input: {
    caseId: string;
    cwd: string;
    home: string | undefined;
    yes: boolean;
  },
  runtime?: WorkspaceRuntime,
): Promise<CommandResult> {
  const { caseId } = input;
  if (!caseId) {
    return {
      exitCode: 1,
      stderr: "Missing required case ID.\n\n" + casesNewHelp,
    };
  }

  if (!isValidCaseId(caseId)) {
    return invalidCaseIdResult(caseId);
  }

  return createCaseWorkspace(input, runtime);
}
