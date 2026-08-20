import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CASEGRAPH_API_VERSION,
  type CaseHome,
  readCaseHome,
  writeCaseHome,
} from "./case-home-document.js";
import { writeCaseLocator } from "./case-locator-document.js";
import type { WorkspaceRuntime } from "./create.js";
import { loadCaseWorkspace } from "./load.js";

const caseId = "example-v-example-city";

async function makeWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "casegraph-load-"));
}

function caseHome(packagePath: readonly string[] = []): CaseHome {
  return {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseHome",
    metadata: { name: caseId },
    spec: {
      graphRoot: { type: "node", kind: "case", id: "root" },
      packagePath: [...packagePath],
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
  };
}

async function createWorkspace(
  cwd: string,
  packagePath: readonly string[] = [],
): Promise<{ casegraphHome: string; homeDirectory: string; homeRoot: string }> {
  const casegraphHome = path.join(cwd, ".casegraph");
  const homeDirectory = path.join(cwd, "case-home");
  const homeRoot = path.join(homeDirectory, "root.yaml");
  await mkdir(path.join(casegraphHome, caseId), { recursive: true });
  await mkdir(homeDirectory, { recursive: true });
  await writeCaseHome(homeRoot, {
    type: "create",
    value: caseHome(packagePath),
  });
  await writeCaseLocator(path.join(casegraphHome, caseId, "root.yaml"), {
    apiVersion: CASEGRAPH_API_VERSION,
    kind: "CaseLocator",
    metadata: { name: caseId },
    spec: { home: homeRoot },
  });
  return { casegraphHome, homeDirectory, homeRoot };
}

function runtime(casegraphHome: string): WorkspaceRuntime {
  return { casegraphHome };
}

function resultMessage(
  result: Awaited<ReturnType<typeof loadCaseWorkspace>>,
): string {
  return "exitCode" in result ? (result.stderr ?? "") : "";
}

describe("loadCaseWorkspace", () => {
  test("loads a valid typed locator and CaseHome", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);

      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );

      expect("exitCode" in result).toBe(false);
      if ("exitCode" in result) return;
      expect(result).toMatchObject({
        caseId,
        homeDirectory: workspace.homeDirectory,
        homeRoot: workspace.homeRoot,
        packagePath: [],
        resolvedPackagePath: [],
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an absent locator", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(path.join(cwd, ".casegraph")),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseLocator");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an invalid locator", async () => {
    const cwd = await makeWorkingDirectory();
    const locatorRoot = path.join(cwd, ".casegraph", caseId, "root.yaml");

    try {
      await mkdir(path.dirname(locatorRoot), { recursive: true });
      await writeFile(locatorRoot, "not: [valid\n");
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(path.join(cwd, ".casegraph")),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseLocator");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a locator whose name does not match its directory", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await writeFile(
        path.join(workspace.casegraphHome, caseId, "root.yaml"),
        `apiVersion: ${CASEGRAPH_API_VERSION}\nkind: CaseLocator\nmetadata:\n  name: other-case\nspec:\n  home: ${workspace.homeRoot}\n`,
      );

      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain(
        "CaseLocator name does not match",
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an absent CaseHome root", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await rm(workspace.homeRoot);
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseHome");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an invalid CaseHome root", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await writeFile(workspace.homeRoot, "kind: CaseHome\n");
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseHome");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a CaseHome whose name does not match the locator", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await writeCaseHome(workspace.homeRoot, {
        type: "replacePackagePath",
        packagePath: [],
      });
      const content = await readFile(workspace.homeRoot, "utf8");
      await writeFile(
        workspace.homeRoot,
        content.replace(caseId, "other-case"),
      );
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseHome name does not match");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an unreadable CaseHome", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await chmod(workspace.homeRoot, 0o000);
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("CaseHome");
      await chmod(workspace.homeRoot, 0o644);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a non-writable CaseHome directory for a write operation", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd);
      await chmod(workspace.homeDirectory, 0o555);
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: true,
        },
      );
      expect(resultMessage(result)).toContain("not writable");
      await chmod(workspace.homeDirectory, 0o755);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("resolves relative and absolute package roots in declared order", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const relativeDirectory = path.join(cwd, "relative-root");
      const absoluteDirectory = path.join(cwd, "absolute-root");
      await mkdir(relativeDirectory);
      await mkdir(absoluteDirectory);
      const workspace = await createWorkspace(cwd, [
        "../relative-root",
        absoluteDirectory,
      ]);

      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );

      expect("exitCode" in result).toBe(false);
      if ("exitCode" in result) return;
      expect(result.resolvedPackagePath).toEqual([
        relativeDirectory,
        absoluteDirectory,
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a missing package root without repair prompts", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd, ["missing"]);
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        runtime(workspace.casegraphHome),
        {
          requireWritableHome: false,
        },
      );
      expect(resultMessage(result)).toContain("Package path does not exist");
      await expect(readCaseHome(workspace.homeRoot)).resolves.toEqual(
        caseHome(["missing"]),
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects an invalid package-root replacement without changing the CaseHome", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const workspace = await createWorkspace(cwd, ["missing"]);
      const before = await readFile(workspace.homeRoot, "utf8");
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        {
          ...runtime(workspace.casegraphHome),
          requestPackagePathReplacement: () => Promise.resolve("still-missing"),
        },
        { requireWritableHome: false },
      );
      expect(resultMessage(result)).toContain("replacement is not a directory");
      await expect(readFile(workspace.homeRoot, "utf8")).resolves.toBe(before);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("preserves the CaseHome when package-root replacement is declined", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const replacement = path.join(cwd, "replacement");
      await mkdir(replacement);
      const workspace = await createWorkspace(cwd, ["missing"]);
      const before = await readFile(workspace.homeRoot, "utf8");
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        {
          ...runtime(workspace.casegraphHome),
          requestPackagePathReplacement: () => Promise.resolve("replacement"),
          approvePackagePathReplacement: () => Promise.resolve(false),
        },
        { requireWritableHome: false },
      );
      expect(resultMessage(result)).toContain(
        "Declined package path replacement",
      );
      await expect(readFile(workspace.homeRoot, "utf8")).resolves.toBe(before);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("repairs a missing package root after confirmation", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const replacement = path.join(cwd, "replacement");
      await mkdir(replacement);
      const workspace = await createWorkspace(cwd, ["missing"]);
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        {
          ...runtime(workspace.casegraphHome),
          requestPackagePathReplacement: (request) => {
            expect(request).toEqual({
              caseId,
              homeRoot: workspace.homeRoot,
              missingStoredPath: "missing",
            });
            return Promise.resolve("replacement");
          },
          approvePackagePathReplacement: (request) => {
            expect(request).toEqual({
              oldStoredPath: "missing",
              newStoredPath: "../replacement",
              homeRoot: workspace.homeRoot,
            });
            return Promise.resolve(true);
          },
        },
        { requireWritableHome: false },
      );
      expect("exitCode" in result).toBe(false);
      if ("exitCode" in result) return;
      expect(result.packagePath).toEqual(["../replacement"]);
      expect(result.resolvedPackagePath).toEqual([replacement]);
      await expect(readCaseHome(workspace.homeRoot)).resolves.toEqual(
        caseHome(["../replacement"]),
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects a replacement that duplicates another package root atomically", async () => {
    const cwd = await makeWorkingDirectory();

    try {
      const duplicate = path.join(cwd, "duplicate");
      await mkdir(duplicate);
      const workspace = await createWorkspace(cwd, ["missing", "../duplicate"]);
      const before = await readFile(workspace.homeRoot, "utf8");
      const result = await loadCaseWorkspace(
        caseId,
        cwd,
        {
          ...runtime(workspace.casegraphHome),
          requestPackagePathReplacement: () => Promise.resolve("duplicate"),
          approvePackagePathReplacement: () => Promise.resolve(true),
        },
        { requireWritableHome: false },
      );
      expect(resultMessage(result)).toContain("duplicates package path");
      await expect(readFile(workspace.homeRoot, "utf8")).resolves.toBe(before);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
