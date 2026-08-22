import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  CaseResourceDefinition,
  CaseResourceRegistry,
} from "./case/case-resource.js";
import { createResourceRegistry, defineResourceKind } from "./resource-kind.js";

const validCase = {
  apiVersion: "casegraph.policeconduct.org/v1alpha1",
  kind: "Case",
  metadata: { uid: "tz4a98xxat96iws9zmbrgj3a" },
  spec: {},
} as const;

const ObservedResourceDefinition = defineResourceKind({
  kind: "ObservedResource",
  spec: z.strictObject({}).shape,
  status: z.strictObject({
    phase: z.enum(["pending", "complete"]),
  }).shape,
});

const observedResourceRegistry = createResourceRegistry([
  ObservedResourceDefinition,
]);

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

  test("accepts a declared status shape", () => {
    expect(
      observedResourceRegistry.read(
        {
          ...validCase,
          kind: "ObservedResource",
          status: { phase: "pending" },
        },
        "observed.yaml",
      ),
    ).toEqual({
      ...validCase,
      kind: "ObservedResource",
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
          spec: {},
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
