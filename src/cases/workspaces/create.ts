import { constants } from "node:fs";
import { access, mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { CommandResult } from "../workspaces.js";
import {
  CASEGRAPH_API_VERSION,
  type CaseHome,
  readCaseHome,
  writeCaseHome,
} from "./case-home-document.js";
import { readCaseLocator, writeCaseLocator } from "./case-locator-document.js";

export type CreationRequest =
  | { type: "createHomeDirectory"; path: string }
  | { type: "createCaseHomeRoot"; path: string };

export type WorkspaceRuntime = {
  casegraphHome?: string;
  approveCreation?: (request: CreationRequest) => Promise<boolean>;
  requestPackagePathReplacement?: (request: {
    caseId: string;
    homeRoot: string;
    missingStoredPath: string;
  }) => Promise<string | undefined>;
  approvePackagePathReplacement?: (request: {
    oldStoredPath: string;
    newStoredPath: string;
    homeRoot: string;
  }) => Promise<boolean>;
};

export type PreparedCaseHome = {
  caseId: string;
  homeDirectory: string;
  homeRoot: string;
  locatorRoot: string;
  existingHome?: CaseHome;
};

type CaseHomePreparationInput = {
  caseId: string;
  cwd: string;
  home: string;
  yes: boolean;
  existingHome: "attach" | "reject";
};

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

async function directoryHasCaseInsensitiveEntry(
  directory: string,
  entryName: string,
): Promise<boolean> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isDirectory() &&
        entry.name.toLowerCase() === entryName.toLowerCase(),
    );
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function approved(
  request: CreationRequest,
  yes: boolean,
  runtime: WorkspaceRuntime | undefined,
): Promise<boolean> {
  return yes || (await runtime?.approveCreation?.(request)) === true;
}

function failed(message: string): CommandResult {
  return { exitCode: 1, stderr: `${message}\n` };
}

function caseHomeFor(caseId: string, timestamp: string): CaseHome {
  return {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseHome",
    metadata: { name: caseId },
    spec: {
      graphRoot: { type: "node", kind: "case", id: "root" },
      packagePath: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export async function prepareCaseHome(
  input: CaseHomePreparationInput,
  runtime?: WorkspaceRuntime,
): Promise<PreparedCaseHome | CommandResult> {
  const homeDirectory = path.resolve(input.cwd, input.home);
  const homeRoot = path.join(homeDirectory, "root.yaml");
  const casegraphHome =
    runtime?.casegraphHome ?? path.join(homedir(), ".casegraph");
  const locatorRoot = path.join(casegraphHome, input.caseId, "root.yaml");

  if (await directoryHasCaseInsensitiveEntry(casegraphHome, input.caseId)) {
    return failed(
      `Case locator already exists: ${path.join(casegraphHome, input.caseId)}`,
    );
  }

  const homeExists = await pathExists(homeDirectory);
  let existingHome: CaseHome | undefined;

  if (homeExists) {
    if (!(await stat(homeDirectory)).isDirectory()) {
      return failed(`Case home is not a directory: ${homeDirectory}`);
    }

    if (await pathExists(homeRoot)) {
      existingHome = await readCaseHome(homeRoot);
      if (existingHome.metadata.name !== input.caseId) {
        return failed(
          `CaseHome name does not match case ID: ${existingHome.metadata.name} != ${input.caseId}`,
        );
      }
      if (input.existingHome === "reject") {
        return failed(`Case home already exists: ${homeRoot}`);
      }
    } else if ((await readdir(homeDirectory)).length > 0) {
      return failed(
        `Case home is nonempty and has no root.yaml: ${homeDirectory}`,
      );
    }
  }

  if (!homeExists) {
    if (
      !(await approved(
        { type: "createHomeDirectory", path: homeDirectory },
        input.yes,
        runtime,
      ))
    ) {
      return failed(
        `Declined creation of case home directory: ${homeDirectory}`,
      );
    }
    await mkdir(homeDirectory, { recursive: true });
  }

  if (!existingHome) {
    if (
      !(await approved(
        { type: "createCaseHomeRoot", path: homeRoot },
        input.yes,
        runtime,
      ))
    ) {
      return failed(`Declined creation of CaseHome root: ${homeRoot}`);
    }
  }

  return {
    caseId: input.caseId,
    homeDirectory,
    homeRoot,
    locatorRoot,
    existingHome,
  };
}

export async function registerCaseHome(
  prepared: PreparedCaseHome,
  newHome?: CaseHome,
): Promise<void> {
  if (prepared.existingHome && newHome) {
    throw new Error(`CaseHome already exists: ${prepared.homeRoot}`);
  }

  if (!prepared.existingHome && !newHome) {
    throw new Error(`Missing CaseHome for registration: ${prepared.homeRoot}`);
  }

  if (newHome && newHome.metadata.name !== prepared.caseId) {
    throw new Error(
      `CaseHome name does not match case ID: ${newHome.metadata.name} != ${prepared.caseId}`,
    );
  }

  if (newHome) {
    await writeCaseHome(prepared.homeRoot, { type: "create", value: newHome });
  }

  const caseHome = await readCaseHome(prepared.homeRoot);
  if (caseHome.metadata.name !== prepared.caseId) {
    throw new Error(
      `CaseHome name does not match case ID: ${caseHome.metadata.name} != ${prepared.caseId}`,
    );
  }

  await mkdir(path.dirname(prepared.locatorRoot), { recursive: true });
  await writeCaseLocator(prepared.locatorRoot, {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseLocator",
    metadata: { name: prepared.caseId },
    spec: { home: prepared.homeRoot },
  });
  await readCaseLocator(prepared.locatorRoot);
}

export async function createCaseWorkspace(
  input: {
    caseId: string;
    cwd: string;
    home: string | undefined;
    yes: boolean;
  },
  runtime?: WorkspaceRuntime,
): Promise<CommandResult> {
  if (!input.home) {
    return failed("--home <directory> is required");
  }

  const prepared = await prepareCaseHome(
    { ...input, home: input.home, existingHome: "attach" },
    runtime,
  );
  if ("exitCode" in prepared) {
    return prepared;
  }

  await registerCaseHome(
    prepared,
    prepared.existingHome
      ? undefined
      : caseHomeFor(input.caseId, new Date().toISOString()),
  );

  return {
    exitCode: 0,
    stdout:
      `Case home: ${prepared.homeDirectory}\n` +
      `CaseHome root: ${prepared.homeRoot}\n` +
      `Case locator: ${prepared.locatorRoot}\n` +
      "External package roots: none\n" +
      "Next: add the complaint document with:\n" +
      `  casegraph cases add document ${input.caseId} complaint <path-to-pdf>\n`,
  };
}
