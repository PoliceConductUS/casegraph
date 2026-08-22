import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  CaseHomeRegistrationStore,
  publishRegistrationAtomically,
} from "./registration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function createCaseHomeRoot(
  parent: string,
  name: string,
): Promise<string> {
  const rootPath = path.join(parent, name, "casegraph", "root.yaml");
  await mkdir(path.dirname(rootPath), { recursive: true });
  await writeFile(rootPath, "strict Case root\n");
  return realpath(rootPath);
}

async function writeRegistration(
  configHome: string,
  content: string,
): Promise<string> {
  const registrationPath = path.join(configHome, "casehomes.yaml");
  await mkdir(configHome, { recursive: true });
  await writeFile(registrationPath, content);
  return registrationPath;
}

describe("CaseHome machine registration reads", () => {
  test("returns an immutable empty mapping when casehomes.yaml is absent", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrations = await new CaseHomeRegistrationStore().read(
      configHome,
    );

    expect(registrations.size).toBe(0);
    expect([...registrations]).toEqual([]);
    expect(Object.isFrozen(registrations)).toBe(true);
    expect(Reflect.get(registrations, "set")).toBeUndefined();
  });

  test.each([
    ["malformed YAML", "PoliceConductUS/example: [\n"],
    ["a sequence root", "- PoliceConductUS/example\n"],
    ["a scalar root", "PoliceConductUS/example\n"],
    [
      "a duplicate key",
      "PoliceConductUS/example: /one/casegraph/root.yaml\nPoliceConductUS/example: /two/casegraph/root.yaml\n",
    ],
    ["a non-string key", "42: /cases/example/casegraph/root.yaml\n"],
    ["a non-string value", "PoliceConductUS/example: 42\n"],
  ])("rejects %s with casehomes.yaml context", async (_name, content) => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(configHome, content);

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(registrationPath);
  });

  test("rejects a missing stored root with casehomes.yaml context", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${path.join(configHome, "missing", "casegraph", "root.yaml")}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(registrationPath);
  });

  test("rejects a stored path that is not its canonical real path", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const realRoot = await createCaseHomeRoot(directory, "real-case");
    const linkedCaseFolder = path.join(directory, "linked-case");
    await mkdir(linkedCaseFolder);
    await symlink(
      path.dirname(realRoot),
      path.join(linkedCaseFolder, "casegraph"),
      "dir",
    );
    const linkedRoot = path.join(linkedCaseFolder, "casegraph", "root.yaml");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${linkedRoot}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(registrationPath);
  });

  test.each([
    ["a relative path", "cases/example/casegraph/root.yaml"],
    ["an absolute path with the wrong suffix", "/cases/example/root.yaml"],
  ])("rejects %s with casehomes.yaml context", async (_name, storedPath) => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${storedPath}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(registrationPath);
  });

  test("rejects one canonical root mapped from multiple case IDs", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${rootPath}\nPoliceConductUS/alias: ${rootPath}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(registrationPath);
    await expect(readFile(registrationPath, "utf8")).resolves.toContain(
      "PoliceConductUS/alias",
    );
  });
});

