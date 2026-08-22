import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CASEGRAPH_API_VERSION, readCaseHome } from "./case-home-document.js";
import { readCaseLocator } from "./case-locator-document.js";
import { prepareCaseHome, registerCaseHome } from "./create.js";

async function makeWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "casegraph-create-"));
}

describe("case-home creation", () => {
  test("prepares a missing home only after both approved creation steps", async () => {
    const cwd = await makeWorkingDirectory();
    const homeDirectory = path.join(cwd, "case-home");
    const requests: string[] = [];

    try {
      const prepared = await prepareCaseHome(
        {
          caseId: "example-v-example-city",
          cwd,
          home: "case-home",
          yes: false,
          existingHome: "attach",
        },
        {
          casegraphHome: path.join(cwd, ".casegraph"),
          approveCreation: (request) => {
            requests.push(request.type);
            return Promise.resolve(true);
          },
        },
      );

      expect("exitCode" in prepared).toBe(false);
      if ("exitCode" in prepared) {
        return;
      }
      expect(requests).toEqual(["createHomeDirectory", "createCaseHomeRoot"]);
      expect(prepared.homeDirectory).toBe(homeDirectory);
      expect(prepared.homeRoot).toBe(path.join(homeDirectory, "root.yaml"));
      expect((await stat(homeDirectory)).isDirectory()).toBe(true);
      await expect(stat(prepared.homeRoot)).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("registers the locator only after validating the newly written CaseHome", async () => {
    const cwd = await makeWorkingDirectory();
    const homeDirectory = path.join(cwd, "case-home");
    const homeRoot = path.join(homeDirectory, "root.yaml");

    try {
      const prepared = await prepareCaseHome(
        {
          caseId: "example-v-example-city",
          cwd,
          home: homeDirectory,
          yes: true,
          existingHome: "attach",
        },
        { casegraphHome: path.join(cwd, ".casegraph") },
      );

      expect("exitCode" in prepared).toBe(false);
      if ("exitCode" in prepared) {
        return;
      }

      await registerCaseHome(prepared, {
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseHome",
        metadata: { name: "example-v-example-city" },
        spec: {
          graphRoot: { type: "node", kind: "case", id: "root" },
          packagePath: [],
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
      });

      await expect(readCaseHome(homeRoot)).resolves.toMatchObject({
        metadata: { name: "example-v-example-city" },
      });
      await expect(readCaseLocator(prepared.locatorRoot)).resolves.toEqual({
        apiVersion: CASEGRAPH_API_VERSION,
        kind: "CaseLocator",
        metadata: { name: "example-v-example-city" },
        spec: { home: homeRoot },
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("does not create a locator when final CaseHome validation rejects a mismatched name", async () => {
    const cwd = await makeWorkingDirectory();
    const homeDirectory = path.join(cwd, "case-home");

    try {
      const prepared = await prepareCaseHome(
        {
          caseId: "example-v-example-city",
          cwd,
          home: homeDirectory,
          yes: true,
          existingHome: "attach",
        },
        { casegraphHome: path.join(cwd, ".casegraph") },
      );

      expect("exitCode" in prepared).toBe(false);
      if ("exitCode" in prepared) {
        return;
      }

      await expect(
        registerCaseHome(prepared, {
          apiVersion: CASEGRAPH_API_VERSION,
          kind: "CaseHome",
          metadata: { name: "other-case" },
          spec: {
            graphRoot: { type: "node", kind: "case", id: "root" },
            packagePath: [],
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow("does not match");
      await expect(stat(prepared.locatorRoot)).rejects.toThrow();
      await expect(readFile(prepared.homeRoot, "utf8")).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
