import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { CommandResult } from "../../workspaces.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { writeCaseHome } from "../../workspaces/case-home-document.js";
import { loadCaseWorkspace } from "../../workspaces/load.js";

export const packagesAddHelp = `Usage: casegraph packages add <case-id> <path>...

Add external package roots to a case in one complete batch.

Every path must be an existing directory. Package roots are recorded in supplied
order and remain read-only for managed writes.
`;

function failed(message: string): CommandResult {
  return { exitCode: 1, stderr: `${message}\n` };
}

async function canonicalDirectory(
  suppliedPath: string,
  cwd: string,
): Promise<string | CommandResult> {
  const resolvedPath = path.resolve(cwd, suppliedPath);

  try {
    if (!(await stat(resolvedPath)).isDirectory()) {
      return failed(`Package path is not a directory: ${resolvedPath}`);
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT" || nodeError.code === "ENOTDIR") {
      return failed(`Package path is not a directory: ${resolvedPath}`);
    }
    throw error;
  }

  return realpath(resolvedPath);
}

function storedPackagePath(
  homeDirectory: string,
  packageDirectory: string,
): string {
  const relativePath = path.relative(homeDirectory, packageDirectory);
  return path.isAbsolute(relativePath) ? packageDirectory : relativePath || ".";
}

export async function runPackagesAddCommand(
  args: readonly string[],
  cwd: string,
  runtime: WorkspaceRuntime,
): Promise<CommandResult> {
  if (args.length < 2 || args.some((argument) => argument.startsWith("-"))) {
    return { exitCode: 1, stderr: packagesAddHelp };
  }

  const [caseId, ...suppliedPaths] = args;
  const workspace = await loadCaseWorkspace(caseId, cwd, runtime, {
    requireWritableHome: true,
  });
  if ("exitCode" in workspace) {
    return workspace;
  }

  const existingDirectories: string[] = [];
  for (const packageDirectory of workspace.resolvedPackagePath) {
    existingDirectories.push(await realpath(packageDirectory));
  }
  const canonicalHomeDirectory = await realpath(workspace.homeDirectory);

  const identities = new Set(existingDirectories);
  const additions: string[] = [];
  for (const suppliedPath of suppliedPaths) {
    const packageDirectory = await canonicalDirectory(suppliedPath, cwd);
    if (typeof packageDirectory !== "string") {
      return packageDirectory;
    }
    if (identities.has(packageDirectory)) {
      return failed(
        `Package path duplicates package path: ${packageDirectory}`,
      );
    }
    identities.add(packageDirectory);
    additions.push(packageDirectory);
  }

  await writeCaseHome(workspace.homeRoot, {
    type: "replacePackagePath",
    packagePath: [
      ...workspace.packagePath,
      ...additions.map((directory) =>
        storedPackagePath(canonicalHomeDirectory, directory),
      ),
    ],
  });

  return {
    exitCode: 0,
    stdout:
      `CaseHome root: ${workspace.homeRoot}\n` +
      "External package roots:\n" +
      [...existingDirectories, ...additions]
        .map((directory) => `  ${directory}\n`)
        .join(""),
  };
}
