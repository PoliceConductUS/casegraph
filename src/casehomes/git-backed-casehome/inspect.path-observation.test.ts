import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const observedFs = vi.hoisted(() => ({
  lstat: [] as string[],
  readFile: [] as string[],
  realpath: [] as string[],
  readdir: [] as string[],
}));
const strictOpenCalls = vi.hoisted(() => [] as string[]);

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    lstat: new Proxy(actual.lstat, {
      apply(target, thisArgument, argumentsList): unknown {
        observedFs.lstat.push(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    readFile: new Proxy(actual.readFile, {
      apply(target, thisArgument, argumentsList): unknown {
        observedFs.readFile.push(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    realpath: new Proxy(actual.realpath, {
      apply(target, thisArgument, argumentsList): unknown {
        observedFs.realpath.push(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
    readdir: new Proxy(actual.readdir, {
      apply(target, thisArgument, argumentsList): unknown {
        observedFs.readdir.push(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
  };
});

vi.mock("../../resources/casehome-storage/casehome-resources.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../resources/casehome-storage/casehome-resources.js")
  >("../../resources/casehome-storage/casehome-resources.js");
  return {
    ...actual,
    openCaseHomeResources: new Proxy(actual.openCaseHomeResources, {
      apply(target, thisArgument, argumentsList): unknown {
        strictOpenCalls.push(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
      },
    }),
  };
});

const { inspectGitBackedCaseHome } = await import("./inspect.js");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function callsAtOrBelow(calls: readonly string[], target: string): string[] {
  return calls.filter(
    (call) => call === target || call.startsWith(`${target}${path.sep}`),
  );
}

describe("exact child path observation", () => {
  test("lstats a symlink once without following or reading any target path", async () => {
    const caseFolder = await mkdtemp(
      path.join(tmpdir(), "casegraph-symlink-observer-"),
    );
    const configHome = await mkdtemp(
      path.join(tmpdir(), "casegraph-config-observer-"),
    );
    const target = await mkdtemp(
      path.join(tmpdir(), "casegraph-target-observer-"),
    );
    const registeredHome = await mkdtemp(
      path.join(tmpdir(), "casegraph-registered-observer-"),
    );
    temporaryDirectories.push(caseFolder, configHome, target, registeredHome);
    const caseHome = path.join(caseFolder, "casegraph");
    const registeredRoot = path.join(registeredHome, "casegraph", "root.yaml");
    await mkdir(path.dirname(registeredRoot));
    await writeFile(
      path.join(target, "root.yaml"),
      "target must stay unread\n",
    );
    await writeFile(
      registeredRoot,
      [
        "apiVersion: casegraph.policeconduct.org/v1alpha1",
        "kind: Case",
        "metadata:",
        "  uid: tz4a98xxat96iws9zmbrgj3a",
        "spec:",
        "  resources: []",
        "",
      ].join("\n"),
    );
    const canonicalRegisteredRoot = await import("node:fs/promises").then(
      ({ realpath }) => realpath(registeredRoot),
    );
    await writeFile(
      path.join(configHome, "casehomes.yaml"),
      `PoliceConductUS/symlink: ${canonicalRegisteredRoot}\n`,
    );
    await symlink(target, caseHome);
    const canonicalCaseFolder = await import("node:fs/promises").then(
      ({ realpath }) => realpath(caseFolder),
    );
    const canonicalTarget = await import("node:fs/promises").then(
      ({ realpath }) => realpath(target),
    );
    const canonicalCaseHome = path.join(canonicalCaseFolder, "casegraph");
    for (const calls of Object.values(observedFs)) calls.length = 0;
    strictOpenCalls.length = 0;

    const report = await inspectGitBackedCaseHome({
      caseFolder,
      caseId: "PoliceConductUS/symlink",
      configHome,
    });

    expect(report.classification).toBe("conflict");
    expect(
      observedFs.lstat.filter((call) => call === canonicalCaseHome),
    ).toHaveLength(1);
    expect(callsAtOrBelow(observedFs.realpath, canonicalTarget)).toEqual([]);
    expect(callsAtOrBelow(observedFs.lstat, canonicalTarget)).toEqual([]);
    expect(callsAtOrBelow(observedFs.readFile, canonicalTarget)).toEqual([]);
    expect(callsAtOrBelow(observedFs.readdir, canonicalTarget)).toEqual([]);
    expect(strictOpenCalls).toEqual([]);
    expect(report.registration.state).toBe("different");
  });
});
