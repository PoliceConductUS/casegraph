import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { CaseResourceDefinition } from "../case/case-resource.js";
import { writeResourceDocument } from "../resource-document.js";
import {
  createResourceRegistry,
  defineResourceKind,
  type ResourceRegistry,
} from "../resource-kind.js";
import { ResourceUidSchema } from "../resource-uid.js";
import { openCaseHomeResources } from "./casehome-resources.js";

const caseUid = "tz4a98xxat96iws9zmbrgj3a";
const nodeAUid = "n8m2y4v6k9p3q7r5s1t0w2x4";
const nodeBUid = "p6q4r8s2t9v3w7x5y1z0a2b4";
const edgeUid = "h7j5k9m3n8q4r6s2t1v0w3x5";
const unreferencedUid = "c4d6f8g2h9j3k7m5n1p0q2r4";

const TestNodeDefinition = defineResourceKind({
  kind: "TestNode",
  category: "node",
  spec: {
    references: ResourceUidSchema.array(),
    ownedPaths: z.string().array(),
  },
  resourceReferences: (resource) => resource.spec.references,
  ownedPaths: (resource) => resource.spec.ownedPaths,
});

const TestLegalEffectEdgeDefinition = defineResourceKind({
  kind: "TestLegalEffectEdge",
  category: "legal-effect-edge",
  spec: {
    from: ResourceUidSchema,
    to: ResourceUidSchema,
  },
  resourceReferences: (resource) => [resource.spec.from, resource.spec.to],
});

const registry = createResourceRegistry([
  CaseResourceDefinition,
  TestNodeDefinition,
  TestLegalEffectEdgeDefinition,
]);

const temporaryCaseHomes: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryCaseHomes
      .splice(0)
      .map((caseHomePath) =>
        rm(caseHomePath, { force: true, recursive: true }),
      ),
  );
});

async function createTemporaryCaseHome(): Promise<string> {
  const caseHomePath = await mkdtemp(join(tmpdir(), "casegraph-casehome-"));
  temporaryCaseHomes.push(caseHomePath);
  return caseHomePath;
}

function caseResource(resources: readonly string[]) {
  return {
    apiVersion: "casegraph.policeconduct.org/v1alpha1",
    kind: "Case",
    metadata: { uid: caseUid },
    spec: { resources },
  } as const;
}

function testNode(
  uid: string,
  references: readonly string[] = [],
  ownedPaths: readonly string[] = [],
) {
  return {
    apiVersion: "casegraph.policeconduct.org/v1alpha1",
    kind: "TestNode",
    metadata: { uid },
    spec: { references, ownedPaths },
  } as const;
}

function testLegalEffectEdge(uid: string, from: string, to: string) {
  return {
    apiVersion: "casegraph.policeconduct.org/v1alpha1",
    kind: "TestLegalEffectEdge",
    metadata: { uid },
    spec: { from, to },
  } as const;
}

async function writeRoot(caseHomePath: string, value: unknown): Promise<void> {
  await writeResourceDocument(join(caseHomePath, "root.yaml"), value, registry);
}

async function writeNonRoot(
  caseHomePath: string,
  uid: string,
  value: unknown,
): Promise<void> {
  const rootPath = join(caseHomePath, uid, "root.yaml");
  await mkdir(dirname(rootPath), { recursive: true });
  await writeResourceDocument(rootPath, value, registry);
}

function observeRegistryReads(baseRegistry: ResourceRegistry): {
  readonly registry: ResourceRegistry;
  readCount(resourcePath: string): number;
  inspectionCount(resourcePath: string): number;
} {
  const reads = new Map<string, number>();
  const inspections = new Map<string, number>();

  function increment(counts: Map<string, number>, resourcePath: string): void {
    counts.set(resourcePath, (counts.get(resourcePath) ?? 0) + 1);
  }

  return {
    registry: {
      read(value, resourcePath) {
        increment(reads, resourcePath);
        return baseRegistry.read(value, resourcePath);
      },
      inspect(value, resourcePath) {
        increment(inspections, resourcePath);
        return baseRegistry.inspect(value, resourcePath);
      },
      serialize(value, resourcePath) {
        return baseRegistry.serialize(value, resourcePath);
      },
    },
    readCount(resourcePath) {
      return reads.get(resourcePath) ?? 0;
    },
    inspectionCount(resourcePath) {
      return inspections.get(resourcePath) ?? 0;
    },
  };
}

