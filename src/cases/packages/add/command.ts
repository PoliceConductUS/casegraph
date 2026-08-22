import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { CommandResult } from "../../workspaces.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { writeCaseHome } from "../../workspaces/case-home-document.js";
import { loadCaseWorkspace } from "../../workspaces/load.js";

export const packagesAddHelp = `Usage: casegraph packages add <case-id> <path>...

Add external package roots to a case in one complete batch.

Every path must be an existing directory. Additions update
CaseHome.spec.packagePath in supplied order and remain read-only for managed
writes.
`;

function failed(message: string): CommandResult {
  return { exitCode: 1, stderr: `${message}\n` };
}

type CanonicalDirectory = {
  canonicalPath: string;
  resolvedPath: string;
};

async function canonicalDirectory(
  suppliedPath: string,
  cwd: string,
): Promise<CanonicalDirectory | CommandResult> {
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

  return { canonicalPath: await realpath(resolvedPath), resolvedPath };
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
    deferPackagePathRepair: true,
  });
  if ("exitCode" in workspace) {
    return workspace;
  }

  const existingDirectories: string[] = [];
  for (const packageDirectory of workspace.resolvedPackagePath) {
    existingDirectories.push(await realpath(packageDirectory));
  }
  const identities = new Set(existingDirectories);
  const additions: CanonicalDirectory[] = [];
  for (const suppliedPath of suppliedPaths) {
    const packageDirectory = await canonicalDirectory(suppliedPath, cwd);
    if ("exitCode" in packageDirectory) {
      return packageDirectory;
    }
    if (identities.has(packageDirectory.canonicalPath)) {
      return failed(
        `Package path duplicates package path: ${packageDirectory.canonicalPath}`,
      );
    }
    identities.add(packageDirectory.canonicalPath);
    additions.push(packageDirectory);
  }

  const storedAdditions: string[] = [];
  for (const packageDirectory of additions) {
    const storedPath = storedPackagePath(
      workspace.homeDirectory,
      packageDirectory.resolvedPath,
    );
    const storedIdentity = await realpath(
      path.resolve(workspace.homeDirectory, storedPath),
    );
    if (storedIdentity !== packageDirectory.canonicalPath) {
      return failed(
        `Package path does not resolve from CaseHome root: ${storedPath}`,
      );
    }
    storedAdditions.push(storedPath);
  }

  await writeCaseHome(workspace.homeRoot, {
    type: "replacePackagePath",
    packagePath: [...workspace.packagePath, ...storedAdditions],
  });

  return {
    exitCode: 0,
    stdout:
      `CaseHome root: ${workspace.homeRoot}\n` +
      "External package roots:\n" +
      [
        ...existingDirectories,
        ...additions.map(({ canonicalPath }) => canonicalPath),
      ]
        .map((directory) => `  ${directory}\n`)
        .join(""),
  };
}
