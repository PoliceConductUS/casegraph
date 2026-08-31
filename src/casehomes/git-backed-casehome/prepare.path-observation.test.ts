import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";

type BoundaryMode =
  | "none"
  | "partial-mkdir"
  | "partial-mkdir-recovery-failure"
  | "recheck-failure";

const boundary = vi.hoisted(
  (): {
    caseFolder: string;
    caseHome: string;
    caseHomeLstatCalls: number;
    mkdirFailed: boolean;
    mode: BoundaryMode;
    observeAfterSwap: boolean;
    observed: Record<"lstat" | "readFile" | "realpath" | "readdir", string[]>;
  } => ({
    caseFolder: "",
    caseHome: "",
    caseHomeLstatCalls: 0,
    mkdirFailed: false,
    mode: "none",
    observeAfterSwap: false,
    observed: {
      lstat: [] as string[],
      readFile: [] as string[],
      realpath: [] as string[],
      readdir: [] as string[],
    },
  }),
);

const actualFs =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    lstat: new Proxy(actual.lstat, {
      apply(target, thisArgument, argumentsList): unknown {
        const observedPath = String(argumentsList[0]);
        if (observedPath === boundary.caseHome) {
          boundary.caseHomeLstatCalls += 1;
          if (
            boundary.mode === "recheck-failure" &&
            boundary.caseHomeLstatCalls === 2
          ) {
            return Promise.reject(
              Object.assign(new Error("exact child recheck failed"), {
                code: "EIO",
              }),
            );
          }
        }
        if (boundary.observeAfterSwap) {
          boundary.observed.lstat.push(observedPath);
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    mkdir: new Proxy(actual.mkdir, {
      apply(target, thisArgument, argumentsList): unknown {
        const directory = String(argumentsList[0]);
        if (
          directory === boundary.caseHome &&
          (boundary.mode === "partial-mkdir" ||
            boundary.mode === "partial-mkdir-recovery-failure")
        ) {
          return actual
            .mkdir(path.dirname(directory), { recursive: true })
            .then(() => {
              boundary.mkdirFailed = true;
              return Promise.reject(
                Object.assign(new Error("child mkdir failed after parent"), {
                  code: "EACCES",
                }),
              );
            });
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    readFile: new Proxy(actual.readFile, {
      apply(target, thisArgument, argumentsList): unknown {
        if (boundary.observeAfterSwap) {
          boundary.observed.readFile.push(String(argumentsList[0]));
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    realpath: new Proxy(actual.realpath, {
      apply(target, thisArgument, argumentsList): unknown {
        const observedPath = String(argumentsList[0]);
        if (
          boundary.mode === "partial-mkdir-recovery-failure" &&
          boundary.mkdirFailed &&
          observedPath === boundary.caseFolder
        ) {
          return Promise.reject(new Error("recovery inspection failed"));
        }
        if (boundary.observeAfterSwap) {
          boundary.observed.realpath.push(observedPath);
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    readdir: new Proxy(actual.readdir, {
      apply(target, thisArgument, argumentsList): unknown {
        if (boundary.observeAfterSwap) {
          boundary.observed.readdir.push(String(argumentsList[0]));
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
  };
});

const { prepareGitBackedCaseHome } = await import("./prepare.js");
const { writeResourceDocument } =
  await import("../../resources/resource-document.js");

const temporaryDirectories: string[] = [];
const strictCase = {
  apiVersion: "casegraph.policeconduct.org/v1alpha1" as const,
  kind: "Case" as const,
  metadata: { uid: "tz4a98xxat96iws9zmbrgj3a" },
  spec: { resources: [] },
};

afterEach(async () => {
  boundary.caseFolder = "";
  boundary.caseHome = "";
  boundary.caseHomeLstatCalls = 0;
  boundary.mkdirFailed = false;
  boundary.mode = "none";
  boundary.observeAfterSwap = false;
  for (const calls of Object.values(boundary.observed)) calls.length = 0;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        actualFs.rm(directory, { force: true, recursive: true }),
      ),
  );
});

async function fixture(prefix: string): Promise<{
  readonly caseFolder: string;
  readonly caseHome: string;
  readonly configHome: string;
  readonly parent: string;
}> {
  const parent = await actualFs.mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(parent);
  const realParent = await actualFs.realpath(parent);
  const caseFolder = path.join(realParent, "selected-case");
  const caseHome = path.join(caseFolder, "casegraph");
  const configHome = path.join(parent, "config");
  boundary.caseFolder = caseFolder;
  boundary.caseHome = caseHome;
  return { caseFolder, caseHome, configHome, parent: realParent };
}

function createInput(caseFolder: string, configHome: string) {
  return {
    caseFolder,
    configHome,
    caseId: "PoliceConductUS/example-case",
    mode: "create" as const,
    initialCase: strictCase,
  };
}

function callsAtOrBelow(calls: readonly string[], target: string): string[] {
  return calls.filter(
    (call) => call === target || call.startsWith(`${target}${path.sep}`),
  );
}

describe("local preparation path boundaries", () => {
  test("reports partial recursive path creation with current registration and filesystem recovery", async () => {
    const { caseFolder, caseHome, configHome } = await fixture(
      "casegraph-prepare-partial-mkdir-",
    );
    await actualFs.mkdir(configHome);
    await actualFs.writeFile(
      path.join(configHome, "casehomes.yaml"),
      "invalid: [\n",
    );
    boundary.mode = "partial-mkdir";

    const result = await prepareGitBackedCaseHome(
      createInput(caseFolder, configHome),
    );

    expect(result).toMatchObject({
      state: "incomplete",
      failedStep: "path-preparation",
      report: {
        paths: { caseFolder, caseHome },
        registration: { state: "invalid" },
        recovery: { registration: "invalid" },
      },
    });
    if (result.state !== "incomplete") throw new Error("path was prepared");
    expect(result.diagnostic).toContain("child mkdir failed after parent");
    expect((await actualFs.stat(caseFolder)).isDirectory()).toBe(true);
    await expect(actualFs.lstat(caseHome)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("returns a compound diagnostic when path creation and recovery inspection both fail", async () => {
    const { caseFolder, configHome } = await fixture(
      "casegraph-prepare-compound-mkdir-",
    );
    boundary.mode = "partial-mkdir-recovery-failure";

    const result = await prepareGitBackedCaseHome(
      createInput(caseFolder, configHome),
    );

    expect(result).toMatchObject({
      state: "incomplete",
      failedStep: "path-preparation",
    });
    if (result.state !== "incomplete") throw new Error("path was prepared");
    expect(result.diagnostic).toContain("child mkdir failed after parent");
    expect(result.diagnostic).toContain("recovery inspection failed");
    expect(result.recoveryDiagnostic).toContain("recovery inspection failed");
  });

  test("converts exact-child recheck errors into an incomplete report instead of rejecting", async () => {
    const { caseFolder, configHome } = await fixture(
      "casegraph-prepare-recheck-error-",
    );
    await actualFs.mkdir(caseFolder);
    boundary.mode = "recheck-failure";

    const result = await prepareGitBackedCaseHome(
      createInput(caseFolder, configHome),
    );

    expect(result).toMatchObject({
      state: "incomplete",
      failedStep: "exact-child-recheck",
      report: {
        registration: { state: "absent" },
        recovery: { registration: "absent" },
      },
    });
    if (result.state !== "incomplete") throw new Error("path was prepared");
    expect(result.diagnostic).toContain("exact child recheck failed");
  });

  test("post-write symlink rejection performs no read, realpath, or enumeration through the swapped child", async () => {
    const { caseFolder, caseHome, configHome } = await fixture(
      "casegraph-prepare-observe-swap-",
    );
    const target = await actualFs.mkdtemp(
      path.join(tmpdir(), "casegraph-prepare-observe-target-"),
    );
    temporaryDirectories.push(target);
    const preserved = path.join(caseFolder, "preserved-casegraph");
    await actualFs.mkdir(caseHome, { recursive: true });
    await writeResourceDocument(path.join(target, "root.yaml"), strictCase);

    const result = await prepareGitBackedCaseHome(
      createInput(caseFolder, configHome),
      {
        writeRoot: async (...args) => {
          await writeResourceDocument(...args);
          await actualFs.rename(caseHome, preserved);
          await actualFs.symlink(target, caseHome, "dir");
          for (const calls of Object.values(boundary.observed))
            calls.length = 0;
          boundary.observeAfterSwap = true;
        },
      },
    );

    expect(result).toMatchObject({
      state: "incomplete",
      failedStep: "exact-child-recheck",
    });
    expect(callsAtOrBelow(boundary.observed.readFile, caseHome)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.realpath, caseHome)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.readdir, caseHome)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.readFile, target)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.realpath, target)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.readdir, target)).toEqual([]);
    expect(callsAtOrBelow(boundary.observed.lstat, target)).toEqual([]);
    expect(
      callsAtOrBelow(boundary.observed.lstat, caseHome).length,
    ).toBeGreaterThan(0);
  });
});
