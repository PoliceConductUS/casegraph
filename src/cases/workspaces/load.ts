import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { CommandResult } from "../workspaces.js";
import {
  type CaseGraphRoot,
  type CaseHome,
  readCaseHome,
  writeCaseHome,
} from "./case-home-document.js";
import { readCaseLocator } from "./case-locator-document.js";
import type { WorkspaceRuntime } from "./create.js";

export type ResolvedCaseWorkspace = {
  caseId: string;
  locatorRoot: string;
  homeRoot: string;
  homeDirectory: string;
  graphRoot: CaseGraphRoot;
  packagePath: readonly string[];
  resolvedPackagePath: readonly string[];
};

function failed(message: string): CommandResult {
  return { exitCode: 1, stderr: `${message}\n` };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT" || nodeError.code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
}

function resolveStoredPackagePath(
  homeDirectory: string,
  storedPath: string,
): string {
  return path.isAbsolute(storedPath)
    ? path.resolve(storedPath)
    : path.resolve(homeDirectory, storedPath);
}

function storedReplacementPath(
  homeDirectory: string,
  replacement: string,
): string {
  const relativePath = path.relative(homeDirectory, replacement);
  return relativePath === "" ? replacement : relativePath;
}

async function readHome(homeRoot: string): Promise<CaseHome | CommandResult> {
  try {
    return await readCaseHome(homeRoot);
  } catch (error) {
    return failed(
      `Unable to read CaseHome root ${homeRoot}: ${errorMessage(error)}`,
    );
  }
}

async function validatePackagePaths(
  caseId: string,
  cwd: string,
  runtime: WorkspaceRuntime,
  homeRoot: string,
  homeDirectory: string,
  home: CaseHome,
): Promise<readonly string[] | CommandResult | "repaired"> {
  const resolvedPackagePath: string[] = [];

  for (const [index, storedPath] of home.spec.packagePath.entries()) {
    const resolvedPath = resolveStoredPackagePath(homeDirectory, storedPath);
    if (await isDirectory(resolvedPath)) {
      resolvedPackagePath.push(resolvedPath);
      continue;
    }

    const replacementAnswer = await runtime.requestPackagePathReplacement?.({
      caseId,
      homeRoot,
      missingStoredPath: storedPath,
    });
    if (replacementAnswer === undefined) {
      return failed(
        `Package path does not exist for case ${caseId}: ${storedPath} (${resolvedPath}). Correct ${homeRoot} manually.`,
      );
    }

    const replacement = path.resolve(cwd, replacementAnswer);
    if (!(await isDirectory(replacement))) {
      return failed(
        `Package path replacement is not a directory for case ${caseId}: ${replacement}`,
      );
    }

    const newStoredPath = storedReplacementPath(homeDirectory, replacement);
    const rewrittenPackagePath = home.spec.packagePath.map(
      (entry, entryIndex) => (entryIndex === index ? newStoredPath : entry),
    );
    const duplicate = rewrittenPackagePath.some(
      (entry, entryIndex) =>
        entryIndex !== index &&
        resolveStoredPackagePath(homeDirectory, entry) === replacement,
    );
    if (duplicate) {
      return failed(
        `Package path replacement duplicates package path for case ${caseId}: ${newStoredPath}`,
      );
    }

    const approved =
      (await runtime.approvePackagePathReplacement?.({
        oldStoredPath: storedPath,
        newStoredPath,
        homeRoot,
      })) === true;
    if (!approved) {
      return failed(
        `Declined package path replacement for case ${caseId}: ${storedPath} -> ${newStoredPath}`,
      );
    }

    try {
      await writeCaseHome(homeRoot, {
        type: "replacePackagePath",
        packagePath: rewrittenPackagePath,
      });
    } catch (error) {
      return failed(
        `Unable to repair package path for case ${caseId} at ${homeRoot}: ${errorMessage(error)}`,
      );
    }

    return "repaired";
  }

  return resolvedPackagePath;
}

export async function loadCaseWorkspace(
  caseId: string,
  cwd: string,
  runtime: WorkspaceRuntime,
  options: { requireWritableHome: boolean },
): Promise<ResolvedCaseWorkspace | CommandResult> {
  const casegraphHome =
    runtime.casegraphHome ?? path.join(homedir(), ".casegraph");
  const locatorDirectory = path.join(casegraphHome, caseId);
  const locatorRoot = path.join(locatorDirectory, "root.yaml");

  let locator;
  try {
    locator = await readCaseLocator(locatorRoot);
  } catch (error) {
    return failed(
      `Unable to read CaseLocator root ${locatorRoot}: ${errorMessage(error)}`,
    );
  }

  if (path.basename(locatorDirectory) !== locator.metadata.name) {
    return failed(
      `CaseLocator name does not match locator directory: ${locator.metadata.name} != ${path.basename(locatorDirectory)}`,
    );
  }

  if (locator.metadata.name !== caseId) {
    return failed(
      `CaseLocator name does not match requested case ID: ${locator.metadata.name} != ${caseId}`,
    );
  }

  const homeRoot = locator.spec.home;
  const homeDirectory = path.dirname(homeRoot);
  let home = await readHome(homeRoot);
  if ("exitCode" in home) {
    return home;
  }

  if (home.metadata.name !== caseId) {
    return failed(
      `CaseHome name does not match CaseLocator name: ${home.metadata.name} != ${caseId}`,
    );
  }

  if (options.requireWritableHome) {
    try {
      await access(homeDirectory, constants.W_OK);
    } catch (error) {
      return failed(
        `CaseHome directory is not writable: ${homeDirectory}: ${errorMessage(error)}`,
      );
    }
  }

  for (;;) {
    const packagePath = await validatePackagePaths(
      caseId,
      cwd,
      runtime,
      homeRoot,
      homeDirectory,
      home,
    );
    if (packagePath === "repaired") {
      home = await readHome(homeRoot);
      if ("exitCode" in home) {
        return home;
      }
      if (home.metadata.name !== caseId) {
        return failed(
          `CaseHome name does not match CaseLocator name: ${home.metadata.name} != ${caseId}`,
        );
      }
      continue;
    }
    if ("exitCode" in packagePath) {
      return packagePath;
    }

    return {
      caseId,
      locatorRoot,
      homeRoot,
      homeDirectory,
      graphRoot: home.spec.graphRoot,
      packagePath: home.spec.packagePath,
      resolvedPackagePath: packagePath,
    };
  }
}
