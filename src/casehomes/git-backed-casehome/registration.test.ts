import { execFile, spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { CaseHomeRegistrationStore } from "./registration.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

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

async function guardIdentity(guardPath: string) {
  const entry = await lstat(guardPath);
  return { device: entry.dev, inode: entry.ino };
}

async function publishRegistrationForTest(input: {
  readonly content: string;
  readonly destinationPath: string;
  readonly mode: number;
  readonly temporaryPath: string;
}): Promise<void> {
  await writeFile(input.temporaryPath, input.content, {
    flag: "wx",
    mode: input.mode,
  });
  await chmod(input.temporaryPath, input.mode);
  await rename(input.temporaryPath, input.destinationPath);
}

async function rejectionOf(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected operation to reject");
}

function createObservedGuard() {
  const state = { acquired: 0, released: 0 };
  return {
    state,
    acquireGuard: async (guardPath: string) => {
      state.acquired += 1;
      await writeFile(guardPath, "held\n", { flag: "wx", mode: 0o600 });
      return {
        identity: await guardIdentity(guardPath),
        release: async () => {
          state.released += 1;
          await unlink(guardPath);
        },
      };
    },
  };
}

function retainGuardOnCleanup(cleanupDiagnostic: string) {
  return async (guardPath: string) => {
    await writeFile(guardPath, "retained\n", { flag: "wx", mode: 0o600 });
    return {
      identity: await guardIdentity(guardPath),
      release: () => Promise.reject(new Error(cleanupDiagnostic)),
    };
  };
}

function removeGuardOnCleanup(cleanupDiagnostic: string) {
  return async (guardPath: string) => {
    await writeFile(guardPath, "acquired\n", { flag: "wx", mode: 0o600 });
    return {
      identity: await guardIdentity(guardPath),
      release: async () => {
        await unlink(guardPath);
        throw new Error(cleanupDiagnostic);
      },
    };
  };
}

async function runRegistrationSubprocess(input: {
  readonly configHome: string;
  readonly caseId: string;
  readonly rootPath: string;
}): Promise<{
  readonly stderr: string;
  readonly stdout: string;
  readonly code: number;
}> {
  const moduleUrl = new URL("./registration.ts", import.meta.url).href;
  const script = `
    import { CaseHomeRegistrationStore } from ${JSON.stringify(moduleUrl)};
    try {
      const result = await new CaseHomeRegistrationStore().register(${JSON.stringify(input)});
      process.stdout.write(String(result));
    } catch (error) {
      process.stderr.write(String(error));
      process.exitCode = 17;
    }
  `;
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: process.cwd() },
    );
    return { code: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const failure = error as Error & {
      readonly code: number;
      readonly stderr: string;
      readonly stdout: string;
    };
    return {
      code: failure.code,
      stderr: failure.stderr,
      stdout: failure.stdout,
    };
  }
}

