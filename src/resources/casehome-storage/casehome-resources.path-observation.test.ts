import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CaseResourceRegistry } from "../case/case-resource.js";
import type { ResourceRegistry } from "../resource-kind.js";

const observedFs = vi.hoisted(() => ({
  lstat: [] as string[],
  readFile: [] as string[],
  realpath: [] as string[],
  readdir: [] as string[],
}));

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

const { openCaseHomeResources } = await import("./casehome-resources.js");

const temporaryDirectories: string[] = [];
const rootUid = "tz4a98xxat96iws9zmbrgj3a";
const memberAUid = "n8m2y4v6k9p3q7r5s1t0w2x4";
const memberBUid = "p6q4r8s2t9v3w7x5y1z0a2b4";
const unreferencedUid = "c4d6f8g2h9j3k7m5n1p0q2r4";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function caseYaml(uid: string, resources: readonly string[]): string {
  return [
    "apiVersion: casegraph.policeconduct.org/v1alpha1",
    "kind: Case",
    "metadata:",
    `  uid: ${uid}`,
    "spec:",
    resources.length === 0
      ? "  resources: []"
      : `  resources:\n${resources.map((resource) => `    - ${resource}`).join("\n")}`,
    "",
  ].join("\n");
}

function count(calls: readonly string[], target: string): number {
  return calls.filter((call) => call === target).length;
}

function callMap(calls: readonly string[]): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...new Set(calls)]
      .sort()
      .map((call) => [call, count(calls, call)] as const),
  );
}

function observedRegistry(base: ResourceRegistry): {
  readonly registry: ResourceRegistry;
  inspectionCount(resourcePath: string): number;
  readCount(resourcePath: string): number;
} {
  const inspections = new Map<string, number>();
  const reads = new Map<string, number>();
  return {
    registry: {
      read(value, resourcePath) {
        reads.set(resourcePath, (reads.get(resourcePath) ?? 0) + 1);
        return base.read(value, resourcePath);
      },
      inspect(value, resourcePath) {
        inspections.set(resourcePath, (inspections.get(resourcePath) ?? 0) + 1);
        return base.inspect(value, resourcePath);
      },
      serialize: base.serialize.bind(base),
    },
    inspectionCount(resourcePath) {
      return inspections.get(resourcePath) ?? 0;
    },
    readCount(resourcePath) {
      return reads.get(resourcePath) ?? 0;
    },
  };
}

describe("CaseHome resource path observation", () => {
  test("returns immutable sorted authoritative paths from the one rooted traversal", async () => {
    const caseHome = await mkdtemp(path.join(tmpdir(), "casegraph-paths-"));
    temporaryDirectories.push(caseHome);
    const rootPath = path.join(caseHome, "root.yaml");
    const memberAPath = path.join(caseHome, memberAUid, "root.yaml");
    const memberBPath = path.join(caseHome, memberBUid, "root.yaml");
    const unreferencedPath = path.join(caseHome, unreferencedUid, "root.yaml");
    await mkdir(path.dirname(memberAPath), { recursive: true });
    await mkdir(path.dirname(memberBPath), { recursive: true });
    await mkdir(path.dirname(unreferencedPath), { recursive: true });
    await writeFile(rootPath, caseYaml(rootUid, [memberBUid, memberAUid]));
    await writeFile(memberAPath, caseYaml(memberAUid, []));
    await writeFile(memberBPath, caseYaml(memberBUid, []));
    await writeFile(unreferencedPath, caseYaml(unreferencedUid, []));
    for (const calls of Object.values(observedFs)) calls.length = 0;
    const observed = observedRegistry(CaseResourceRegistry);

    const snapshot = await openCaseHomeResources(caseHome, observed.registry);
    const beforeAccess = structuredClone(observedFs);
    const canonicalHome = await import("node:fs/promises").then(
      ({ realpath }) => realpath(caseHome),
    );
    observedFs.realpath.pop();
    const expected = [
      path.join(canonicalHome, "root.yaml"),
      path.join(canonicalHome, memberAUid, "root.yaml"),
      path.join(canonicalHome, memberBUid, "root.yaml"),
    ].sort();

    expect(snapshot.documentPaths).toEqual(expected);
    expect(Object.isFrozen(snapshot.documentPaths)).toBe(true);
    expect(observedFs).toEqual(beforeAccess);
    for (const resourcePath of [rootPath, memberAPath, memberBPath]) {
      expect(count(observedFs.readFile, resourcePath)).toBe(1);
      expect(observed.inspectionCount(resourcePath)).toBe(1);
      expect(observed.readCount(resourcePath)).toBe(0);
    }
    expect(count(observedFs.readFile, unreferencedPath)).toBe(0);
    expect(observed.inspectionCount(unreferencedPath)).toBe(0);
    expect(observed.readCount(unreferencedPath)).toBe(0);
    expect(callMap(observedFs.realpath)).toEqual(
      callMap([
        caseHome,
        rootPath,
        path.join(caseHome, rootUid),
        path.dirname(memberAPath),
        memberAPath,
        path.dirname(memberBPath),
        memberBPath,
      ]),
    );
    expect(callMap(observedFs.lstat)).toEqual(
      callMap([path.join(caseHome, rootUid)]),
    );
    expect(callMap(observedFs.readFile)).toEqual(
      callMap([
        rootPath,
        path.join(caseHome, rootUid, "root.yaml"),
        memberAPath,
        memberBPath,
      ]),
    );
    expect(observedFs.readdir).toEqual([]);
  });
});
