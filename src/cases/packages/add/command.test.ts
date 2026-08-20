import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CASEGRAPH_API_VERSION,
  readCaseHome,
  writeCaseHome,
} from "../../workspaces/case-home-document.js";
import { writeCaseLocator } from "../../workspaces/case-locator-document.js";
import type { WorkspaceRuntime } from "../../workspaces/create.js";
import { packagesAddHelp, runPackagesAddCommand } from "./command.js";

const caseId = "example-v-example-city";

type Workspace = {
  cwd: string;
  homeDirectory: string;
  homeRoot: string;
  runtime: WorkspaceRuntime;
};

async function createWorkspace(
  packagePath: readonly string[] = [],
): Promise<Workspace> {
  const cwd = await mkdtemp(path.join(tmpdir(), "casegraph-packages-add-"));
  const homeDirectory = path.join(cwd, "case-home");
  const homeRoot = path.join(homeDirectory, "root.yaml");
  const casegraphHome = path.join(cwd, ".casegraph");

  await mkdir(path.join(casegraphHome, caseId), { recursive: true });
  await mkdir(homeDirectory, { recursive: true });
  await writeCaseHome(homeRoot, {
    type: "create",
    value: {
      apiVersion: CASEGRAPH_API_VERSION,
      kind: "CaseHome",
      metadata: { name: caseId },
      spec: {
        graphRoot: { type: "node", kind: "case", id: "root" },
        packagePath: [...packagePath],
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    },
  });
  await writeCaseLocator(path.join(casegraphHome, caseId, "root.yaml"), {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseLocator",
    metadata: { name: caseId },
    spec: { home: homeRoot },
  });

  return { cwd, homeDirectory, homeRoot, runtime: { casegraphHome } };
}

describe("packages add", () => {
  test("returns help without mutation for missing case ID, missing path, or flags", async () => {
    const workspace = await createWorkspace();

    try {
      for (const args of [[], [caseId], [caseId, "--unexpected"]]) {
        await expect(
          runPackagesAddCommand(args, workspace.cwd, workspace.runtime),
        ).resolves.toEqual({ exitCode: 1, stderr: packagesAddHelp });
        await expect(readCaseHome(workspace.homeRoot)).resolves.toMatchObject({
          spec: { packagePath: [] },
        });
      }
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("appends one canonical directory as a home-relative path and reports all roots", async () => {
    const workspace = await createWorkspace();
    const packageDirectory = path.join(workspace.cwd, "packages", "one");

    try {
      await mkdir(packageDirectory, { recursive: true });
      const canonicalPackageDirectory = await realpath(packageDirectory);

      const result = await runPackagesAddCommand(
        [caseId, path.join(packageDirectory, ".")],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result).toEqual({
        exitCode: 0,
        stdout:
          `CaseHome root: ${workspace.homeRoot}\n` +
          `External package roots:\n  ${canonicalPackageDirectory}\n`,
      });
      await expect(readCaseHome(workspace.homeRoot)).resolves.toMatchObject({
        spec: {
          packagePath: [
            path.relative(workspace.homeDirectory, packageDirectory),
          ],
        },
      });
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("appends multiple directories in supplied order after existing roots", async () => {
    const workspace = await createWorkspace();
    const existingDirectory = path.join(workspace.cwd, "packages", "existing");
    const firstDirectory = path.join(workspace.cwd, "packages", "first");
    const secondDirectory = path.join(workspace.cwd, "packages", "second");

    try {
      await mkdir(existingDirectory, { recursive: true });
      await mkdir(firstDirectory, { recursive: true });
      await mkdir(secondDirectory, { recursive: true });
      const canonicalExistingDirectory = await realpath(existingDirectory);
      const canonicalFirstDirectory = await realpath(firstDirectory);
      const canonicalSecondDirectory = await realpath(secondDirectory);
      await writeCaseHome(workspace.homeRoot, {
        type: "replacePackagePath",
        packagePath: [
          path.relative(workspace.homeDirectory, existingDirectory),
        ],
      });

      const result = await runPackagesAddCommand(
        [caseId, secondDirectory, firstDirectory],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(
        `CaseHome root: ${workspace.homeRoot}\n` +
          "External package roots:\n" +
          `  ${canonicalExistingDirectory}\n` +
          `  ${canonicalSecondDirectory}\n` +
          `  ${canonicalFirstDirectory}\n`,
      );
      await expect(readCaseHome(workspace.homeRoot)).resolves.toMatchObject({
        spec: {
          packagePath: [
            path.relative(workspace.homeDirectory, existingDirectory),
            path.relative(workspace.homeDirectory, secondDirectory),
            path.relative(workspace.homeDirectory, firstDirectory),
          ],
        },
      });
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("rejects a missing directory without changing existing roots", async () => {
    const workspace = await createWorkspace();

    try {
      const result = await runPackagesAddCommand(
        [caseId, "missing-directory"],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Package path is not a directory");
      await expect(readCaseHome(workspace.homeRoot)).resolves.toMatchObject({
        spec: { packagePath: [] },
      });
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("rejects a non-directory without changing existing roots", async () => {
    const workspace = await createWorkspace();
    const filePath = path.join(workspace.cwd, "not-a-directory");

    try {
      await writeFile(filePath, "file");

      const result = await runPackagesAddCommand(
        [caseId, filePath],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Package path is not a directory");
      await expect(readCaseHome(workspace.homeRoot)).resolves.toMatchObject({
        spec: { packagePath: [] },
      });
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("rejects a canonical duplicate of an existing root without changing it", async () => {
    const workspace = await createWorkspace();
    const packageDirectory = path.join(workspace.cwd, "packages", "existing");

    try {
      await mkdir(packageDirectory, { recursive: true });
      await writeCaseHome(workspace.homeRoot, {
        type: "replacePackagePath",
        packagePath: [path.relative(workspace.homeDirectory, packageDirectory)],
      });
      const before = await readFile(workspace.homeRoot, "utf8");

      const result = await runPackagesAddCommand(
        [caseId, path.join(packageDirectory, ".")],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("duplicates package path");
      await expect(readFile(workspace.homeRoot, "utf8")).resolves.toBe(before);
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });

  test("rejects a duplicate within the batch without partially writing it", async () => {
    const workspace = await createWorkspace();
    const packageDirectory = path.join(workspace.cwd, "packages", "one");
    const secondDirectory = path.join(workspace.cwd, "packages", "two");

    try {
      await mkdir(packageDirectory, { recursive: true });
      await mkdir(secondDirectory, { recursive: true });
      const before = await readFile(workspace.homeRoot, "utf8");

      const result = await runPackagesAddCommand(
        [
          caseId,
          packageDirectory,
          secondDirectory,
          path.join(packageDirectory, "."),
        ],
        workspace.cwd,
        workspace.runtime,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("duplicates package path");
      await expect(readFile(workspace.homeRoot, "utf8")).resolves.toBe(before);
    } finally {
      await rm(workspace.cwd, { recursive: true, force: true });
    }
  });
});
