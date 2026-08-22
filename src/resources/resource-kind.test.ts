import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  CaseResourceDefinition,
  CaseResourceRegistry,
} from "./case/case-resource.js";
import { createResourceRegistry, defineResourceKind } from "./resource-kind.js";
import { ResourceUidSchema } from "./resource-uid.js";

const firstUid = "tz4a98xxat96iws9zmbrgj3a";
const secondUid = "n8m2y4v6k9p3q7r5s1t0w2x4";
const thirdUid = "p6q4r8s2t9v3w7x5y1z0a2b4";

const validCase = {
  apiVersion: "casegraph.policeconduct.org/v1alpha1",
  kind: "Case",
  metadata: { uid: firstUid },
  spec: { resources: [secondUid, thirdUid] },
} as const;

const ObservedResourceDefinition = defineResourceKind({
  kind: "ObservedResource",
  category: "node",
  spec: z.strictObject({}).shape,
  status: z.strictObject({
    phase: z.enum(["pending", "complete"]),
  }).shape,
});

const FixtureNodeDefinition = defineResourceKind({
  kind: "FixtureNode",
  category: "node",
  spec: {
    relatedUid: ResourceUidSchema,
    sourcePath: z.string(),
    ignoredPath: z.string(),
  },
  ownedPaths: (resource) => [resource.spec.sourcePath],
});

const FixtureLegalEffectEdgeDefinition = defineResourceKind({
  kind: "FixtureLegalEffectEdge",
  category: "legal-effect-edge",
  spec: {
    from: ResourceUidSchema,
    to: ResourceUidSchema,
    ignoredUid: ResourceUidSchema,
  },
  resourceReferences: (resource) => [resource.spec.from, resource.spec.to],
});

const FailingSelectorDefinition = defineResourceKind({
  kind: "FailingSelector",
  category: "node",
  spec: {},
  resourceReferences: () => {
    throw new Error("selector failed");
  },
});

const storageSemanticsRegistry = createResourceRegistry([
  CaseResourceDefinition,
  FixtureNodeDefinition,
  FixtureLegalEffectEdgeDefinition,
  FailingSelectorDefinition,
]);

const observedResourceRegistry = createResourceRegistry([
  ObservedResourceDefinition,
]);

function assertInspectionIsDeeplyReadonly(): void {
  const inspection = CaseResourceDefinition.inspect(validCase);

  // @ts-expect-error Inspected metadata is deeply readonly.
  inspection.resource.metadata.uid = firstUid;
  // @ts-expect-error Inspected spec properties are deeply readonly.
  inspection.resource.spec.resources = [];
  // @ts-expect-error Inspected nested arrays are deeply readonly.
  inspection.resource.spec.resources[0] = inspection.resource.metadata.uid;
}
void assertInspectionIsDeeplyReadonly;

