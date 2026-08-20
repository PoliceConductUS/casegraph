import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export function workspaceDisplayPath(caseId: string): string {
  return path.posix.join("workspace", caseId);
}

export function isRootCaseNode(content: string): boolean {
  return (
    /^type: "?node"?$/m.test(content) &&
    /^kind: "?case"?$/m.test(content) &&
    /^id: "?root"?$/m.test(content)
  );
}

export async function pathIsDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function validCaseIds(cwd: string): Promise<string[]> {
  const workspaceRoot = path.join(cwd, "workspace");
  let entries;

  try {
    entries = await readdir(workspaceRoot, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const caseIds: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const rootNode = await readFile(
        path.join(workspaceRoot, entry.name, "root.yaml"),
        "utf8",
      );

      if (isRootCaseNode(rootNode)) {
        caseIds.push(entry.name);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return caseIds.sort((a, b) => a.localeCompare(b));
}

export async function resolveOnlyCaseId(
  cwd: string,
): Promise<string | CommandResult> {
  const caseIds = await validCaseIds(cwd);

  if (caseIds.length === 0) {
    return {
      exitCode: 1,
      stderr:
        "No case exists.\n\nCreate one with:\n  casegraph cases new <case-id>\n",
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
        "No case exists.\n\nCreate one with:\n  casegraph cases new <case-id>\n",
    }
  );
}