describe("CaseHome machine registration reads", () => {
  test("returns an immutable empty mapping when casehomes.yaml is absent", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const registrations = await new CaseHomeRegistrationStore().read(
      configHome,
    );

    expect(registrations.size).toBe(0);
    expect([...registrations]).toEqual([]);
    expect(Object.isFrozen(registrations)).toBe(true);
    expect(Reflect.get(registrations, "set")).toBeUndefined();
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("reads exact nonempty entries through an immutable mapping facade", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const alphaRoot = await createCaseHomeRoot(directory, "alpha");
    const zetaRoot = await createCaseHomeRoot(directory, "zeta");
    await writeRegistration(
      configHome,
      `PoliceConductUS/alpha: ${alphaRoot}\nPoliceConductUS/zeta: ${zetaRoot}\n`,
    );

    const registrations = await new CaseHomeRegistrationStore().read(
      configHome,
    );
    const visited: [string, string][] = [];
    registrations.forEach((value, key, map) => {
      expect(map).toBe(registrations);
      visited.push([key, value]);
    });

    expect([...registrations]).toEqual([
      ["PoliceConductUS/alpha", alphaRoot],
      ["PoliceConductUS/zeta", zetaRoot],
    ]);
    expect(visited).toEqual([...registrations]);
    expect([...registrations.keys()]).toEqual([
      "PoliceConductUS/alpha",
      "PoliceConductUS/zeta",
    ]);
    expect([...registrations.values()]).toEqual([alphaRoot, zetaRoot]);
    expect(registrations.get("PoliceConductUS/alpha")).toBe(alphaRoot);
    expect(registrations.has("PoliceConductUS/zeta")).toBe(true);
    expect(Object.isFrozen(registrations)).toBe(true);
    expect(Reflect.get(registrations, "set")).toBeUndefined();
    expect(Reflect.get(registrations, "delete")).toBeUndefined();
    expect(Reflect.get(registrations, "clear")).toBeUndefined();
  });

  test("rejects a valid casehomes.yaml symlink without reading or changing its target", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const targetDirectory = await temporaryDirectory(
      "casegraph-config-target-",
    );
    const rootPath = await createCaseHomeRoot(directory, "example");
    const targetPath = await writeRegistration(
      targetDirectory,
      `PoliceConductUS/example: ${rootPath}\n`,
    );
    const targetBytes = await readFile(targetPath);
    const registrationPath = path.join(configHome, "casehomes.yaml");
    await symlink(targetPath, registrationPath);

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: registry entry is a symbolic link, not a regular file`,
    );
    await expect(readFile(targetPath)).resolves.toEqual(targetBytes);
    expect((await lstat(registrationPath)).isSymbolicLink()).toBe(true);
  });

  test("rejects a dangling casehomes.yaml symlink instead of treating it as absent", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const missingTarget = path.join(configHome, "missing.yaml");
    await symlink(missingTarget, registrationPath);

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: registry entry is a symbolic link, not a regular file`,
    );
    expect((await lstat(registrationPath)).isSymbolicLink()).toBe(true);
    await expect(lstat(missingTarget)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("rejects a casehomes.yaml directory unchanged", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    await mkdir(registrationPath);

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: registry entry is a directory, not a regular file`,
    );
    expect((await lstat(registrationPath)).isDirectory()).toBe(true);
  });

  test("rejects a casehomes.yaml FIFO unchanged without reading or publishing", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    await execFileAsync("mkfifo", [registrationPath]);
    const writerScript = `
      import { writeFile } from "node:fs/promises";
      await writeFile(${JSON.stringify(registrationPath)}, "not yaml\\n");
    `;
    const blockedWriter = spawn(
      process.execPath,
      ["--input-type=module", "--eval", writerScript],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    const writerFinished = new Promise<void>((resolve, reject) => {
      blockedWriter.once("error", reject);
      blockedWriter.once("exit", () => resolve());
    });
    let publicationCount = 0;

    try {
      await expect(
        new CaseHomeRegistrationStore({
          publish: () => {
            publicationCount += 1;
            return Promise.resolve();
          },
        }).register({
          configHome,
          caseId: "PoliceConductUS/example",
          rootPath,
        }),
      ).rejects.toThrow(
        `Invalid CaseHome registration at ${registrationPath}: registry entry is a FIFO, not a regular file`,
      );
      expect(publicationCount).toBe(0);
      expect((await lstat(registrationPath)).isFIFO()).toBe(true);
      expect(await readdir(configHome)).toEqual(["casehomes.yaml"]);
      expect(blockedWriter.exitCode).toBeNull();
      expect(blockedWriter.signalCode).toBeNull();
    } finally {
      if (
        blockedWriter.exitCode === null &&
        blockedWriter.signalCode === null
      ) {
        blockedWriter.kill("SIGTERM");
      }
      await writerFinished;
    }
  });

  test("rejects malformed YAML with its parser and casehomes.yaml context", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(
      configHome,
      "PoliceConductUS/example: [\n",
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: Flow sequence in block collection must be sufficiently indented and end with a ]`,
    );
  });

  test.each([
    ["sequence", "- PoliceConductUS/example\n"],
    ["scalar", "PoliceConductUS/example\n"],
  ])("rejects a %s root as a non-mapping document", async (_name, content) => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(configHome, content);

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: document root must be a mapping`,
    );
  });

  test("rejects duplicate keys before inspecting their real root paths", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const firstRoot = await createCaseHomeRoot(directory, "first");
    const secondRoot = await createCaseHomeRoot(directory, "second");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${firstRoot}\nPoliceConductUS/example: ${secondRoot}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: Map keys must be unique`,
    );
  });

  test("rejects a non-string key before inspecting its real root path", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      `42: ${rootPath}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: mapping keys must be strings`,
    );
  });

  test("rejects a non-string value with casehomes.yaml context", async () => {
    const configHome = await temporaryDirectory("casegraph-config-");
    const registrationPath = await writeRegistration(
      configHome,
      "PoliceConductUS/example: 42\n",
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: mapping values must be strings`,
    );
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

  test("rejects a stored directory named casegraph/root.yaml", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = path.join(directory, "example", "casegraph", "root.yaml");
    await mkdir(rootPath, { recursive: true });
    const canonicalRootPath = await realpath(rootPath);
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${canonicalRootPath}\n`,
    );

    await expect(
      new CaseHomeRegistrationStore().read(configHome),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: stored root target ${canonicalRootPath} is a directory, not a regular file`,
    );
    expect((await stat(canonicalRootPath)).isDirectory()).toBe(true);
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

  test("creates a new casehomes.yaml with exact mode 0600 under a permissive umask", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const previousUmask = process.umask(0);

    try {
      await new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      });
    } finally {
      process.umask(previousUmask);
    }

    expect((await stat(registrationPath)).mode & 0o777).toBe(0o600);
  });

  test("preserves existing registry permission bits on replacement", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const existingRoot = await createCaseHomeRoot(directory, "existing");
    const requestedRoot = await createCaseHomeRoot(directory, "requested");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/existing: ${existingRoot}\n`,
    );
    await chmod(registrationPath, 0o640);

    await new CaseHomeRegistrationStore().register({
      configHome,
      caseId: "PoliceConductUS/requested",
      rootPath: requestedRoot,
    });

    expect((await stat(registrationPath)).mode & 0o777).toBe(0o640);
  });

  test("atomically replaces casehomes.yaml on the default publisher path", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const existingRoot = await createCaseHomeRoot(directory, "existing");
    const requestedRoot = await createCaseHomeRoot(directory, "requested");
    const originalBytes = Buffer.from(
      `PoliceConductUS/existing: ${existingRoot}\n`,
    );
    const replacementBytes = Buffer.from(
      `PoliceConductUS/existing: ${existingRoot}\nPoliceConductUS/requested: ${requestedRoot}\n`,
    );
    const registrationPath = await writeRegistration(
      configHome,
      originalBytes.toString(),
    );
    const originalEntry = await lstat(registrationPath);
    const originalHandle = await open(registrationPath, "r");

    try {
      await expect(
        new CaseHomeRegistrationStore().register({
          configHome,
          caseId: "PoliceConductUS/requested",
          rootPath: requestedRoot,
        }),
      ).resolves.toBe("created");

      const replacementEntry = await lstat(registrationPath);
      expect(replacementEntry.ino).not.toBe(originalEntry.ino);
      await expect(readFile(registrationPath)).resolves.toEqual(
        replacementBytes,
      );
      await expect(originalHandle.readFile()).resolves.toEqual(originalBytes);
    } finally {
      await originalHandle.close();
    }
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

  test("rejects a requested directory named casegraph/root.yaml without publishing", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = path.join(directory, "example", "casegraph", "root.yaml");
    await mkdir(rootPath, { recursive: true });
    const canonicalRootPath = await realpath(rootPath);
    const registrationPath = path.join(configHome, "casehomes.yaml");

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath: canonicalRootPath,
      }),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: requested root target ${canonicalRootPath} is a directory, not a regular file`,
    );
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("rejects a requested FIFO named casegraph/root.yaml without publishing", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = path.join(directory, "example", "casegraph", "root.yaml");
    await mkdir(path.dirname(rootPath), { recursive: true });
    await execFileAsync("mkfifo", [rootPath]);
    const canonicalRootPath = await realpath(rootPath);
    const registrationPath = path.join(configHome, "casehomes.yaml");

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath: canonicalRootPath,
      }),
    ).rejects.toThrow(
      `Invalid CaseHome registration at ${registrationPath}: requested root target ${canonicalRootPath} is a FIFO, not a regular file`,
    );
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
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
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const existingRoot = await createCaseHomeRoot(directory, "existing");
    const requestedRoot = await createCaseHomeRoot(directory, "requested");
    const originalBytes = Buffer.from(
      `PoliceConductUS/existing: ${existingRoot}\n`,
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
    const store = new CaseHomeRegistrationStore({
      temporaryId: () => "occupied",
    });

    await expect(
      store.register({
        configHome,
        caseId: "PoliceConductUS/requested",
        rootPath: requestedRoot,
      }),
    ).rejects.toThrow(occupiedTemporaryPath);
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
    await expect(readFile(occupiedTemporaryPath)).resolves.toEqual(
      occupiedBytes,
    );
  });
});

describe("serialized CaseHome machine registration", () => {
  test("fails one independent contender while a writer holds the guard, then preserves the holder's latest snapshot", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const holderRoot = await createCaseHomeRoot(directory, "holder");
    const laterRoot = await createCaseHomeRoot(directory, "later");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const malformedBytes = Buffer.from("PoliceConductUS/holder: [\n");
    await writeFile(registrationPath, malformedBytes, { mode: 0o600 });
    let signalGuardAcquired!: () => void;
    let allowSnapshotRead!: () => void;
    const guardAcquired = new Promise<void>((resolve) => {
      signalGuardAcquired = resolve;
    });
    const snapshotReadAllowed = new Promise<void>((resolve) => {
      allowSnapshotRead = resolve;
    });
    const holderStore = new CaseHomeRegistrationStore({
      acquireGuard: async (candidateGuardPath) => {
        const holderGuard = await open(candidateGuardPath, "wx", 0o600);
        const holderEntry = await holderGuard.stat();
        signalGuardAcquired();
        await snapshotReadAllowed;
        await writeFile(
          registrationPath,
          `PoliceConductUS/holder: ${holderRoot}\n`,
          { mode: 0o600 },
        );
        return {
          identity: { device: holderEntry.dev, inode: holderEntry.ino },
          release: async () => {
            await holderGuard.close();
            await unlink(candidateGuardPath);
          },
        };
      },
    });
    const holderRegistration = holderStore.register({
      configHome,
      caseId: "PoliceConductUS/holder",
      rootPath: holderRoot,
    });
    await guardAcquired;

    const contender = await runRegistrationSubprocess({
      configHome,
      caseId: "PoliceConductUS/holder",
      rootPath: holderRoot,
    });

    await expect(readFile(registrationPath)).resolves.toEqual(malformedBytes);
    allowSnapshotRead();
    await expect(holderRegistration).resolves.toBe("unchanged");
    expect(contender.code).toBe(17);
    expect(contender.stdout).toBe("");
    expect(contender.stderr).toContain(guardPath);
    expect(contender.stderr).toContain("contention");
    await expect(lstat(guardPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(configHome)).toEqual(["casehomes.yaml"]);

    await expect(
      new CaseHomeRegistrationStore().register({
        configHome,
        caseId: "PoliceConductUS/later",
        rootPath: laterRoot,
      }),
    ).resolves.toBe("created");
    await expect(readFile(registrationPath, "utf8")).resolves.toBe(
      `PoliceConductUS/holder: ${holderRoot}\nPoliceConductUS/later: ${laterRoot}\n`,
    );
  });

  test("attempts guard acquisition once and never invokes a fallback publisher on contention", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const guardPath = path.join(configHome, "casehomes.yaml.lock");
    let acquisitionCount = 0;
    let publicationCount = 0;
    const store = new CaseHomeRegistrationStore({
      acquireGuard: () => {
        acquisitionCount += 1;
        return Promise.reject(
          Object.assign(new Error("guard already exists"), { code: "EEXIST" }),
        );
      },
      publish: () => {
        publicationCount += 1;
        return Promise.resolve();
      },
    });

    await expect(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    ).rejects.toThrow(`CaseHome registration contention at ${guardPath}`);
    expect(acquisitionCount).toBe(1);
    expect(publicationCount).toBe(0);
  });

  test("reads the latest registry snapshot only after acquiring its guard", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const firstRoot = await createCaseHomeRoot(directory, "first");
    const secondRoot = await createCaseHomeRoot(directory, "second");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const observed = createObservedGuard();
    const store = new CaseHomeRegistrationStore({
      acquireGuard: async (guardPath: string) => {
        const guard = await observed.acquireGuard(guardPath);
        await writeFile(
          registrationPath,
          `PoliceConductUS/first: ${firstRoot}\n`,
          { mode: 0o600 },
        );
        return guard;
      },
    });

    await expect(
      store.register({
        configHome,
        caseId: "PoliceConductUS/second",
        rootPath: secondRoot,
      }),
    ).resolves.toBe("created");
    expect(observed.state).toEqual({ acquired: 1, released: 1 });
    await expect(readFile(registrationPath, "utf8")).resolves.toBe(
      `PoliceConductUS/first: ${firstRoot}\nPoliceConductUS/second: ${secondRoot}\n`,
    );
  });

  test("removes its guard after created and unchanged completion", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const firstRoot = await createCaseHomeRoot(directory, "first");
    const createdGuard = createObservedGuard();
    const createdStore = new CaseHomeRegistrationStore({
      acquireGuard: createdGuard.acquireGuard,
    });

    await expect(
      createdStore.register({
        configHome,
        caseId: "PoliceConductUS/first",
        rootPath: firstRoot,
      }),
    ).resolves.toBe("created");
    expect(createdGuard.state).toEqual({ acquired: 1, released: 1 });
    const unchangedGuard = createObservedGuard();
    const unchangedStore = new CaseHomeRegistrationStore({
      acquireGuard: unchangedGuard.acquireGuard,
      publish: () => Promise.reject(new Error("must not publish unchanged")),
    });

    await expect(
      unchangedStore.register({
        configHome,
        caseId: "PoliceConductUS/first",
        rootPath: firstRoot,
      }),
    ).resolves.toBe("unchanged");
    expect(unchangedGuard.state).toEqual({ acquired: 1, released: 1 });
    await expect(
      lstat(path.join(configHome, "casehomes.yaml.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("removes its guard after validation and publication failures", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const invalidConfigHome = await temporaryDirectory("casegraph-config-");
    const publishConfigHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const invalidRegistrationPath = await writeRegistration(
      invalidConfigHome,
      "PoliceConductUS/example: [\n",
    );
    const validationGuard = createObservedGuard();
    const validationStore = new CaseHomeRegistrationStore({
      acquireGuard: validationGuard.acquireGuard,
    });

    await expect(
      validationStore.register({
        configHome: invalidConfigHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    ).rejects.toThrow(invalidRegistrationPath);
    expect(validationGuard.state).toEqual({ acquired: 1, released: 1 });
    const publicationGuard = createObservedGuard();
    const publicationStore = new CaseHomeRegistrationStore({
      acquireGuard: publicationGuard.acquireGuard,
      publish: () => Promise.reject(new Error("injected publication failure")),
    });

    await expect(
      publicationStore.register({
        configHome: publishConfigHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    ).rejects.toThrow("injected publication failure");
    expect(publicationGuard.state).toEqual({ acquired: 1, released: 1 });
    await expect(
      lstat(path.join(invalidConfigHome, "casehomes.yaml.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      lstat(path.join(publishConfigHome, "casehomes.yaml.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("closes a default guard handle when identity capture fails", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    let capturedHandle: FileHandle | undefined;
    let publicationCount = 0;
    const dependencies = {
      readGuardIdentity: (handle: FileHandle) => {
        capturedHandle = handle;
        return Promise.reject(new Error("injected identity capture failure"));
      },
      publish: () => {
        publicationCount += 1;
        return Promise.resolve();
      },
    };
    const store = new CaseHomeRegistrationStore(dependencies);

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain(guardPath);
    expect(error.message).toContain("injected identity capture failure");
    expect(error.message).toContain("guard handle close: completed");
    expect(error.message).toContain("guard state: unknown");
    expect(error.message).toContain("registry published: false");
    expect(publicationCount).toBe(0);
    expect(capturedHandle).toBeDefined();
    if (capturedHandle === undefined)
      throw new Error("Guard handle not captured");
    await expect(capturedHandle.stat()).rejects.toThrow();
    expect((await lstat(guardPath)).isFile()).toBe(true);
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("preserves a foreign guard after compound identity capture, close, and inspection failures", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const foreignBytes = Buffer.from(
      "foreign guard after partial acquisition\n",
    );
    let capturedHandle: FileHandle | undefined;
    let foreignIdentity:
      | { readonly device: number; readonly inode: number }
      | undefined;
    let closeCount = 0;
    let inspectionCount = 0;
    let publicationCount = 0;
    const dependencies = {
      readGuardIdentity: async (handle: FileHandle) => {
        capturedHandle = handle;
        await unlink(guardPath);
        await writeFile(guardPath, foreignBytes, { flag: "wx", mode: 0o600 });
        foreignIdentity = await guardIdentity(guardPath);
        throw new Error("injected identity capture failure");
      },
      closeGuardHandle: async (handle: FileHandle) => {
        closeCount += 1;
        await handle.close();
        throw new Error("injected guard close failure");
      },
      inspectGuard: () => {
        inspectionCount += 1;
        return Promise.reject(new Error("injected partial inspection failure"));
      },
      publish: () => {
        publicationCount += 1;
        return Promise.resolve();
      },
    };
    const store = new CaseHomeRegistrationStore(dependencies);

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain(guardPath);
    expect(error.message).toContain("injected identity capture failure");
    expect(error.message).toContain("injected guard close failure");
    expect(error.message).toContain("injected partial inspection failure");
    expect(error.message).toContain("guard state: unknown");
    expect(error.message).not.toContain("guard state: retained");
    expect(error.message).not.toContain("guard state: absent/ownership-lost");
    expect(error.message).toContain("registry published: false");
    expect(closeCount).toBe(1);
    expect(inspectionCount).toBe(1);
    expect(publicationCount).toBe(0);
    expect(capturedHandle).toBeDefined();
    if (capturedHandle === undefined)
      throw new Error("Guard handle not captured");
    await expect(capturedHandle.stat()).rejects.toThrow();
    await expect(readFile(guardPath)).resolves.toEqual(foreignBytes);
    await expect(guardIdentity(guardPath)).resolves.toEqual(foreignIdentity);
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("reports absent ownership after successful publication removes the guard pathname", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const store = new CaseHomeRegistrationStore({
      publish: async (input) => {
        await publishRegistrationForTest(input);
        await unlink(guardPath);
      },
    });

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain(guardPath);
    expect(error.message).toContain("guard state: absent/ownership-lost");
    expect(error.message).not.toContain("guard state: retained");
    expect(error.message).toContain("registry published: true");
    await expect(readFile(registrationPath, "utf8")).resolves.toBe(
      `PoliceConductUS/example: ${rootPath}\n`,
    );
    await expect(lstat(guardPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("reports unknown when guard-state inspection fails", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${rootPath}\n`,
    );
    const guardPath = `${registrationPath}.lock`;
    let inspectionCount = 0;
    const dependencies = {
      acquireGuard: retainGuardOnCleanup("injected cleanup failure"),
      inspectGuard: () => {
        inspectionCount += 1;
        return Promise.reject(new Error("injected inspection failure"));
      },
    };
    const store = new CaseHomeRegistrationStore(dependencies);

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain("injected cleanup failure");
    expect(error.message).toContain("injected inspection failure");
    expect(error.message).toContain("guard state: unknown");
    expect(error.message).not.toContain("guard state: retained");
    expect(error.message).not.toContain("guard state: absent/ownership-lost");
    expect(error.message).toContain("registry published: false");
    expect(inspectionCount).toBe(1);
    expect((await lstat(guardPath)).isFile()).toBe(true);
  });

  test("leaves a distinguishable foreign guard replacement unchanged", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const foreignBytes = Buffer.from("foreign replacement\n");
    let foreignIdentity:
      | { readonly device: number; readonly inode: number }
      | undefined;
    let publicationCount = 0;
    const store = new CaseHomeRegistrationStore({
      publish: async (input) => {
        publicationCount += 1;
        await publishRegistrationForTest(input);
        await unlink(guardPath);
        await writeFile(guardPath, foreignBytes, { flag: "wx", mode: 0o600 });
        foreignIdentity = await guardIdentity(guardPath);
      },
    });

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain(guardPath);
    expect(error.message).toContain("guard state: absent/ownership-lost");
    expect(error.message).not.toContain("guard state: retained");
    expect(error.message).toContain("registry published: true");
    expect(publicationCount).toBe(1);
    await expect(readFile(guardPath)).resolves.toEqual(foreignBytes);
    await expect(guardIdentity(guardPath)).resolves.toEqual(foreignIdentity);
  });

  test("retains and reports the guard when cleanup fails before publication", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      `PoliceConductUS/example: ${rootPath}\n`,
    );
    const guardPath = `${registrationPath}.lock`;
    const retainedBytes = Buffer.from("retained acquired guard\n");
    let acquiredIdentity:
      | { readonly device: number; readonly inode: number }
      | undefined;
    const store = new CaseHomeRegistrationStore({
      acquireGuard: async (candidateGuardPath) => {
        await writeFile(candidateGuardPath, retainedBytes, {
          flag: "wx",
          mode: 0o600,
        });
        const identity = await guardIdentity(candidateGuardPath);
        acquiredIdentity = identity;
        return {
          identity,
          release: () => Promise.reject(new Error("injected cleanup failure")),
        };
      },
    });

    const registration = store.register({
      configHome,
      caseId: "PoliceConductUS/example",
      rootPath,
    });

    await expect(registration).rejects.toThrow("injected cleanup failure");
    await expect(registration).rejects.toThrow(guardPath);
    await expect(registration).rejects.toThrow("guard state: retained");
    await expect(registration).rejects.toThrow("registry published: false");
    await expect(readFile(guardPath)).resolves.toEqual(retainedBytes);
    await expect(guardIdentity(guardPath)).resolves.toEqual(acquiredIdentity);
    expect((await lstat(guardPath)).isFile()).toBe(true);
  });

  test("retains and reports the guard and published registry when cleanup fails after publication", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    const store = new CaseHomeRegistrationStore({
      acquireGuard: retainGuardOnCleanup("injected cleanup failure"),
    });

    const registration = store.register({
      configHome,
      caseId: "PoliceConductUS/example",
      rootPath,
    });

    await expect(registration).rejects.toThrow("injected cleanup failure");
    await expect(registration).rejects.toThrow(guardPath);
    await expect(registration).rejects.toThrow("guard state: retained");
    await expect(registration).rejects.toThrow("registry published: true");
    await expect(readFile(registrationPath, "utf8")).resolves.toBe(
      `PoliceConductUS/example: ${rootPath}\n`,
    );
    expect((await lstat(guardPath)).isFile()).toBe(true);
  });

  test("reports validation and cleanup failures together without masking publication state", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      "PoliceConductUS/example: [\n",
    );
    const guardPath = `${registrationPath}.lock`;
    const originalBytes = await readFile(registrationPath);
    const store = new CaseHomeRegistrationStore({
      acquireGuard: retainGuardOnCleanup("cleanup after validation failed"),
    });

    const registration = store.register({
      configHome,
      caseId: "PoliceConductUS/example",
      rootPath,
    });

    await expect(registration).rejects.toThrow(
      "Flow sequence in block collection",
    );
    await expect(registration).rejects.toThrow(
      "cleanup after validation failed",
    );
    await expect(registration).rejects.toThrow(guardPath);
    await expect(registration).rejects.toThrow("guard state: retained");
    await expect(registration).rejects.toThrow("registry published: false");
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
    expect((await lstat(guardPath)).isFile()).toBe(true);
  });

  test("reports primary validation and absent-ownership cleanup failures together", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = await writeRegistration(
      configHome,
      "PoliceConductUS/example: [\n",
    );
    const guardPath = `${registrationPath}.lock`;
    const originalBytes = await readFile(registrationPath);
    const store = new CaseHomeRegistrationStore({
      acquireGuard: removeGuardOnCleanup(
        "cleanup after validation removed guard",
      ),
    });

    const error = await rejectionOf(
      store.register({
        configHome,
        caseId: "PoliceConductUS/example",
        rootPath,
      }),
    );

    expect(error.message).toContain("Flow sequence in block collection");
    expect(error.message).toContain("cleanup after validation removed guard");
    expect(error.message).toContain(guardPath);
    expect(error.message).toContain("guard state: absent/ownership-lost");
    expect(error.message).not.toContain("guard state: retained");
    expect(error.message).toContain("registry published: false");
    await expect(readFile(registrationPath)).resolves.toEqual(originalBytes);
    await expect(lstat(guardPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("reports publication and cleanup failures together without masking publication state", async () => {
    const directory = await temporaryDirectory("casegraph-cases-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const rootPath = await createCaseHomeRoot(directory, "example");
    const registrationPath = path.join(configHome, "casehomes.yaml");
    const guardPath = `${registrationPath}.lock`;
    let temporaryPath: string | undefined;
    const store = new CaseHomeRegistrationStore({
      acquireGuard: retainGuardOnCleanup("cleanup after publication failed"),
      publish: async ({ content, temporaryPath: candidatePath }) => {
        temporaryPath = candidatePath;
        await writeFile(candidatePath, content, { flag: "wx", mode: 0o600 });
        throw new Error("primary publication failure");
      },
    });

    const registration = store.register({
      configHome,
      caseId: "PoliceConductUS/example",
      rootPath,
    });

    await expect(registration).rejects.toThrow("primary publication failure");
    await expect(registration).rejects.toThrow(
      "cleanup after publication failed",
    );
    await expect(registration).rejects.toThrow(guardPath);
    await expect(registration).rejects.toThrow("guard state: retained");
    await expect(registration).rejects.toThrow("registry published: false");
    await expect(lstat(registrationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await lstat(temporaryPath ?? "")).isFile()).toBe(true);
    expect((await lstat(guardPath)).isFile()).toBe(true);
  });
});