describe("strict CaseGraph resource kinds", () => {
  test("rejects duplicate resource registration keys", () => {
    expect(() =>
      createResourceRegistry([CaseResourceDefinition, CaseResourceDefinition]),
    ).toThrow(/Duplicate CaseGraph resource registration/);
  });

  test("reads the default Case value exactly", () => {
    expect(
      CaseResourceRegistry.read(validCase, "cases/example/root.yaml"),
    ).toEqual(validCase);
  });

  test("classifies Case as a node and exposes its ordered membership references", () => {
    expect(
      storageSemanticsRegistry.inspect(validCase, "cases/example/root.yaml"),
    ).toEqual({
      resource: validCase,
      category: "node",
      resourceReferences: [secondUid, thirdUid],
      ownedPaths: [],
    });
  });

  test("returns a deeply frozen inspection without reference-selector aliases", () => {
    const inspection = CaseResourceDefinition.inspect(validCase);
    const nodeInspection = FixtureNodeDefinition.inspect({
      apiVersion: validCase.apiVersion,
      kind: "FixtureNode",
      metadata: { uid: secondUid },
      spec: {
        relatedUid: thirdUid,
        sourcePath: "files/source.pdf",
        ignoredPath: "audits/not-selected.yaml",
      },
    });

    expect(Object.isFrozen(inspection)).toBe(true);
    expect(Object.isFrozen(inspection.resource)).toBe(true);
    expect(Object.isFrozen(inspection.resource.metadata)).toBe(true);
    expect(Object.isFrozen(inspection.resource.spec)).toBe(true);
    expect(Object.isFrozen(inspection.resource.spec.resources)).toBe(true);
    expect(Object.isFrozen(inspection.resourceReferences)).toBe(true);
    expect(Object.isFrozen(nodeInspection.ownedPaths)).toBe(true);
    expect(inspection.resourceReferences).not.toBe(
      inspection.resource.spec.resources,
    );

    expect(() =>
      Object.assign(inspection.resource.metadata, { uid: thirdUid }),
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(inspection.resource.spec.resources, { 0: thirdUid }),
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(inspection.resourceReferences, { 0: thirdUid }),
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(nodeInspection.ownedPaths, { 0: "audits/review.yaml" }),
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(inspection, { category: "legal-effect-edge" }),
    ).toThrow(TypeError);
  });

  test.each([
    ["missing resources", { ...validCase, spec: {} }],
    [
      "an invalid resource UID",
      { ...validCase, spec: { resources: ["case-1"] } },
    ],
    [
      "an invented spec field",
      { ...validCase, spec: { resources: [], invented: true } },
    ],
  ])("rejects Case spec with %s", (_condition, value) => {
    expect(() =>
      CaseResourceRegistry.read(value, "cases/example/root.yaml"),
    ).toThrow();
  });

  test("returns only paths declared by a strict node selector", () => {
    expect(
      storageSemanticsRegistry.inspect(
        {
          apiVersion: validCase.apiVersion,
          kind: "FixtureNode",
          metadata: { uid: secondUid },
          spec: {
            relatedUid: thirdUid,
            sourcePath: "files/source.pdf",
            ignoredPath: "audits/not-selected.yaml",
          },
        },
        "node.yaml",
      ),
    ).toEqual({
      resource: {
        apiVersion: validCase.apiVersion,
        kind: "FixtureNode",
        metadata: { uid: secondUid },
        spec: {
          relatedUid: thirdUid,
          sourcePath: "files/source.pdf",
          ignoredPath: "audits/not-selected.yaml",
        },
      },
      category: "node",
      resourceReferences: [],
      ownedPaths: ["files/source.pdf"],
    });
  });

  test("returns only typed endpoint references declared by a strict legal-effect edge", () => {
    expect(
      storageSemanticsRegistry.inspect(
        {
          apiVersion: validCase.apiVersion,
          kind: "FixtureLegalEffectEdge",
          metadata: { uid: thirdUid },
          spec: {
            from: firstUid,
            to: secondUid,
            ignoredUid: thirdUid,
          },
        },
        "edge.yaml",
      ),
    ).toEqual({
      resource: {
        apiVersion: validCase.apiVersion,
        kind: "FixtureLegalEffectEdge",
        metadata: { uid: thirdUid },
        spec: {
          from: firstUid,
          to: secondUid,
          ignoredUid: thirdUid,
        },
      },
      category: "legal-effect-edge",
      resourceReferences: [firstUid, secondUid],
      ownedPaths: [],
    });
  });

  test("identifies selector failures with the supplied resource path", () => {
    expect(() =>
      storageSemanticsRegistry.inspect(
        {
          apiVersion: validCase.apiVersion,
          kind: "FailingSelector",
          metadata: { uid: secondUid },
          spec: {},
        },
        "selector.yaml",
      ),
    ).toThrow(/^Invalid CaseGraph resource at selector\.yaml$/);
  });

  test("accepts a declared status shape", () => {
    expect(
      observedResourceRegistry.read(
        {
          ...validCase,
          kind: "ObservedResource",
          spec: {},
          status: { phase: "pending" },
        },
        "observed.yaml",
      ),
    ).toEqual({
      ...validCase,
      kind: "ObservedResource",
      spec: {},
      status: { phase: "pending" },
    });
  });

  test("rejects status for Case", () => {
    expect(() =>
      CaseResourceRegistry.read(
        { ...validCase, status: {} },
        "cases/example/root.yaml",
      ),
    ).toThrow();
  });

  test.each([
    ["root", { ...validCase, invented: true }],
    [
      "metadata",
      { ...validCase, metadata: { ...validCase.metadata, invented: true } },
    ],
    ["spec", { ...validCase, spec: { invented: true } }],
    [
      "status",
      {
        ...validCase,
        kind: "ObservedResource",
        spec: {},
        status: { phase: "pending", invented: true },
      },
    ],
  ])("rejects unknown %s fields", (_section, value) => {
    const registry =
      _section === "status" ? observedResourceRegistry : CaseResourceRegistry;

    expect(() => registry.read(value, "resource.yaml")).toThrow();
  });

  test("rejects a UID moved to the root", () => {
    expect(() =>
      CaseResourceRegistry.read(
        {
          apiVersion: validCase.apiVersion,
          kind: validCase.kind,
          uid: validCase.metadata.uid,
          metadata: {},
          spec: { resources: [] },
        },
        "cases/example/root.yaml",
      ),
    ).toThrow();
  });

  test("identifies an unknown API version and supplied path", () => {
    expect(() =>
      CaseResourceRegistry.read(
        { ...validCase, apiVersion: "casegraph.policeconduct.org/v9" },
        "cases/example/root.yaml",
      ),
    ).toThrow(
      /^Unknown CaseGraph resource API version casegraph\.policeconduct\.org\/v9 at cases\/example\/root\.yaml$/,
    );
  });

  test("identifies an unknown kind and supplied path", () => {
    expect(() =>
      CaseResourceRegistry.read(
        { ...validCase, kind: "UnknownResource" },
        "cases/example/root.yaml",
      ),
    ).toThrow(
      /^Unknown CaseGraph resource kind UnknownResource at cases\/example\/root\.yaml$/,
    );
  });

  test("serializes the same Case value to identical bytes", () => {
    const first = CaseResourceRegistry.serialize(
      validCase,
      "cases/example/root.yaml",
    );
    const second = CaseResourceRegistry.serialize(
      validCase,
      "cases/example/root.yaml",
    );

    expect(first).toBe(second);
  });

  test("round-trips serialized Case YAML through the registry", () => {
    const serialized = CaseResourceRegistry.serialize(
      validCase,
      "cases/example/root.yaml",
    );

    expect(
      CaseResourceRegistry.read(parse(serialized), "cases/example/root.yaml"),
    ).toEqual(validCase);
  });
});
