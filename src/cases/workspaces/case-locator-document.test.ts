import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CASEGRAPH_API_VERSION,
  type CaseLocator,
  readCaseLocator,
  writeCaseLocator,
} from "./case-locator-document.js";

const validLocatorYaml = `apiVersion: policeconduct.org/casegraph/v1alpha1
kind: CaseLocator
metadata:
  name: example-v-example-city
spec:
  home: /cases/example-v-example-city/root.yaml
`;

const validLocator: CaseLocator = {
  apiVersion: CASEGRAPH_API_VERSION,
  kind: "CaseLocator",
  metadata: { name: "example-v-example-city" },
  spec: { home: "/cases/example-v-example-city/root.yaml" },
};

async function makeWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "casegraph-case-locator-"));
}

describe("CaseLocator documents", () => {
  test("reads the valid CaseLocator envelope", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, validLocatorYaml);

    await expect(readCaseLocator(rootPath)).resolves.toEqual(validLocator);
  });

  test.each([
    [
      "a wrong API version",
      validLocatorYaml.replace(
        "policeconduct.org/casegraph/v1alpha1",
        "policeconduct.org/casegraph/v1",
      ),
    ],
    ["a wrong kind", validLocatorYaml.replace("CaseLocator", "CaseHome")],
    [
      "a missing metadata name",
      validLocatorYaml.replace("  name: example-v-example-city\n", ""),
    ],
    [
      "a relative home path",
      validLocatorYaml.replace(
        "/cases/example-v-example-city/root.yaml",
        "cases/example-v-example-city/root.yaml",
      ),
    ],
    ["an unknown field", `${validLocatorYaml}extra: value\n`],
    ["malformed YAML", "apiVersion: [\n"],
  ])("rejects %s", async (_description, yaml) => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, yaml);

    await expect(readCaseLocator(rootPath)).rejects.toThrow();
  });

  test("creates one validated locator document", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");

    await writeCaseLocator(rootPath, validLocator);

    await expect(readCaseLocator(rootPath)).resolves.toEqual(validLocator);
    await expect(readFile(rootPath, "utf8")).resolves.toContain(
      "kind: CaseLocator",
    );
    await expect(writeCaseLocator(rootPath, validLocator)).rejects.toThrow();
  });

  test("rejects an invalid locator before creating its file", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");

    await expect(
      writeCaseLocator(rootPath, {
        ...validLocator,
        spec: { home: "not-absolute/root.yaml" },
      }),
    ).rejects.toThrow();
    await expect(readFile(rootPath, "utf8")).rejects.toThrow();
  });
});