describe("CaseHome machine registration writes", () => {
  test("creates config parents and stores the canonical real root path", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configParent = await temporaryDirectory("casegraph-config-parent-");
    const configHome = path.join(configParent, "nested", "config");
    const realRoot = await createCaseHomeRoot(directory, "real-case");
    const linkedCaseFolder = path.join(directory, "linked-case");
    await mkdir(linkedCaseFolder);
    await symlink(
      path.dirname(realRoot),
      path.join(linkedCaseFolder, "casegraph"),
      "dir",
    );
    const requestedRoot = path.join(linkedCaseFolder, "casegraph", "root.yaml");

    const result = await new CaseHomeRegistrationStore().register({
      configHome,
      caseId: "PoliceConductUS/example-case",
      rootPath: requestedRoot,
    });

    expect(result).toBe("created");
    await expect(
      readFile(path.join(configHome, "casehomes.yaml"), "utf8"),
    ).resolves.toBe(
      `PoliceConductUS/example-case: ${await realpath(realRoot)}\n`,
    );
  });

  test("preserves unrelated mappings and publishes deterministically sorted YAML", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const zetaRoot = await createCaseHomeRoot(directory, "zeta");
    const alphaRoot = await createCaseHomeRoot(directory, "alpha");
    const middleRoot = await createCaseHomeRoot(directory, "middle");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/zeta: ${zetaRoot}\nPoliceConductUS/alpha: ${alphaRoot}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/middle",
        rootPath: middleRoot,
      }),
    ).resolves.toBe("created");
    await expect(readFile(registrationPath, "utf8")).resolves.toBe(
      `PoliceConductUS/alpha: ${alphaRoot}\nPoliceConductUS/middle: ${middleRoot}\nPoliceConductUS/zeta: ${zetaRoot}\n`,
    );
    await expect(readdir(configHome)).resolves.toEqual(["casehomes.yaml"]);
  });

  test("returns unchanged without writing for the identical ID and real path", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const originalBytes = Buffer.from(`PoliceConductUS/example: ${rootPath}\n`);
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );
    const store = new CaseHomeRegistrationStore({
      publish: () => Promise.reject(new Error("publisher must not be called")),
    });

    await expect(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    ).resolves.toBe("unchanged");
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
  });

  test("rejects a different root for one case ID without changing bytes", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const existingRoot = await createCaseHomeRoot(directory, "existing");
    const requestedRoot = await createCaseHomeRoot(directory, "requested");
    const originalBytes = Buffer.from(
      `PoliceConductUS/example: ${existingRoot}\n`,
    );
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath: requestedRoot,
      }),
    ).rejects.toThrow(
      `CaseHome registration conflict at ${registrationPath}: case ID PoliceConductUS/example already maps to ${existingRoot}; requested ${requestedRoot}`,
    );
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
  });

  test("rejects a second case ID for one root without changing bytes", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const originalBytes = Buffer.from(
      `PoliceConductUS/existing: ${rootPath}\n`,
    );
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/requested",
        rootPath,
      }),
    ).rejects.toThrow(
      `CaseHome registration conflict at ${registrationPath}: root path ${rootPath} already maps from PoliceConductUS/existing; requested PoliceConductUS/requested`,
    );
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
  });

  test("rejects an invalid existing document without changing bytes", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const originalBytes = Buffer.from("PoliceConductUS/existing: [\n");
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    ).rejects.toThrow(registrationPath);
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
  });

  test("rejects a missing requested root before creating config parents", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configParent = await temporaryDirectory("casegraph-config-parent-");
    const configHome = path.join(configParent, "nested", "config");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const missingRoot = path.join(
      directory,
      "missing",
      "casegraph",
      "root.yaml",
    );

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath: missingRoot,
      }),
    ).rejects.toThrow(registrationPath);
    await expect(readFile(registrationPath)).rejects.toThrow();
  });

  test("preserves and reports the sibling temporary file when publication fails", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "requested");
    const existingRoot = await createCaseHomeRoot(directory, "existing");
    const originalBytes = Buffer.from(
      `PoliceConductUS/existing: ${existingRoot}\n`,
    );
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );
    let observedTemporaryPath: string | undefined;
    const store = new CaseHomeRegistrationStore({
      publish: async ({ content, temporaryPath }) => {
        observedTemporaryPath = temporaryPath;
        await writeFile(temporaryPath, content, { flag: "wx" });
        throw new Error("injected failure before rename");
      },
    });

    const registration = store.register({
      configHome,
      caseId: "PoliceConductUS/requested",
      rootPath,
    });

    await expect(registration).rejects.toThrow(registrationPath);
    await expect(registration).rejects.toThrow(
      "injected failure before rename",
    );
    expect(observedTemporaryPath).toBeDefined();
    await expect(registration).rejects.toThrow(observedTemporaryPath);
    expect(path.dirname(observedTemporaryPath ?? "")).toBe(configHome);
    expect(path.basename(observedTemporaryPath ?? "")).toMatch(
      /^\.casehomes\.yaml\..+\.tmp$/,
    );
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
    await expect(readFile(observedTemporaryPath ?? "", "utf8")).resolves.toBe(
      `PoliceConductUS/existing: ${existingRoot}\nPoliceConductUS/requested: ${rootPath}\n`,
    );
  });

  test("creates the sibling temporary file exclusively before publication", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const originalBytes = Buffer.from(
      "PoliceConductUS/existing: /unchanged/casegraph/root.yaml\n",
    );
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );
    const occupiedTemporaryPath = path.join(
      configHome,
      ".casehomes.yaml.occupied.tmp",
    );
    const occupiedBytes = Buffer.from("do not overwrite this sibling\n");
    await writeFile(occupiedTemporaryPath, occupiedBytes);

    await expect(
      publishRegistrationAtomically({
        content: "complete replacement\n",
        destinationPath: registrationPath,
        temporaryPath: occupiedTemporaryPath,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
    await expect(readFile(occupiedTemporaryPath)).resolves.toEqual(
      occupiedBytes,
    );
  });
});
