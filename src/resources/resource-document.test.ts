import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  readResourceDocument,
  writeResourceDocument,
} from "./resource-document.js";

const validCase = {
  apiVersion: "casegraph.policeconduct.org/v1alpha1",
  kind: "Case",
  metadata: { uid: "tz4a98xxat96iws9zmbrgj3a" },
  spec: {},
} as const;

const validCaseYaml = `apiVersion: casegraph.policeconduct.org/v1alpha1
kind: Case
metadata:
  uid: tz4a98xxat96iws9zmbrgj3a
spec: {}
`;

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "casegraph-resource-document-"));
}

describe("CaseGraph resource documents", () => {
  test("reads valid Case YAML from root.yaml", async () => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.yaml");

    try {
      await writeFile(rootPath, validCaseYaml);

      await expect(readResourceDocument(rootPath)).resolves.toEqual(validCase);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("identifies malformed YAML with the exact root.yaml path", async () => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.yaml");

    try {
      await writeFile(rootPath, "metadata: [\n");

      await expect(readResourceDocument(rootPath)).rejects.toThrow(
        `Invalid CaseGraph resource YAML at ${rootPath}:`,
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes a valid resource once and reads it back unchanged", async () => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.yaml");

    try {
      await writeResourceDocument(rootPath, validCase);

      await expect(readResourceDocument(rootPath)).resolves.toEqual(validCase);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("writes identical bytes for the same resource at two paths", async () => {
    const directory = await temporaryDirectory();
    const firstPath = join(directory, "first.yaml");
    const secondPath = join(directory, "second.yaml");

    try {
      await writeResourceDocument(firstPath, validCase);
      await writeResourceDocument(secondPath, validCase);

      await expect(readFile(firstPath)).resolves.toEqual(
        await readFile(secondPath),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("refuses an invalid resource before creating a file", async () => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.yaml");
    const invalidCase = {
      ...validCase,
      metadata: { uid: "not-a-cuid2" },
    };

    try {
      await expect(
        writeResourceDocument(rootPath, invalidCase),
      ).rejects.toThrow();
      await expect(stat(rootPath)).rejects.toThrow();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("preserves exact original bytes when the destination already exists", async () => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.yaml");
    const originalBytes = Buffer.from("preserve these exact bytes\n");

    try {
      await writeFile(rootPath, originalBytes);

      await expect(
        writeResourceDocument(rootPath, validCase),
      ).rejects.toThrow();
      await expect(readFile(rootPath)).resolves.toEqual(originalBytes);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test.each([
    [
      "API version",
      { ...validCase, apiVersion: "casegraph.policeconduct.org/v9" },
    ],
    ["kind", { ...validCase, kind: "UnknownResource" }],
  ])(
    "refuses an unknown writer-selected %s before creating a file",
    async (_selector, value) => {
      const directory = await temporaryDirectory();
      const rootPath = join(directory, "root.yaml");

      try {
        await expect(writeResourceDocument(rootPath, value)).rejects.toThrow();
        await expect(stat(rootPath)).rejects.toThrow();
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );
});
