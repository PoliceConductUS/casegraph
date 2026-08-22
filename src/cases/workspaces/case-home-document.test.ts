import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CASEGRAPH_API_VERSION,
  type CaseHome,
  readCaseHome,
  writeCaseHome,
} from "./case-home-document.js";

const validCaseHomeYaml = `apiVersion: policeconduct.org/casegraph/v1alpha1
kind: CaseHome
metadata:
  name: example-v-example-city
spec:
  graphRoot:
    type: node
    kind: case
    id: root
  packagePath: []
  createdAt: "2026-08-20T00:00:00.000Z"
  updatedAt: "2026-08-20T00:00:00.000Z"
`;

const validCaseHome: CaseHome = {
  apiVersion: CASEGRAPH_API_VERSION,
  kind: "CaseHome",
  metadata: { name: "example-v-example-city" },
  spec: {
    graphRoot: { type: "node", kind: "case", id: "root" },
    packagePath: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
};

async function makeWorkingDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "casegraph-case-home-"));
}

describe("CaseHome documents", () => {
  test("reads the valid CaseHome envelope", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, validCaseHomeYaml);

    await expect(readCaseHome(rootPath)).resolves.toEqual(validCaseHome);
  });

  test.each([
    [
      "a wrong API version",
      validCaseHomeYaml.replace(
        "policeconduct.org/casegraph/v1alpha1",
        "policeconduct.org/casegraph/v1",
      ),
    ],
    ["a wrong kind", validCaseHomeYaml.replace("CaseHome", "CaseLocator")],
    ["an unknown field", `${validCaseHomeYaml}extra: value\n`],
    [
      "an unknown metadata field",
      validCaseHomeYaml.replace(
        "  name: example-v-example-city\n",
        "  name: example-v-example-city\n  extra: value\n",
      ),
    ],
    ["an unknown spec field", `${validCaseHomeYaml}  extra: value\n`],
    [
      "an unknown graph-root field",
      validCaseHomeYaml.replace(
        "    id: root\n",
        "    id: root\n    extra: value\n",
      ),
    ],
    [
      "an unknown source-reference field",
      validCaseHomeYaml.replace(
        "    id: root\n",
        `    id: root
    sources:
      - mutation: mutation-1
        request: request-1
        path: $.response.body
        source_system: courtlistener
        source_model: docket
        source_id: 1
        extra: value
`,
      ),
    ],
    [
      "a non-ISO timestamp",
      validCaseHomeYaml.replace(
        '"2026-08-20T00:00:00.000Z"',
        '"August 20, 2026"',
      ),
    ],
    [
      "an altered graph-root identity",
      validCaseHomeYaml.replace("    id: root", "    id: another-root"),
    ],
    [
      "a non-string package path entry",
      validCaseHomeYaml.replace("  packagePath: []", "  packagePath: [1]"),
    ],
  ])("rejects %s", async (_description, yaml) => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, yaml);

    await expect(readCaseHome(rootPath)).rejects.toThrow();
  });

  test("creates one validated CaseHome document", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");

    await writeCaseHome(rootPath, { type: "create", value: validCaseHome });

    await expect(readCaseHome(rootPath)).resolves.toEqual(validCaseHome);
    await expect(
      writeCaseHome(rootPath, { type: "create", value: validCaseHome }),
    ).rejects.toThrow();
  });

  test("preserves comments while replacing package paths", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(
      rootPath,
      `# authoritative case package\n${validCaseHomeYaml}`,
    );

    await writeCaseHome(rootPath, {
      type: "replacePackagePath",
      packagePath: ["../shared", "/packages/public"],
    });

    await expect(readFile(rootPath, "utf8")).resolves.toContain(
      "# authoritative case package",
    );
    await expect(readCaseHome(rootPath)).resolves.toEqual({
      ...validCaseHome,
      spec: {
        ...validCaseHome.spec,
        packagePath: ["../shared", "/packages/public"],
      },
    });
  });

  test("replaces root.yaml through a sibling-file rename", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, validCaseHomeYaml);
    const original = await stat(rootPath);

    await writeCaseHome(rootPath, {
      type: "replacePackagePath",
      packagePath: ["../shared"],
    });

    const replaced = await stat(rootPath);
    expect(replaced.ino).not.toBe(original.ino);
  });

  test("leaves the original document unchanged when replacement is invalid", async () => {
    const directory = await makeWorkingDirectory();
    const rootPath = path.join(directory, "root.yaml");
    await writeFile(rootPath, validCaseHomeYaml);
    const original = await readFile(rootPath, "utf8");
    const invalidPackagePath = ["../shared", 1] as unknown as readonly string[];

    await expect(
      writeCaseHome(rootPath, {
        type: "replacePackagePath",
        packagePath: invalidPackagePath,
      }),
    ).rejects.toThrow();
    await expect(readFile(rootPath, "utf8")).resolves.toBe(original);
    await expect(readdir(directory)).resolves.toEqual(["root.yaml"]);
  });
});