describe("rooted CaseHome resources", () => {
  test("loads the Case root and a node only from their canonical locations", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const root = caseResource([nodeAUid]);
    const node = testNode(nodeAUid);
    await writeRoot(caseHomePath, root);
    await writeNonRoot(caseHomePath, nodeAUid, node);

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(2);
    expect(snapshot.resolve(caseUid)).toEqual({
      resource: root,
      category: "node",
      resourceReferences: [nodeAUid],
      ownedPaths: [],
    });
    expect(snapshot.resolve(nodeAUid)).toEqual({
      resource: node,
      category: "node",
      resourceReferences: [],
      ownedPaths: [],
    });
    expect(Object.keys(snapshot).sort()).toEqual(["count", "resolve"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.resolve(nodeAUid))).toBe(true);
  });

  test("rejects a missing CaseHome root", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const rootPath = join(caseHomePath, "root.yaml");

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      rootPath,
    );
  });

  test("rejects a malformed CaseHome root with its canonical path", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const rootPath = join(caseHomePath, "root.yaml");
    await writeFile(rootPath, "metadata: [\n");

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Invalid CaseGraph resource YAML at ${rootPath}:`,
    );
  });

  test("rejects a schema-invalid CaseHome root with its canonical path", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const rootPath = join(caseHomePath, "root.yaml");
    await writeFile(
      rootPath,
      `apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Case
metadata:
  uid: ${caseUid}
spec: {}
`,
    );

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Invalid CaseGraph resource at ${rootPath}`,
    );
  });

  test("rejects a valid non-Case resource as the CaseHome root", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const rootPath = join(caseHomePath, "root.yaml");
    await writeRoot(caseHomePath, testNode(nodeAUid));

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `CaseHome root must be a Case resource at ${rootPath}`,
    );
  });

  test("rejects a missing referenced resource with its UID and canonical path", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const expectedPath = join(caseHomePath, nodeAUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Missing CaseHome resource ${nodeAUid} at ${expectedPath}`,
    );
  });

  test("rejects a canonical UID folder whose envelope claims another UID", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourcePath = join(caseHomePath, nodeAUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeBUid));

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `CaseHome resource UID mismatch at ${resourcePath}: expected ${nodeAUid}, actual ${nodeBUid}`,
    );
  });

  test("rejects a second authoritative document claiming the Case root UID", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const duplicatePath = join(caseHomePath, caseUid, "root.yaml");
    const unreferencedPath = join(caseHomePath, unreferencedUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([]));
    await writeNonRoot(caseHomePath, caseUid, caseResource([]));
    await mkdir(dirname(unreferencedPath), { recursive: true });
    await writeFile(unreferencedPath, "metadata: [\n");
    const observed = observeRegistryReads(registry);

    await expect(
      openCaseHomeResources(caseHomePath, observed.registry),
    ).rejects.toThrow(
      `Duplicate authoritative CaseHome resource UID ${caseUid} at ${duplicatePath}`,
    );
    expect(observed.inspectionCount(duplicatePath)).toBe(1);
    expect(observed.inspectionCount(unreferencedPath)).toBe(0);
  });

  test("rejects malformed YAML in a referenced canonical resource", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourcePath = join(caseHomePath, nodeAUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(resourcePath, "metadata: [\n");

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Invalid CaseGraph resource YAML at ${resourcePath}:`,
    );
  });

  test("rejects an unknown kind in a referenced canonical resource", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourcePath = join(caseHomePath, nodeAUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(
      resourcePath,
      `apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Unknown
metadata:
  uid: ${nodeAUid}
spec: {}
`,
    );

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Unknown CaseGraph resource kind Unknown at ${resourcePath}`,
    );
  });

  test("rejects a strict-schema failure in a referenced canonical resource", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourcePath = join(caseHomePath, nodeAUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await mkdir(dirname(resourcePath), { recursive: true });
    await writeFile(
      resourcePath,
      `apiVersion: casegraph.policeconduct.org/v1alpha1
kind: TestNode
metadata:
  uid: ${nodeAUid}
spec:
  references: []
  ownedPaths: []
  invented: true
`,
    );

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Invalid CaseGraph resource at ${resourcePath}`,
    );
  });

  test("resolves a legal-effect edge through the same UID-only boundary", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const edge = testLegalEffectEdge(edgeUid, caseUid, caseUid);
    await writeRoot(caseHomePath, caseResource([edgeUid]));
    await writeNonRoot(caseHomePath, edgeUid, edge);

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(2);
    expect(snapshot.resolve(edgeUid)).toMatchObject({
      resource: edge,
      category: "legal-effect-edge",
    });
  });

  test("discovers exact transitive membership through typed references", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid, [nodeBUid]));
    await writeNonRoot(caseHomePath, nodeBUid, testNode(nodeBUid));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(3);
    expect(snapshot.resolve(nodeAUid).resource.metadata.uid).toBe(nodeAUid);
    expect(snapshot.resolve(nodeBUid).resource.metadata.uid).toBe(nodeBUid);
  });

  test("normalizes typed files and audits paths inside the canonical resource folder", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourceFolder = join(caseHomePath, nodeAUid);
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [], ["files/source.pdf", "audits/review.yaml"]),
    );

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.resolve(nodeAUid).ownedPaths).toEqual([
      join(resourceFolder, "files", "source.pdf"),
      join(resourceFolder, "audits", "review.yaml"),
    ]);
  });

  test.each([
    ["forward-slash current-directory segment", "./files/source.pdf"],
    ["backslash current-directory segment", ".\\files\\source.pdf"],
  ])("normalizes an owned path with a %s", async (_case, declaredPath) => {
    const caseHomePath = await createTemporaryCaseHome();
    const expectedPath = join(caseHomePath, nodeAUid, "files", "source.pdf");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [], [declaredPath]),
    );

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.resolve(nodeAUid).ownedPaths).toEqual([expectedPath]);
  });

  test("ignores a physical file that no typed owned-path selector declares", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const undeclaredPath = join(
      caseHomePath,
      nodeAUid,
      "files",
      "undeclared.pdf",
    );
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid));
    await mkdir(dirname(undeclaredPath), { recursive: true });
    await writeFile(undeclaredPath, "not declared");

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.resolve(nodeAUid).ownedPaths).toEqual([]);
  });

  test.each([
    ["empty", ""],
    ["absolute", "/files/source.pdf"],
    ["backslash-rooted", "\\files\\source.pdf"],
    ["leading parent segment", "../outside.pdf"],
    ["nested parent segment", "files/nested/../source.pdf"],
    ["bare files directory", "files"],
    ["files directory with trailing separator", "files/"],
    ["normalized bare files directory", "files/."],
    ["bare audits directory", "audits"],
    ["outside the owned subtrees", "notes/source.pdf"],
  ])(
    "rejects an %s owned path without returning a snapshot",
    async (_case, ownedPath) => {
      const caseHomePath = await createTemporaryCaseHome();
      const resourcePath = join(caseHomePath, nodeAUid, "root.yaml");
      await writeRoot(caseHomePath, caseResource([nodeAUid]));
      await writeNonRoot(
        caseHomePath,
        nodeAUid,
        testNode(nodeAUid, [], [ownedPath]),
      );

      await expect(
        openCaseHomeResources(caseHomePath, registry),
      ).rejects.toThrow(
        `Invalid owned path ${JSON.stringify(ownedPath)} for resource ${nodeAUid} at ${resourcePath}`,
      );
    },
  );

  test("rejects an existing symlink segment that escapes the resource folder", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourceFolder = join(caseHomePath, nodeAUid);
    const outsidePath = await mkdtemp(join(tmpdir(), "casegraph-outside-"));
    temporaryCaseHomes.push(outsidePath);
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [], ["files/escape/source.pdf"]),
    );
    await mkdir(join(resourceFolder, "files"));
    await symlink(outsidePath, join(resourceFolder, "files", "escape"));

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Owned path escapes resource ${nodeAUid} at ${join(resourceFolder, "files", "escape", "source.pdf")}`,
    );
  });

  test("rejects an existing dangling symlink before accepting a missing suffix", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourceFolder = join(caseHomePath, nodeAUid);
    const outsideFolder = await mkdtemp(join(tmpdir(), "casegraph-outside-"));
    const missingTarget = join(outsideFolder, "missing");
    temporaryCaseHomes.push(outsideFolder);
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [], ["files/escape/source.pdf"]),
    );
    await mkdir(join(resourceFolder, "files"));
    await symlink(missingTarget, join(resourceFolder, "files", "escape"));

    await expect(openCaseHomeResources(caseHomePath, registry)).rejects.toThrow(
      `Owned path containment is indeterminate for resource ${nodeAUid} at ${join(resourceFolder, "files", "escape", "source.pdf")}`,
    );
  });

  test("accepts a missing owned-path suffix after contained existing ancestors", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const resourceFolder = join(caseHomePath, nodeAUid);
    const ownedPath = join(resourceFolder, "files", "missing", "source.pdf");
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [], ["files/missing/source.pdf"]),
    );
    await mkdir(join(resourceFolder, "files"));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.resolve(nodeAUid).ownedPaths).toEqual([ownedPath]);
  });

  test("records repeated references as one canonical member", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid, nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(2);
    expect(snapshot.resolve(nodeAUid)).toBe(snapshot.resolve(nodeAUid));
  });

  test("treats a direct Case self-reference as an already resolved member", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([caseUid]));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(1);
    expect(snapshot.resolve(caseUid).resource.metadata.uid).toBe(caseUid);
  });

  test("treats a non-root reference back to the Case root as a cycle", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid, [caseUid]));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(2);
    expect(snapshot.resolve(caseUid).resource.kind).toBe("Case");
  });

  test("terminates an A-to-B-to-A cycle with one member per UID", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid, [nodeBUid]));
    await writeNonRoot(caseHomePath, nodeBUid, testNode(nodeBUid, [nodeAUid]));

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(3);
    expect(snapshot.resolve(nodeAUid).resource.metadata.uid).toBe(nodeAUid);
    expect(snapshot.resolve(nodeBUid).resource.metadata.uid).toBe(nodeBUid);
  });

  test("inspects each reachable UID once without reading or inspecting an unreferenced directory", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    const rootPath = join(caseHomePath, "root.yaml");
    const nodeAPath = join(caseHomePath, nodeAUid, "root.yaml");
    const nodeBPath = join(caseHomePath, nodeBUid, "root.yaml");
    const unreferencedPath = join(caseHomePath, unreferencedUid, "root.yaml");
    await writeRoot(caseHomePath, caseResource([nodeAUid, nodeAUid]));
    await writeNonRoot(
      caseHomePath,
      nodeAUid,
      testNode(nodeAUid, [nodeBUid, caseUid]),
    );
    await writeNonRoot(caseHomePath, nodeBUid, testNode(nodeBUid, [nodeAUid]));
    await mkdir(dirname(unreferencedPath), { recursive: true });
    await writeFile(unreferencedPath, "metadata: [\n");
    const observed = observeRegistryReads(registry);

    const snapshot = await openCaseHomeResources(
      caseHomePath,
      observed.registry,
    );

    expect(snapshot.count).toBe(3);
    for (const reachablePath of [rootPath, nodeAPath, nodeBPath]) {
      expect(observed.readCount(reachablePath)).toBe(0);
      expect(observed.inspectionCount(reachablePath)).toBe(1);
    }
    expect(observed.readCount(unreferencedPath)).toBe(0);
    expect(observed.inspectionCount(unreferencedPath)).toBe(0);
  });

  test("excludes and refuses a valid unreferenced UID directory", async () => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid));
    await writeNonRoot(
      caseHomePath,
      unreferencedUid,
      testNode(unreferencedUid),
    );

    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(snapshot.count).toBe(2);
    expect(() => snapshot.resolve(unreferencedUid)).toThrow(
      `Resource UID is not a member of this CaseHome: ${unreferencedUid}`,
    );
  });

  test.each([
    ["kind-qualified identity", `TestNode:${nodeAUid}`],
    ["case-scoped composite identity", `${caseUid}:${nodeAUid}`],
    ["filesystem path", join(nodeAUid, "root.yaml")],
    ["object identity", { uid: nodeAUid }],
  ])("rejects %s resolution input", async (_description, input) => {
    const caseHomePath = await createTemporaryCaseHome();
    await writeRoot(caseHomePath, caseResource([nodeAUid]));
    await writeNonRoot(caseHomePath, nodeAUid, testNode(nodeAUid));
    const snapshot = await openCaseHomeResources(caseHomePath, registry);

    expect(() => snapshot.resolve(input)).toThrow();
  });
});
