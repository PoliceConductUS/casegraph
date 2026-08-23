import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { CaseHomeRegistrationStore } from "./registration.js";
import {
  createGitRunner,
  inspectGitBackedCaseHome,
  type GitRunner,
} from "./index.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const CASE_UID = "tz4a98xxat96iws9zmbrgj3a";

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

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], { cwd });
  return result.stdout.trimEnd();
}

async function initializeRepository(directory: string): Promise<void> {
  await git(directory, ["init", "--initial-branch=main"]);
  await git(directory, ["config", "user.name", "CaseGraph Tests"]);
  await git(directory, ["config", "user.email", "casegraph@example.invalid"]);
}

function strictCaseRoot(
  resources: readonly string[] = [],
  uid = CASE_UID,
): string {
  const resourceLines = resources.map((uid) => `    - ${uid}`).join("\n");
  return [
    "apiVersion: casegraph.policeconduct.org/v1alpha1",
    "kind: Case",
    "metadata:",
    `  uid: ${uid}`,
    "spec:",
    resources.length === 0
      ? "  resources: []"
      : `  resources:\n${resourceLines}`,
    "",
  ].join("\n");
}

async function createCaseHome(input?: {
  readonly commit?: boolean;
  readonly root?: string;
}): Promise<{
  readonly caseFolder: string;
  readonly caseHome: string;
  readonly configHome: string;
  readonly rootPath: string;
}> {
  const caseFolder = await temporaryDirectory("casegraph-folder-");
  const configHome = await temporaryDirectory("casegraph-config-");
  const caseHome = path.join(caseFolder, "casegraph");
  const rootPath = path.join(caseHome, "root.yaml");
  await mkdir(caseHome);
  if (input?.root !== undefined || input?.commit === true) {
    await writeFile(rootPath, input.root ?? strictCaseRoot());
  }
  if (input?.commit === true) {
    await initializeRepository(caseHome);
    await git(caseHome, ["add", "root.yaml"]);
    await git(caseHome, ["commit", "-m", "initial CaseHome"]);
  }
  return { caseFolder, caseHome, configHome, rootPath };
}

async function moveGitDirectoryBehindSymlink(caseHome: string): Promise<{
  readonly externalGitDirectory: string;
  readonly gitLink: string;
}> {
  const externalRoot = await temporaryDirectory("casegraph-external-git-");
  const externalGitDirectory = path.join(externalRoot, "metadata.git");
  const gitLink = path.join(caseHome, ".git");
  await rename(gitLink, externalGitDirectory);
  await symlink(externalGitDirectory, gitLink, "dir");
  return { externalGitDirectory, gitLink };
}

async function snapshotDirectoryBytes(
  directory: string,
  relativeDirectory = "",
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const entryPath = path.join(directory, relativePath);
    const metadata = await lstat(entryPath);
    if (entry.isDirectory()) {
      files[relativePath] =
        `directory:${String(metadata.mode & 0o777)}:${String(metadata.mtimeMs)}`;
      Object.assign(
        files,
        await snapshotDirectoryBytes(directory, relativePath),
      );
    } else if (entry.isSymbolicLink()) {
      files[relativePath] =
        `link:${String(metadata.mode & 0o777)}:${String(metadata.mtimeMs)}:${await readlink(entryPath)}`;
    } else {
      files[relativePath] =
        `file:${String(metadata.mode & 0o777)}:${String(metadata.mtimeMs)}:${(await readFile(entryPath)).toString("base64")}`;
    }
  }
  return files;
}

async function snapshotDirectoryState(
  directory: string,
): Promise<
  | { readonly state: "absent" }
  | { readonly entries: Record<string, string>; readonly state: "present" }
> {
  try {
    return {
      entries: await snapshotDirectoryBytes(directory),
      state: "present",
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { state: "absent" };
    }
    throw error;
  }
}

async function snapshotRepository(caseHome: string, configHome: string) {
  async function optionalBytes(filePath: string): Promise<string | undefined> {
    try {
      return (await readFile(filePath)).toString("base64");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async function snapshotFiles(
    directory: string,
    relativeDirectory = "",
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const entries = await readdir(path.join(directory, relativeDirectory), {
      withFileTypes: true,
    });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (relativeDirectory === "" && entry.name === ".git") continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        Object.assign(files, await snapshotFiles(directory, relativePath));
      } else {
        files[relativePath] = (
          await readFile(path.join(directory, relativePath))
        ).toString("base64");
      }
    }
    return files;
  }

  const rawState = {
    files: await snapshotFiles(caseHome),
    root: await optionalBytes(path.join(caseHome, "root.yaml")),
    config: await optionalBytes(path.join(caseHome, "config.yaml")),
    lock: await optionalBytes(path.join(caseHome, "casegraph.lock.yaml")),
    index: await optionalBytes(path.join(caseHome, ".git", "index")),
    registration: await optionalBytes(path.join(configHome, "casehomes.yaml")),
  };

  const commands = [
    ["status", "--porcelain=v1"],
    ["show-ref"],
    ["branch", "--show-current"],
    ["remote", "-v"],
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
  ] as const;
  const commandState: Record<
    string,
    { exitCode: number; stderr: string; stdout: string }
  > = {};
  for (const args of commands) {
    try {
      const result = await execFileAsync(
        "git",
        ["--no-optional-locks", ...args],
        { cwd: caseHome },
      );
      commandState[args.join(" ")] = {
        exitCode: 0,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      const failure = error as Error & {
        readonly code?: number;
        readonly stderr?: string;
        readonly stdout?: string;
      };
      commandState[args.join(" ")] = {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stderr: failure.stderr ?? failure.message,
        stdout: failure.stdout ?? "",
      };
    }
  }

  return {
    ...rawState,
    commandState,
  };
}

async function snapshotLinkedGitFixture(input: {
  readonly caseHome: string;
  readonly configHome: string;
  readonly gitLink: string;
  readonly metadataDirectory: string;
}): Promise<{
  readonly link: {
    readonly device: number;
    readonly inode: number;
    readonly mode: number;
    readonly modifiedAt: number;
    readonly size: number;
    readonly target: string;
  };
  readonly metadata:
    | { readonly state: "absent" }
    | { readonly entries: Record<string, string>; readonly state: "present" };
  readonly registrationEntries: readonly (readonly [string, string])[];
  readonly repository: Awaited<ReturnType<typeof snapshotRepository>>;
}> {
  const link = await lstat(input.gitLink);
  const registrations = await new CaseHomeRegistrationStore().read(
    input.configHome,
  );
  return {
    link: {
      device: link.dev,
      inode: link.ino,
      mode: link.mode,
      modifiedAt: link.mtimeMs,
      size: link.size,
      target: await readlink(input.gitLink),
    },
    metadata: await snapshotDirectoryState(input.metadataDirectory),
    registrationEntries: [...registrations.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    repository: await snapshotRepository(input.caseHome, input.configHome),
  };
}

describe("exact CaseHome candidate inspection", () => {
  test("reports an absent exact child without creating it", async () => {
    const caseFolder = await temporaryDirectory("casegraph-folder-");
    const configHome = await temporaryDirectory("casegraph-config-");

    const report = await inspectGitBackedCaseHome({
      caseFolder,
      caseId: "PoliceConductUS/example-case",
      configHome,
    });

    expect(report.classification).toBe("absent");
    expect(report.paths).toEqual({
      caseFolder: await realpath(caseFolder),
      caseHome: path.join(await realpath(caseFolder), "casegraph"),
      root: path.join(await realpath(caseFolder), "casegraph", "root.yaml"),
    });
    expect(report.resource).toEqual({ state: "absent" });
    expect(report.repository).toEqual({ state: "absent" });
    expect(report.registration).toEqual({ state: "absent" });
    expect(report.recovery.paths).toEqual([await realpath(caseFolder)]);
    await expect(lstat(report.paths.caseHome)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("distinguishes an empty child from a valid strict non-Git CaseHome", async () => {
    const empty = await createCaseHome();
    const strict = await createCaseHome({ root: strictCaseRoot() });

    const emptyReport = await inspectGitBackedCaseHome({
      caseFolder: empty.caseFolder,
      caseId: "PoliceConductUS/empty",
      configHome: empty.configHome,
    });
    const strictReport = await inspectGitBackedCaseHome({
      caseFolder: strict.caseFolder,
      caseId: "PoliceConductUS/strict",
      configHome: strict.configHome,
    });

    expect(emptyReport.classification).toBe("empty");
    expect(emptyReport.resource).toEqual({ state: "absent" });
    expect(strictReport.classification).toBe("non-git");
    expect(strictReport.resource).toEqual({ state: "valid", count: 1 });
    expect(strictReport.repository).toEqual({ state: "absent" });
    expect(strictReport.registrationEligibility).toEqual({
      eligible: false,
      reasons: ["repository is not an exact primary checkout"],
    });
  });

  test("classifies a file child and a symlink child without reading its target", async () => {
    const fileFolder = await temporaryDirectory("casegraph-file-child-");
    const fileConfig = await temporaryDirectory("casegraph-config-");
    await writeFile(path.join(fileFolder, "casegraph"), "not a directory\n");
    const registered = await createCaseHome({ root: strictCaseRoot() });
    await writeFile(
      path.join(fileConfig, "casehomes.yaml"),
      `PoliceConductUS/file: ${await realpath(registered.rootPath)}\n`,
    );

    const target = await temporaryDirectory("casegraph-secret-target-");
    await writeFile(
      path.join(target, "root.yaml"),
      "SECRET MUST NOT BE READ\n",
    );
    const symlinkFolder = await temporaryDirectory("casegraph-link-child-");
    const symlinkConfig = await temporaryDirectory("casegraph-config-");
    await symlink(target, path.join(symlinkFolder, "casegraph"));
    await writeFile(
      path.join(symlinkConfig, "casehomes.yaml"),
      `PoliceConductUS/link: ${await realpath(registered.rootPath)}\n`,
    );

    let registrationReads = 0;
    const registrationStore = {
      read: () => {
        registrationReads += 1;
        throw new Error("registration must not be inspected");
      },
    };
    const fileReport = await inspectGitBackedCaseHome(
      {
        caseFolder: fileFolder,
        caseId: "PoliceConductUS/file",
        configHome: fileConfig,
      },
      { registrationStore },
    );
    const symlinkReport = await inspectGitBackedCaseHome(
      {
        caseFolder: symlinkFolder,
        caseId: "PoliceConductUS/link",
        configHome: symlinkConfig,
      },
      { registrationStore },
    );

    for (const [report, caseFolder, kind] of [
      [fileReport, fileFolder, "non-directory file"],
      [symlinkReport, symlinkFolder, "symbolic link"],
    ] as const) {
      const canonicalFolder = await realpath(caseFolder);
      const caseHome = path.join(canonicalFolder, "casegraph");
      const root = path.join(caseHome, "root.yaml");
      const identityDiagnostic = `Exact CaseHome child ${caseHome} is a ${kind}`;
      const resourceDiagnostic = `Strict CaseHome resources were not inspected because ${identityDiagnostic}`;
      const repositoryDiagnostic = `Repository was not inspected because ${identityDiagnostic}`;
      const registrationDiagnostic = `Machine registration was not inspected because ${identityDiagnostic}`;
      const readinessReasons = [identityDiagnostic];

      expect(report).toEqual({
        classification: "conflict",
        paths: { caseFolder: canonicalFolder, caseHome, root },
        resource: { state: "not-inspected", diagnostic: resourceDiagnostic },
        repository: {
          state: "not-inspected",
          diagnostic: repositoryDiagnostic,
        },
        registration: {
          state: "not-inspected",
          diagnostic: registrationDiagnostic,
        },
        structuralPushTarget: {
          state: "not-inspected",
          ready: false,
          diagnostic: repositoryDiagnostic,
          provesWritability: false,
        },
        registrationEligibility: {
          eligible: false,
          reasons: readinessReasons,
        },
        mutationReadiness: { ready: false, reasons: readinessReasons },
        diagnostics: [
          identityDiagnostic,
          resourceDiagnostic,
          repositoryDiagnostic,
          registrationDiagnostic,
        ],
        recovery: {
          paths: [canonicalFolder, caseHome],
          remotes: {
            state: "not-inspected",
            diagnostic: repositoryDiagnostic,
          },
          registration: "not-inspected",
        },
      });
    }
    expect(registrationReads).toBe(0);
    expect(JSON.stringify(symlinkReport)).not.toContain(
      "SECRET MUST NOT BE READ",
    );
  });
});

describe("exact primary Git repository reports", () => {
  test("reports committed, dirty, registered, multi-remote state and preserves it", async () => {
    const fixture = await createCaseHome({ commit: true });
    await writeFile(path.join(fixture.caseHome, "notes.txt"), "untracked\n");
    const alphaFetch = path.join(fixture.caseFolder, "alpha-fetch.git");
    const alphaFetchMirror = path.join(
      fixture.caseFolder,
      "alpha-fetch-mirror.git",
    );
    const alphaPush = path.join(fixture.caseFolder, "alpha-push.git");
    const alphaPushMirror = path.join(
      fixture.caseFolder,
      "alpha-push-mirror.git",
    );
    const beta = path.join(fixture.caseFolder, "beta.git");
    await git(fixture.caseHome, ["remote", "add", "alpha", alphaFetch]);
    await git(fixture.caseHome, [
      "remote",
      "set-url",
      "--add",
      "alpha",
      alphaFetchMirror,
    ]);
    await git(fixture.caseHome, [
      "remote",
      "set-url",
      "--push",
      "alpha",
      alphaPush,
    ]);
    await git(fixture.caseHome, [
      "remote",
      "set-url",
      "--add",
      "--push",
      "alpha",
      alphaPushMirror,
    ]);
    await git(fixture.caseHome, ["remote", "add", "beta", beta]);
    await writeFile(
      path.join(fixture.configHome, "casehomes.yaml"),
      `PoliceConductUS/example-case: ${await realpath(fixture.rootPath)}\n`,
    );
    const before = await snapshotRepository(
      fixture.caseHome,
      fixture.configHome,
    );

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/example-case",
      configHome: fixture.configHome,
      selectedRemote: "alpha",
    });

    expect(report.classification).toBe("primary");
    expect(report.resource).toEqual({ state: "valid", count: 1 });
    expect(report.repository).toMatchObject({
      state: "primary",
      topLevel: await realpath(fixture.caseHome),
      branch: "main",
      detached: false,
      unborn: false,
      dirty: true,
      rootTrackedInHead: true,
      upstream: undefined,
    });
    if (report.repository.state !== "primary")
      throw new Error("expected primary");
    expect(report.repository.gitDirectory).toBe(
      path.join(await realpath(fixture.caseHome), ".git"),
    );
    expect(report.repository.commonDirectory).toBe(
      path.join(await realpath(fixture.caseHome), ".git"),
    );
    expect(report.repository.remotes).toEqual([
      {
        name: "alpha",
        fetchUrls: [alphaFetch, alphaFetchMirror],
        pushUrls: [alphaPush, alphaPushMirror],
      },
      { name: "beta", fetchUrls: [beta], pushUrls: [beta] },
    ]);
    expect(report.structuralPushTarget).toEqual({
      state: "known",
      ready: true,
      remote: "alpha",
      pushUrls: [alphaPush, alphaPushMirror],
      provesWritability: false,
    });
    expect(report.registration).toEqual({
      state: "current",
      registeredRoot: await realpath(fixture.rootPath),
    });
    expect(report.registrationEligibility).toEqual({
      eligible: true,
      reasons: [],
    });
    expect(report.mutationReadiness).toEqual({
      ready: false,
      reasons: ["repository working tree is dirty"],
    });
    expect(report.recovery).toMatchObject({
      resourceCount: 1,
      registration: "current",
    });
    expect(report.recovery.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.repository.remotes)).toBe(true);
    expect(Object.isFrozen(report.repository.remotes[0]?.fetchUrls)).toBe(true);
    expect(Object.isFrozen(report.recovery.paths)).toBe(true);

    expect(
      await snapshotRepository(fixture.caseHome, fixture.configHome),
    ).toEqual(before);
  });

  test("preserves raw stale-stat index bytes while inspecting a committed primary", async () => {
    const fixture = await createCaseHome({ commit: true });
    const staleTime = new Date("2001-01-01T00:00:00.000Z");
    await utimes(fixture.rootPath, staleTime, staleTime);
    const indexPath = path.join(fixture.caseHome, ".git", "index");
    const before = await readFile(indexPath);

    await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/stale-index",
      configHome: fixture.configHome,
    });

    await expect(readFile(indexPath)).resolves.toEqual(before);
  });

  test.each([
    ["different", "PoliceConductUS/example", "PoliceConductUS/example"],
    [
      "conflicting-root",
      "PoliceConductUS/existing",
      "PoliceConductUS/requested",
    ],
  ] as const)(
    "makes a %s machine registration ineligible and matches registration-store rejection",
    async (expectedState, registeredCaseId, requestedCaseId) => {
      const fixture = await createCaseHome({ commit: true });
      const other = await createCaseHome({ root: strictCaseRoot() });
      const registeredRoot =
        expectedState === "different"
          ? await realpath(other.rootPath)
          : await realpath(fixture.rootPath);
      const registrationPath = path.join(fixture.configHome, "casehomes.yaml");
      await writeFile(
        registrationPath,
        `${registeredCaseId}: ${registeredRoot}\n`,
      );
      const before = await readFile(registrationPath);

      const report = await inspectGitBackedCaseHome({
        caseFolder: fixture.caseFolder,
        caseId: requestedCaseId,
        configHome: fixture.configHome,
      });

      expect(report.registration.state).toBe(expectedState);
      expect(report.registrationEligibility.eligible).toBe(false);
      expect(report.registrationEligibility.reasons).toEqual([
        expectedState === "different"
          ? "case ID is already registered to a different root"
          : "CaseHome root is already registered to a different case ID",
      ]);
      await expect(
        new CaseHomeRegistrationStore().register({
          configHome: fixture.configHome,
          caseId: requestedCaseId,
          rootPath: fixture.rootPath,
        }),
      ).rejects.toThrow("CaseHome registration conflict");
      await expect(readFile(registrationPath)).resolves.toEqual(before);
    },
  );

  test("reports detached and unborn exact repositories without inventing a branch or commit", async () => {
    const detached = await createCaseHome({ commit: true });
    await git(detached.caseHome, ["checkout", "--detach"]);
    const unborn = await createCaseHome({ root: strictCaseRoot() });
    await initializeRepository(unborn.caseHome);

    const detachedReport = await inspectGitBackedCaseHome({
      caseFolder: detached.caseFolder,
      caseId: "PoliceConductUS/detached",
      configHome: detached.configHome,
    });
    const unbornReport = await inspectGitBackedCaseHome({
      caseFolder: unborn.caseFolder,
      caseId: "PoliceConductUS/unborn",
      configHome: unborn.configHome,
    });

    expect(detachedReport.repository).toMatchObject({
      state: "primary",
      branch: undefined,
      detached: true,
      unborn: false,
    });
    expect(unbornReport.repository).toMatchObject({
      state: "primary",
      branch: "main",
      detached: false,
      unborn: true,
      commit: undefined,
      rootTrackedInHead: false,
    });
    expect(unbornReport.registrationEligibility).toEqual({
      eligible: false,
      reasons: ["repository has no commit", "root.yaml is not tracked in HEAD"],
    });
    expect(unbornReport.structuralPushTarget).toEqual({
      state: "known",
      ready: false,
      remote: undefined,
      pushUrls: [],
      provesWritability: false,
    });
  });

  test("reports a containing repository as inherited non-primary without changing it", async () => {
    const outer = await temporaryDirectory("casegraph-outer-");
    const configHome = await temporaryDirectory("casegraph-config-");
    await initializeRepository(outer);
    await writeFile(path.join(outer, "outer.txt"), "outer\n");
    await git(outer, ["add", "outer.txt"]);
    await git(outer, ["commit", "-m", "outer"]);
    await git(outer, [
      "remote",
      "add",
      "origin",
      path.join(outer, "outer.git"),
    ]);
    const caseFolder = path.join(outer, "matter");
    const caseHome = path.join(caseFolder, "casegraph");
    await mkdir(caseHome, { recursive: true });
    await writeFile(path.join(caseHome, "root.yaml"), strictCaseRoot());
    const before = await snapshotRepository(outer, configHome);

    const report = await inspectGitBackedCaseHome({
      caseFolder,
      caseId: "PoliceConductUS/inherited",
      configHome,
    });

    expect(report.classification).toBe("inherited");
    expect(report.repository).toMatchObject({
      state: "inherited",
      expectedTopLevel: await realpath(caseHome),
      inheritedTopLevel: await realpath(outer),
    });
    expect(report.resource).toEqual({ state: "valid", count: 1 });
    expect(await snapshotRepository(outer, configHome)).toEqual(before);
  });
});

describe("ineligible and invalid candidates", () => {
  test("rejects bare repositories and exact repositories whose configured worktree is different", async () => {
    const bareFolder = await temporaryDirectory("casegraph-bare-folder-");
    const bareConfig = await temporaryDirectory("casegraph-config-");
    const bareHome = path.join(bareFolder, "casegraph");
    await git(bareFolder, ["init", "--bare", bareHome]);

    const mismatch = await createCaseHome({ commit: true });
    const otherWorktree = await temporaryDirectory("casegraph-other-worktree-");
    await git(mismatch.caseHome, ["config", "core.worktree", otherWorktree]);

    const bareReport = await inspectGitBackedCaseHome({
      caseFolder: bareFolder,
      caseId: "PoliceConductUS/bare",
      configHome: bareConfig,
    });
    const mismatchReport = await inspectGitBackedCaseHome({
      caseFolder: mismatch.caseFolder,
      caseId: "PoliceConductUS/mismatch",
      configHome: mismatch.configHome,
    });

    expect(bareReport.classification).toBe("conflict");
    expect(bareReport.repository).toMatchObject({
      state: "ineligible",
      bare: true,
    });
    expect(mismatchReport.classification).toBe("conflict");
    expect(mismatchReport.repository).toMatchObject({
      state: "ineligible",
      expectedTopLevel: await realpath(mismatch.caseHome),
      topLevel: await realpath(otherWorktree),
    });
  });

  test("rejects linked worktree, separate-git-dir, and submodule gitfiles with Git paths", async () => {
    const linkedSource = await createCaseHome({ commit: true });
    const linkedFolder = await temporaryDirectory("casegraph-linked-folder-");
    const linkedHome = path.join(linkedFolder, "casegraph");
    await git(linkedSource.caseHome, [
      "worktree",
      "add",
      linkedHome,
      "-b",
      "linked",
    ]);

    const separateFolder = await temporaryDirectory(
      "casegraph-separate-folder-",
    );
    const separateHome = path.join(separateFolder, "casegraph");
    const separateGit = await temporaryDirectory("casegraph-separate-git-");
    await mkdir(separateHome);
    await git(separateHome, ["init", "--separate-git-dir", separateGit]);
    await writeFile(path.join(separateHome, "root.yaml"), strictCaseRoot());

    const submoduleSource = await createCaseHome({ commit: true });
    const submoduleOuter = await temporaryDirectory(
      "casegraph-submodule-outer-",
    );
    await initializeRepository(submoduleOuter);
    const submoduleFolder = path.join(submoduleOuter, "matter");
    await mkdir(submoduleFolder);
    await git(submoduleOuter, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      submoduleSource.caseHome,
      path.join("matter", "casegraph"),
    ]);

    for (const [name, caseFolder] of [
      ["linked", linkedFolder],
      ["separate", separateFolder],
      ["submodule", submoduleFolder],
    ] as const) {
      const configHome = await temporaryDirectory(`casegraph-${name}-config-`);
      const report = await inspectGitBackedCaseHome({
        caseFolder,
        caseId: `PoliceConductUS/${name}`,
        configHome,
      });
      expect(report.classification).toBe("conflict");
      expect(report.repository.state).toBe("ineligible");
      if (
        report.repository.state !== "ineligible" ||
        report.repository.reason !== "gitfile"
      ) {
        throw new Error("expected an ineligible gitfile checkout");
      }
      expect(report.repository.gitFile).toBe(
        path.join(await realpath(path.join(caseFolder, "casegraph")), ".git"),
      );
      expect(report.repository.gitDirectory.length).toBeGreaterThan(0);
      expect(report.repository.commonDirectory.length).toBeGreaterThan(0);
    }
  });

  test.each([
    ["missing", undefined],
    ["malformed", "apiVersion: [\n"],
    [
      "unknown",
      "apiVersion: unknown/v1\nkind: Case\nmetadata:\n  uid: tz4a98xxat96iws9zmbrgj3a\nspec:\n  resources: []\n",
    ],
    [
      "schema-invalid",
      "apiVersion: casegraph.policeconduct.org/v1alpha1\nkind: Case\nmetadata:\n  uid: ''\nspec:\n  resources: []\n",
    ],
    [
      "non-Case",
      "apiVersion: casegraph.policeconduct.org/v1alpha1\nkind: Other\nmetadata:\n  uid: tz4a98xxat96iws9zmbrgj3a\nspec: {}\n",
    ],
  ])("reports %s strict roots with path context", async (_name, root) => {
    const fixture = await createCaseHome({ root: root ?? undefined });
    if (root === undefined)
      await writeFile(path.join(fixture.caseHome, "other.txt"), "present\n");

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/invalid",
      configHome: fixture.configHome,
    });

    expect(report.classification).toBe("conflict");
    expect(report.resource.state).toBe("invalid");
    expect(report.diagnostics.join("\n")).toContain(fixture.rootPath);
  });

  test("reports rooted storage containment failures through the strict CaseHome reader", async () => {
    const memberUid = "y2xv0j9f4p7m3n8q6r5s1t2u";
    const fixture = await createCaseHome({ root: strictCaseRoot([memberUid]) });
    const outside = await temporaryDirectory("casegraph-outside-resource-");
    await writeFile(path.join(outside, "root.yaml"), "must not be inspected\n");
    await symlink(outside, path.join(fixture.caseHome, memberUid));

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/escape",
      configHome: fixture.configHome,
    });

    expect(report.classification).toBe("conflict");
    expect(report.resource.state).toBe("invalid");
    expect(report.diagnostics.join("\n")).toContain(
      path.join(fixture.caseHome, memberUid, "root.yaml"),
    );
    expect(report.diagnostics.join("\n")).toContain("escapes real CaseHome");
  });

  test("reuses strict traversal paths for complete multi-resource recovery", async () => {
    const memberUid = "y2xv0j9f4p7m3n8q6r5s1t2u";
    const fixture = await createCaseHome({ root: strictCaseRoot([memberUid]) });
    const memberPath = path.join(fixture.caseHome, memberUid, "root.yaml");
    await mkdir(path.dirname(memberPath), { recursive: true });
    await writeFile(memberPath, strictCaseRoot([], memberUid));

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/multi-resource",
      configHome: fixture.configHome,
    });

    expect(report.resource).toEqual({ state: "valid", count: 2 });
    expect(report.recovery.paths).toEqual([
      await realpath(fixture.caseFolder),
      await realpath(fixture.caseHome),
      ...[await realpath(fixture.rootPath), await realpath(memberPath)].sort(),
    ]);
  });

  test.each([
    ["valid-current", "valid", "current"],
    ["valid-different", "valid", "different"],
    ["valid-conflicting-root", "valid", "conflicting-root"],
    ["invalid-invalid", "invalid", "invalid"],
    ["absent-absent", "absent", "absent"],
  ] as const)(
    "reports complete %s state when Git is unavailable",
    async (scenario, resourceState, registrationState) => {
      const memberUid = "y2xv0j9f4p7m3n8q6r5s1t2u";
      const fixture = await createCaseHome({
        root:
          resourceState === "valid"
            ? strictCaseRoot([memberUid])
            : resourceState === "invalid"
              ? "malformed: [\n"
              : undefined,
      });
      const caseId = `PoliceConductUS/${scenario}`;
      const memberPath = path.join(fixture.caseHome, memberUid, "root.yaml");
      if (resourceState === "valid") {
        await mkdir(path.dirname(memberPath), { recursive: true });
        await writeFile(memberPath, strictCaseRoot([], memberUid));
      }
      const other = await createCaseHome({ root: strictCaseRoot() });
      const registrationPath = path.join(fixture.configHome, "casehomes.yaml");
      if (registrationState === "current") {
        await writeFile(
          registrationPath,
          `${caseId}: ${await realpath(fixture.rootPath)}\n`,
        );
      } else if (registrationState === "different") {
        await writeFile(
          registrationPath,
          `${caseId}: ${await realpath(other.rootPath)}\n`,
        );
      } else if (registrationState === "conflicting-root") {
        await writeFile(
          registrationPath,
          `PoliceConductUS/existing: ${await realpath(fixture.rootPath)}\n`,
        );
      } else if (registrationState === "invalid") {
        await writeFile(registrationPath, "malformed: [\n");
      }
      const observed: { args: readonly string[]; cwd: string }[] = [];
      const unavailable: GitRunner = (args, cwd) => {
        observed.push({ args: [...args], cwd });
        return Promise.resolve({
          exitCode: 1,
          stderr: "spawn git ENOENT",
          stdout: "",
        });
      };

      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId,
          configHome: fixture.configHome,
          selectedRemote: "origin",
        },
        { git: unavailable },
      );

      const canonicalFolder = await realpath(fixture.caseFolder);
      const canonicalHome = await realpath(fixture.caseHome);
      const canonicalRoot = path.join(canonicalHome, "root.yaml");
      const gitDiagnostic = "Git is unavailable: spawn git ENOENT";
      const resourceReasons =
        resourceState === "valid"
          ? []
          : ["strict CaseHome resources are invalid"];
      const registrationReasons =
        registrationState === "different"
          ? ["case ID is already registered to a different root"]
          : registrationState === "conflicting-root"
            ? ["CaseHome root is already registered to a different case ID"]
            : registrationState === "invalid"
              ? ["machine registration is invalid"]
              : [];

      expect(report.classification).toBe("unavailable");
      expect(report.paths).toEqual({
        caseFolder: canonicalFolder,
        caseHome: canonicalHome,
        root: canonicalRoot,
      });
      expect(report.repository).toEqual({
        state: "unavailable",
        diagnostic: gitDiagnostic,
      });
      expect(report.resource.state).toBe(resourceState);
      if (resourceState === "valid")
        expect(report.resource).toEqual({ state: "valid", count: 2 });
      if (resourceState === "invalid") {
        expect(report.resource).toMatchObject({ state: "invalid" });
        expect(Object.keys(report.resource).sort()).toEqual([
          "diagnostic",
          "state",
        ]);
        if (report.resource.state === "invalid")
          expect(report.resource.diagnostic).toContain(canonicalRoot);
      }
      if (resourceState === "absent")
        expect(report.resource).toEqual({ state: "absent" });
      expect(report.registration.state).toBe(registrationState);
      if (registrationState === "current")
        expect(report.registration).toEqual({
          state: "current",
          registeredRoot: canonicalRoot,
        });
      if (registrationState === "different")
        expect(report.registration).toEqual({
          state: "different",
          registeredRoot: await realpath(other.rootPath),
        });
      if (registrationState === "conflicting-root")
        expect(report.registration).toEqual({
          state: "conflicting-root",
          registeredCaseId: "PoliceConductUS/existing",
          registeredRoot: canonicalRoot,
        });
      if (registrationState === "invalid") {
        expect(report.registration).toMatchObject({ state: "invalid" });
        expect(Object.keys(report.registration).sort()).toEqual([
          "diagnostic",
          "state",
        ]);
        if (report.registration.state === "invalid")
          expect(report.registration.diagnostic).toContain(registrationPath);
      }
      if (registrationState === "absent")
        expect(report.registration).toEqual({ state: "absent" });
      expect(report.structuralPushTarget).toEqual({
        state: "unavailable",
        ready: false,
        remote: "origin",
        diagnostic: gitDiagnostic,
        provesWritability: false,
      });
      expect(report.registrationEligibility).toEqual({
        eligible: false,
        reasons: [
          "Git is unavailable",
          ...resourceReasons,
          ...registrationReasons,
        ],
      });
      expect(report.mutationReadiness).toEqual({
        ready: false,
        reasons: ["Git is unavailable", ...resourceReasons],
      });
      expect(report.diagnostics).toHaveLength(
        1 +
          (resourceState === "invalid" ? 1 : 0) +
          (registrationState === "invalid" ? 1 : 0),
      );
      expect(report.diagnostics).toContain(gitDiagnostic);
      if (resourceState === "invalid")
        expect(report.diagnostics.join("\n")).toContain(canonicalRoot);
      if (registrationState === "invalid")
        expect(report.diagnostics.join("\n")).toContain(registrationPath);
      expect(report.recovery).toEqual({
        paths:
          resourceState === "valid"
            ? [
                canonicalFolder,
                canonicalHome,
                ...[canonicalRoot, await realpath(memberPath)].sort(),
              ]
            : resourceState === "invalid"
              ? [canonicalFolder, canonicalHome, canonicalRoot]
              : [canonicalFolder, canonicalHome],
        resourceCount: resourceState === "valid" ? 2 : undefined,
        repositoryDiagnostic: gitDiagnostic,
        remotes: { state: "unavailable", diagnostic: gitDiagnostic },
        registration: registrationState,
      });
      expect(observed).toEqual([
        { args: ["--no-optional-locks", "--version"], cwd: process.cwd() },
      ]);
    },
  );

  test("ignores and preserves malformed portable config and arbitrary lock bytes", async () => {
    const fixture = await createCaseHome({ commit: true });
    await writeFile(
      path.join(fixture.caseHome, "config.yaml"),
      "malformed: [\n",
    );
    await writeFile(
      path.join(fixture.caseHome, "casegraph.lock.yaml"),
      "arbitrary lock bytes\0\n",
    );
    const before = await snapshotRepository(
      fixture.caseHome,
      fixture.configHome,
    );

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/config-preserved",
      configHome: fixture.configHome,
    });

    expect(report.classification).toBe("primary");
    expect(
      await snapshotRepository(fixture.caseHome, fixture.configHome),
    ).toEqual(before);
  });

  test("reports an invalid machine registry as ineligible without changing its bytes", async () => {
    const fixture = await createCaseHome({ commit: true });
    const registrationPath = path.join(fixture.configHome, "casehomes.yaml");
    await writeFile(registrationPath, "malformed: [\n");
    const before = await readFile(registrationPath);

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/invalid-registry",
      configHome: fixture.configHome,
    });

    expect(report.classification).toBe("primary");
    expect(report.registration.state).toBe("invalid");
    expect(report.registrationEligibility).toEqual({
      eligible: false,
      reasons: ["machine registration is invalid"],
    });
    expect(await readFile(registrationPath)).toEqual(before);
  });
});

describe("symbolic-link Git metadata", () => {
  test("reports a real external .git symlink exactly without mutation", async () => {
    const fixture = await createCaseHome({ commit: true });
    const remoteUrl = "https://example.invalid/casehome.git";
    await git(fixture.caseHome, ["remote", "add", "origin", remoteUrl]);
    await new CaseHomeRegistrationStore().register({
      configHome: fixture.configHome,
      caseId: "PoliceConductUS/git-symlink",
      rootPath: fixture.rootPath,
    });
    const { externalGitDirectory, gitLink } =
      await moveGitDirectoryBehindSymlink(fixture.caseHome);
    const canonicalFolder = await realpath(fixture.caseFolder);
    const canonicalHome = await realpath(fixture.caseHome);
    const canonicalRoot = path.join(canonicalHome, "root.yaml");
    const canonicalGitLink = path.join(canonicalHome, ".git");
    const canonicalExternalGit = await realpath(externalGitDirectory);
    const before = await snapshotLinkedGitFixture({
      caseHome: fixture.caseHome,
      configHome: fixture.configHome,
      gitLink,
      metadataDirectory: externalGitDirectory,
    });

    const report = await inspectGitBackedCaseHome({
      caseFolder: fixture.caseFolder,
      caseId: "PoliceConductUS/git-symlink",
      configHome: fixture.configHome,
      selectedRemote: "origin",
    });

    const reason = `Exact CaseHome uses an ineligible symbolic-link .git entry at ${canonicalGitLink}`;
    expect(report.classification).toBe("conflict");
    expect(report.paths).toEqual({
      caseFolder: canonicalFolder,
      caseHome: canonicalHome,
      root: canonicalRoot,
    });
    expect(report.resource).toEqual({ state: "valid", count: 1 });
    expect(report.registration).toEqual({
      state: "current",
      registeredRoot: canonicalRoot,
    });
    expect(report.repository).toMatchObject({
      state: "ineligible",
      reason: "git-symlink",
      bare: false,
      expectedTopLevel: canonicalHome,
      topLevel: canonicalHome,
      gitDirectory: canonicalExternalGit,
      commonDirectory: canonicalExternalGit,
      branch: "main",
      detached: false,
      unborn: false,
      dirty: false,
      rootTrackedInHead: true,
      remotes: [
        { name: "origin", fetchUrls: [remoteUrl], pushUrls: [remoteUrl] },
      ],
    });
    expect(report.repository).not.toHaveProperty("gitFile");
    if (
      report.repository.state !== "ineligible" ||
      report.repository.reason !== "git-symlink"
    )
      throw new Error("expected symbolic-link Git metadata report");
    expect(report.repository.commit).toMatch(/^[0-9a-f]{40}$/u);
    expect(report.diagnostics).toEqual([reason]);
    expect(report.registrationEligibility).toEqual({
      eligible: false,
      reasons: [reason],
    });
    expect(report.mutationReadiness).toEqual({
      ready: false,
      reasons: [reason],
    });
    expect(report.structuralPushTarget).toEqual({
      state: "known",
      ready: true,
      remote: "origin",
      pushUrls: [remoteUrl],
      provesWritability: false,
    });
    expect(report.recovery).toEqual({
      paths: [canonicalFolder, canonicalHome, canonicalRoot, canonicalGitLink],
      resourceCount: 1,
      commit: report.repository.commit,
      remotes: {
        state: "known",
        remotes: [
          { name: "origin", fetchUrls: [remoteUrl], pushUrls: [remoteUrl] },
        ],
      },
      registration: "current",
    });
    expect(JSON.stringify(report)).not.toContain("mismatched-top-level");
    expect(JSON.stringify(report)).not.toContain("does not equal");
    expect(
      await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: externalGitDirectory,
      }),
    ).toEqual(before);
  });

  test("uses the git-symlink reason before a truthful differing top-level", async () => {
    const fixture = await createCaseHome({ commit: true });
    const caseId = "PoliceConductUS/git-symlink-mismatch";
    await new CaseHomeRegistrationStore().register({
      configHome: fixture.configHome,
      caseId,
      rootPath: fixture.rootPath,
    });
    const actualCommit = await git(fixture.caseHome, ["rev-parse", "HEAD"]);
    const { externalGitDirectory, gitLink } =
      await moveGitDirectoryBehindSymlink(fixture.caseHome);
    const canonicalHome = await realpath(fixture.caseHome);
    const canonicalExternalGit = await realpath(externalGitDirectory);
    const otherTopLevel = path.join(
      await realpath(path.dirname(externalGitDirectory)),
      "other",
    );
    const commands: string[] = [];
    const runner: GitRunner = (args) => {
      const command = args.slice(1).join(" ");
      commands.push(command);
      const outputs: Record<string, string> = {
        "--version": "git version test\n",
        "rev-parse --absolute-git-dir": `${canonicalExternalGit}\n`,
        "rev-parse --path-format=absolute --git-common-dir": `${canonicalExternalGit}\n`,
        "rev-parse --is-bare-repository": "false\n",
        "rev-parse --verify --quiet HEAD": `${actualCommit}\n`,
        "branch --show-current": "main\n",
        "for-each-ref --format=%(upstream:short) refs/heads/main": "",
        "rev-parse --show-toplevel": `${otherTopLevel}\n`,
        "status --porcelain=v1": "",
        "ls-tree --name-only HEAD -- root.yaml": "root.yaml\n",
        remote: "",
      };
      return Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout: outputs[command] ?? "",
      });
    };
    const before = await snapshotLinkedGitFixture({
      caseHome: fixture.caseHome,
      configHome: fixture.configHome,
      gitLink,
      metadataDirectory: externalGitDirectory,
    });

    const report = await inspectGitBackedCaseHome(
      {
        caseFolder: fixture.caseFolder,
        caseId,
        configHome: fixture.configHome,
      },
      { git: runner },
    );

    const reason = `Exact CaseHome uses an ineligible symbolic-link .git entry at ${path.join(canonicalHome, ".git")}`;
    expect(report.repository).toMatchObject({
      state: "ineligible",
      reason: "git-symlink",
      expectedTopLevel: canonicalHome,
      topLevel: otherTopLevel,
      gitDirectory: canonicalExternalGit,
      commonDirectory: canonicalExternalGit,
    });
    expect(report.repository).not.toHaveProperty("gitFile");
    expect(report.diagnostics).toEqual([reason]);
    expect(report.registrationEligibility.reasons).toEqual([reason]);
    expect(report.mutationReadiness.reasons).toEqual([reason]);
    expect(commands.at(-1)).toBe("remote");
    expect(
      await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: externalGitDirectory,
      }),
    ).toEqual(before);
  });

  test.each(["dangling", "non-git"] as const)(
    "keeps a real %s .git symlink unavailable",
    async (targetState) => {
      const fixture = await createCaseHome({ root: strictCaseRoot() });
      const caseId = `PoliceConductUS/git-symlink-${targetState}`;
      await writeFile(
        path.join(fixture.caseHome, "config.yaml"),
        "ignored config bytes\n",
      );
      await writeFile(
        path.join(fixture.caseHome, "casegraph.lock.yaml"),
        "ignored lock bytes\n",
      );
      await new CaseHomeRegistrationStore().register({
        configHome: fixture.configHome,
        caseId,
        rootPath: fixture.rootPath,
      });
      const externalRoot = await temporaryDirectory("casegraph-git-link-");
      const target = path.join(externalRoot, "metadata.git");
      if (targetState === "non-git") {
        await mkdir(target);
        await writeFile(path.join(target, "not-git.txt"), "not Git metadata\n");
      }
      const gitLink = path.join(fixture.caseHome, ".git");
      await symlink(target, gitLink);
      const canonicalFolder = await realpath(fixture.caseFolder);
      const canonicalHome = await realpath(fixture.caseHome);
      const canonicalRoot = path.join(canonicalHome, "root.yaml");
      const canonicalConfig = path.join(canonicalHome, "config.yaml");
      const canonicalLock = path.join(canonicalHome, "casegraph.lock.yaml");
      const canonicalGitLink = path.join(canonicalHome, ".git");
      const before = await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: target,
      });

      const report = await inspectGitBackedCaseHome({
        caseFolder: fixture.caseFolder,
        caseId,
        configHome: fixture.configHome,
        selectedRemote: "origin",
      });

      expect(report.classification).toBe("unavailable");
      expect(report.registration).toEqual({
        state: "current",
        registeredRoot: canonicalRoot,
      });
      expect(report.repository.state).toBe("unavailable");
      if (report.repository.state !== "unavailable")
        throw new Error("expected unavailable repository");
      expect(Object.keys(report.repository).sort()).toEqual([
        "diagnostic",
        "state",
      ]);
      expect(report.repository.diagnostic).toContain(
        "git rev-parse --absolute-git-dir",
      );
      expect(report.structuralPushTarget).toMatchObject({
        state: "unavailable",
        ready: false,
        remote: "origin",
        provesWritability: false,
      });
      expect(report.structuralPushTarget).not.toHaveProperty("pushUrls");
      expect(report.recovery.remotes).toMatchObject({ state: "unavailable" });
      expect(report.recovery.remotes).not.toHaveProperty("remotes");
      expect(report.recovery.paths).toEqual([
        canonicalFolder,
        canonicalHome,
        canonicalRoot,
        canonicalConfig,
        canonicalLock,
        canonicalGitLink,
      ]);
      expect(JSON.stringify(report)).not.toContain("git-symlink");
      expect(JSON.stringify(report)).not.toContain("mismatched-top-level");
      expect(
        await snapshotLinkedGitFixture({
          caseHome: fixture.caseHome,
          configHome: fixture.configHome,
          gitLink,
          metadataDirectory: target,
        }),
      ).toEqual(before);
    },
  );

  test("keeps a real .git symlink to bare metadata in the bare variant", async () => {
    const fixture = await createCaseHome({ root: strictCaseRoot() });
    const caseId = "PoliceConductUS/git-symlink-bare";
    const externalRoot = await temporaryDirectory("casegraph-linked-bare-");
    const bareGit = path.join(externalRoot, "metadata.git");
    await git(externalRoot, [
      "init",
      "--bare",
      "--initial-branch=main",
      bareGit,
    ]);
    await new CaseHomeRegistrationStore().register({
      configHome: fixture.configHome,
      caseId,
      rootPath: fixture.rootPath,
    });
    const gitLink = path.join(fixture.caseHome, ".git");
    await symlink(bareGit, gitLink);
    const canonicalGitLink = path.join(
      await realpath(fixture.caseHome),
      ".git",
    );
    const commands: string[] = [];
    const production = createGitRunner();
    const before = await snapshotLinkedGitFixture({
      caseHome: fixture.caseHome,
      configHome: fixture.configHome,
      gitLink,
      metadataDirectory: bareGit,
    });

    const report = await inspectGitBackedCaseHome(
      {
        caseFolder: fixture.caseFolder,
        caseId,
        configHome: fixture.configHome,
      },
      {
        git: async (args, cwd) => {
          commands.push(args.slice(1).join(" "));
          return production(args, cwd);
        },
      },
    );

    expect(report.classification).toBe("conflict");
    expect(report.repository).toEqual({
      state: "ineligible",
      reason: "bare",
      bare: true,
      gitDirectory: await realpath(bareGit),
      commonDirectory: await realpath(bareGit),
      unborn: true,
      branch: "main",
      detached: false,
      remotes: [],
    });
    expect(report.repository).not.toHaveProperty("gitFile");
    expect(report.repository).not.toHaveProperty("topLevel");
    expect(report.registration).toEqual({
      state: "current",
      registeredRoot: await realpath(fixture.rootPath),
    });
    expect(report.recovery.paths).toContain(canonicalGitLink);
    expect(report.recovery.remotes).toEqual({ state: "known", remotes: [] });
    expect(
      commands.some(
        (command) =>
          command === "rev-parse --show-toplevel" ||
          command.startsWith("status ") ||
          command.startsWith("ls-tree "),
      ),
    ).toBe(false);
    expect(
      await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: bareGit,
      }),
    ).toEqual(before);
  });

  test.each([
    ["Git availability", "--version", false],
    ["absolute Git directory", "rev-parse --absolute-git-dir", false],
    [
      "common Git directory",
      "rev-parse --path-format=absolute --git-common-dir",
      false,
    ],
    ["bare state", "rev-parse --is-bare-repository", false],
    ["HEAD", "rev-parse --verify --quiet HEAD", false],
    ["branch", "branch --show-current", true],
    [
      "upstream",
      "for-each-ref --format=%(upstream:short) refs/heads/main",
      true,
    ],
    ["remote names", "remote", true],
    ["fetch URL", "remote get-url --all origin", true],
    ["push URL", "remote get-url --push --all origin", true],
  ] as const)(
    "keeps symbolic-link bare metadata unavailable after failed %s inspection",
    async (_name, failed, preservesCommit) => {
      const fixture = await createCaseHome({ root: strictCaseRoot() });
      const caseId = "PoliceConductUS/git-symlink-bare-failure";
      const externalRoot = await temporaryDirectory("casegraph-linked-bare-");
      const bareGit = path.join(externalRoot, "metadata.git");
      await git(externalRoot, [
        "init",
        "--bare",
        "--initial-branch=main",
        bareGit,
      ]);
      await git(externalRoot, [
        "--git-dir",
        bareGit,
        "remote",
        "add",
        "origin",
        "origin-actual",
      ]);
      await new CaseHomeRegistrationStore().register({
        configHome: fixture.configHome,
        caseId,
        rootPath: fixture.rootPath,
      });
      const gitLink = path.join(fixture.caseHome, ".git");
      await symlink(bareGit, gitLink);
      const canonicalHome = await realpath(fixture.caseHome);
      const canonicalBareGit = await realpath(bareGit);
      const commands: string[] = [];
      const runner: GitRunner = (args) => {
        const command = args.slice(1).join(" ");
        commands.push(command);
        if (command === failed)
          return Promise.resolve({
            exitCode: 74,
            stderr: "injected symbolic-link bare failure\n",
            stdout: "",
          });
        const outputs: Record<string, string> = {
          "--version": "git version test\n",
          "rev-parse --absolute-git-dir": `${canonicalBareGit}\n`,
          "rev-parse --path-format=absolute --git-common-dir": `${canonicalBareGit}\n`,
          "rev-parse --is-bare-repository": "true\n",
          "rev-parse --verify --quiet HEAD": `${"b".repeat(40)}\n`,
          "branch --show-current": "main\n",
          "for-each-ref --format=%(upstream:short) refs/heads/main": "",
          remote: "origin\n",
          "remote get-url --all origin": "origin-fetch\n",
          "remote get-url --push --all origin": "origin-push\n",
        };
        return Promise.resolve({
          exitCode: 0,
          stderr: "",
          stdout: outputs[command] ?? "",
        });
      };
      const before = await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: bareGit,
      });

      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId,
          configHome: fixture.configHome,
          selectedRemote: "origin",
        },
        { git: runner },
      );

      expect(report.classification).toBe("unavailable");
      expect(report.registration).toEqual({
        state: "current",
        registeredRoot: await realpath(fixture.rootPath),
      });
      expect(report.repository.state).toBe("unavailable");
      if (report.repository.state !== "unavailable")
        throw new Error("expected unavailable linked bare inspection");
      expect(Object.keys(report.repository).sort()).toEqual([
        "diagnostic",
        "state",
      ]);
      expect(report.structuralPushTarget).toEqual({
        state: "unavailable",
        ready: false,
        remote: "origin",
        diagnostic: report.repository.diagnostic,
        provesWritability: false,
      });
      expect(report.recovery.remotes).toEqual({
        state: "unavailable",
        diagnostic: report.repository.diagnostic,
      });
      if (preservesCommit) expect(report.recovery.commit).toBe("b".repeat(40));
      else expect(report.recovery).not.toHaveProperty("commit");
      expect(report.recovery.paths).toContain(path.join(canonicalHome, ".git"));
      expect(JSON.stringify(report)).not.toContain("git-symlink");
      expect(JSON.stringify(report)).not.toContain("mismatched-top-level");
      expect(report.structuralPushTarget).not.toHaveProperty("pushUrls");
      expect(report.recovery.remotes).not.toHaveProperty("remotes");
      expect(
        commands.some(
          (command) =>
            command === "rev-parse --show-toplevel" ||
            command.startsWith("status ") ||
            command.startsWith("ls-tree "),
        ),
      ).toBe(false);
      expect(commands.at(-1)).toBe(failed);
      expect(
        await snapshotLinkedGitFixture({
          caseHome: fixture.caseHome,
          configHome: fixture.configHome,
          gitLink,
          metadataDirectory: bareGit,
        }),
      ).toEqual(before);
    },
  );
});

describe("Git runner boundary", () => {
  test("uses git with argument arrays and inspection never asks for a mutation command", async () => {
    const fixture = await createCaseHome({ commit: true });
    const production = createGitRunner();
    const observed: string[][] = [];
    const recordingRunner: GitRunner = async (args, cwd) => {
      observed.push([...args]);
      return production(args, cwd);
    };

    await inspectGitBackedCaseHome(
      {
        caseFolder: fixture.caseFolder,
        caseId: "PoliceConductUS/arguments",
        configHome: fixture.configHome,
      },
      {
        git: recordingRunner,
        registrationStore: new CaseHomeRegistrationStore(),
      },
    );

    expect(observed.every((args) => args[0] === "--no-optional-locks")).toBe(
      true,
    );
    const normalize = (args: readonly string[]) =>
      args[0] === "--no-optional-locks" ? args.slice(1) : [...args];
    const normalized = observed.map(normalize);
    expect(normalized[0]).toEqual(["--version"]);
    const forbidden = ["add", "commit", "push", "init", "worktree", "clone"];
    const containsMutation = (commands: readonly (readonly string[])[]) =>
      commands.some(
        (args) =>
          (args[0] === "remote" &&
            ["add", "set-url", "remove"].includes(args[1] ?? "")) ||
          forbidden.includes(args[0] ?? ""),
      );
    expect(
      containsMutation([
        normalize([
          "--no-optional-locks",
          "remote",
          "add",
          "origin",
          "forbidden",
        ]),
        normalize([
          "--no-optional-locks",
          "remote",
          "set-url",
          "origin",
          "forbidden",
        ]),
      ]),
    ).toBe(true);
    expect(containsMutation(normalized)).toBe(false);
  });
});

describe("required Git result classification", () => {
  const success = (stdout = "") => ({ exitCode: 0, stderr: "", stdout });

  test.each([
    ["Git availability", "--version", false],
    ["absolute Git directory", "rev-parse --absolute-git-dir", false],
    [
      "common Git directory",
      "rev-parse --path-format=absolute --git-common-dir",
      false,
    ],
    ["bare state", "rev-parse --is-bare-repository", false],
    ["HEAD", "rev-parse --verify --quiet HEAD", false],
    ["branch", "branch --show-current", true],
    [
      "upstream",
      "for-each-ref --format=%(upstream:short) refs/heads/main",
      true,
    ],
    ["top level", "rev-parse --show-toplevel", true],
    ["status", "status --porcelain=v1", true],
    ["tracked root", "ls-tree --name-only HEAD -- root.yaml", true],
    ["remote names", "remote", true],
    ["first fetch URL", "remote get-url --all alpha", true],
    ["first push URL", "remote get-url --push --all alpha", true],
    ["later fetch URL", "remote get-url --all beta", true],
    ["later push URL", "remote get-url --push --all beta", true],
  ] as const)(
    "keeps symbolic-link metadata unavailable after failed %s inspection",
    async (_name, failed, preservesCommit) => {
      const fixture = await createCaseHome({ commit: true });
      const caseId = "PoliceConductUS/git-symlink-failure";
      await git(fixture.caseHome, ["remote", "add", "alpha", "alpha-actual"]);
      await git(fixture.caseHome, ["remote", "add", "beta", "beta-actual"]);
      const actualCommit = await git(fixture.caseHome, ["rev-parse", "HEAD"]);
      await new CaseHomeRegistrationStore().register({
        configHome: fixture.configHome,
        caseId,
        rootPath: fixture.rootPath,
      });
      const { externalGitDirectory, gitLink } =
        await moveGitDirectoryBehindSymlink(fixture.caseHome);
      const canonicalFolder = await realpath(fixture.caseFolder);
      const canonicalHome = await realpath(fixture.caseHome);
      const canonicalRoot = path.join(canonicalHome, "root.yaml");
      const canonicalGitLink = path.join(canonicalHome, ".git");
      const canonicalExternalGit = await realpath(externalGitDirectory);
      const commands: string[] = [];
      const runner: GitRunner = (args) => {
        const command = args.slice(1).join(" ");
        commands.push(command);
        if (command === failed)
          return Promise.resolve({
            exitCode: 73,
            stderr: "injected symbolic-link inspection failure\n",
            stdout: "",
          });
        const outputs: Record<string, string> = {
          "--version": "git version test\n",
          "rev-parse --absolute-git-dir": `${canonicalExternalGit}\n`,
          "rev-parse --path-format=absolute --git-common-dir": `${canonicalExternalGit}\n`,
          "rev-parse --is-bare-repository": "false\n",
          "rev-parse --verify --quiet HEAD": `${actualCommit}\n`,
          "branch --show-current": "main\n",
          "for-each-ref --format=%(upstream:short) refs/heads/main": "",
          "rev-parse --show-toplevel": `${canonicalHome}\n`,
          "status --porcelain=v1": "",
          "ls-tree --name-only HEAD -- root.yaml": "root.yaml\n",
          remote: "alpha\nbeta\n",
          "remote get-url --all alpha": "alpha-fetch\n",
          "remote get-url --push --all alpha": "alpha-push\n",
          "remote get-url --all beta": "beta-fetch\n",
          "remote get-url --push --all beta": "beta-push\n",
        };
        return Promise.resolve(success(outputs[command] ?? ""));
      };
      const before = await snapshotLinkedGitFixture({
        caseHome: fixture.caseHome,
        configHome: fixture.configHome,
        gitLink,
        metadataDirectory: externalGitDirectory,
      });

      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId,
          configHome: fixture.configHome,
          selectedRemote: "beta",
        },
        { git: runner },
      );

      expect(report.classification).toBe("unavailable");
      expect(report.resource).toEqual({ state: "valid", count: 1 });
      expect(report.registration).toEqual({
        state: "current",
        registeredRoot: canonicalRoot,
      });
      expect(report.repository.state).toBe("unavailable");
      if (report.repository.state !== "unavailable")
        throw new Error("expected unavailable symbolic-link inspection");
      expect(Object.keys(report.repository).sort()).toEqual([
        "diagnostic",
        "state",
      ]);
      expect(report.repository.diagnostic).toContain(
        "injected symbolic-link inspection failure",
      );
      expect(report.structuralPushTarget).toEqual({
        state: "unavailable",
        ready: false,
        remote: "beta",
        diagnostic: report.repository.diagnostic,
        provesWritability: false,
      });
      expect(report.recovery).toEqual({
        paths: [
          canonicalFolder,
          canonicalHome,
          canonicalRoot,
          canonicalGitLink,
        ],
        resourceCount: 1,
        ...(preservesCommit ? { commit: actualCommit } : {}),
        repositoryDiagnostic: report.repository.diagnostic,
        remotes: {
          state: "unavailable",
          diagnostic: report.repository.diagnostic,
        },
        registration: "current",
      });
      expect(report.registrationEligibility.reasons).toContain(
        failed === "--version"
          ? "Git is unavailable"
          : report.repository.diagnostic,
      );
      expect(report.mutationReadiness.reasons).toContain(
        failed === "--version"
          ? "Git is unavailable"
          : report.repository.diagnostic,
      );
      expect(report.structuralPushTarget).not.toHaveProperty("pushUrls");
      expect(report.recovery.remotes).not.toHaveProperty("remotes");
      expect(JSON.stringify(report)).not.toContain("git-symlink");
      expect(JSON.stringify(report)).not.toContain("mismatched-top-level");
      expect(JSON.stringify(report)).not.toContain("alpha-fetch");
      expect(JSON.stringify(report)).not.toContain("alpha-push");
      expect(commands.at(-1)).toBe(failed);
      expect(
        await snapshotLinkedGitFixture({
          caseHome: fixture.caseHome,
          configHome: fixture.configHome,
          gitLink,
          metadataDirectory: externalGitDirectory,
        }),
      ).toEqual(before);
    },
  );

  test.each([
    ["absolute git directory", "rev-parse --absolute-git-dir", false],
    [
      "common directory",
      "rev-parse --path-format=absolute --git-common-dir",
      false,
    ],
    ["bare state", "rev-parse --is-bare-repository", false],
    ["top level", "rev-parse --show-toplevel", true],
    ["HEAD", "rev-parse --verify --quiet HEAD", false],
    ["branch", "branch --show-current", true],
    ["status", "status --porcelain=v1", true],
    ["tracked root", "ls-tree --name-only HEAD -- root.yaml", true],
    [
      "upstream",
      "for-each-ref --format=%(upstream:short) refs/heads/main",
      true,
    ],
    ["remote names", "remote", true],
    ["fetch URL", "remote get-url --all origin", true],
    ["push URL", "remote get-url --push --all origin", true],
  ] as const)(
    "makes a failed %s command unavailable",
    async (_name, failed, preservesCommit) => {
      const fixture = await createCaseHome({ root: strictCaseRoot() });
      await mkdir(path.join(fixture.caseHome, ".git"));
      const canonicalHome = await realpath(fixture.caseHome);
      const commands: string[] = [];
      const runner: GitRunner = (args) => {
        const command = args.slice(1).join(" ");
        commands.push(command);
        if (command === failed)
          return Promise.resolve({
            exitCode: 73,
            stderr: "injected required-command failure\n",
            stdout: "",
          });
        const outputs: Record<string, string> = {
          "--version": "git version test\n",
          "rev-parse --absolute-git-dir": `${path.join(canonicalHome, ".git")}\n`,
          "rev-parse --path-format=absolute --git-common-dir": `${path.join(canonicalHome, ".git")}\n`,
          "rev-parse --is-bare-repository": "false\n",
          "rev-parse --show-toplevel": `${canonicalHome}\n`,
          "rev-parse --verify --quiet HEAD": `${"a".repeat(40)}\n`,
          "branch --show-current": "main\n",
          "status --porcelain=v1": "",
          "ls-tree --name-only HEAD -- root.yaml": "root.yaml\n",
          "for-each-ref --format=%(upstream:short) refs/heads/main": "",
          remote: "origin\n",
          "remote get-url --all origin": "fetch.example\n",
          "remote get-url --push --all origin": "push.example\n",
        };
        return Promise.resolve(success(outputs[command] ?? ""));
      };

      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId: "PoliceConductUS/required-command",
          configHome: fixture.configHome,
          selectedRemote: "origin",
        },
        { git: runner },
      );

      expect(report.classification).toBe("unavailable");
      expect(report.repository).toMatchObject({ state: "unavailable" });
      if (report.repository.state !== "unavailable")
        throw new Error("expected unavailable repository");
      expect(report.repository.diagnostic).toContain(failed);
      expect(report.repository.diagnostic).toContain("exit 73");
      expect(report.repository.diagnostic).toContain(
        "injected required-command failure",
      );
      expect(report.structuralPushTarget).toEqual({
        state: "unavailable",
        ready: false,
        remote: "origin",
        diagnostic: report.repository.diagnostic,
        provesWritability: false,
      });
      expect(report.recovery.remotes).toEqual({
        state: "unavailable",
        diagnostic: report.repository.diagnostic,
      });
      expect(report.recovery).toMatchObject({
        repositoryDiagnostic: report.repository.diagnostic,
      });
      if (preservesCommit) expect(report.recovery.commit).toBe("a".repeat(40));
      else expect(report.recovery).not.toHaveProperty("commit");
      expect(report.registrationEligibility.reasons).toContain(
        report.repository.diagnostic,
      );
      expect(report.mutationReadiness.reasons).toContain(
        report.repository.diagnostic,
      );
      expect(commands.at(-1)).toBe(failed);
    },
  );

  test.each([
    [128, "", ""],
    [127, "", "fatal: not a git repository\n"],
    [128, "unexpected", "fatal: not a git repository\n"],
    [128, "", "permission denied\n"],
    [128, "", "fatal: not a git repository\nsecond line\n"],
  ] as const)(
    "does not treat mismatched no-repository tuple %s/%s/%s as absent",
    async (exitCode, stdout, stderr) => {
      const fixture = await createCaseHome({ root: strictCaseRoot() });
      const runner: GitRunner = (args) =>
        Promise.resolve(
          args.slice(1).join(" ") === "--version"
            ? success("git version test\n")
            : { exitCode, stdout, stderr },
        );
      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId: "PoliceConductUS/no-repository-tuple",
          configHome: fixture.configHome,
        },
        { git: runner },
      );
      expect(report.classification).toBe("unavailable");
      expect(report.repository.state).toBe("unavailable");
    },
  );

  test("does not accept the no-repository tuple when the exact .git entry exists", async () => {
    const fixture = await createCaseHome({ root: strictCaseRoot() });
    await mkdir(path.join(fixture.caseHome, ".git"));
    const runner: GitRunner = (args) =>
      Promise.resolve(
        args.slice(1).join(" ") === "--version"
          ? success("git version test\n")
          : {
              exitCode: 128,
              stdout: "",
              stderr: "fatal: not a git repository\n",
            },
      );
    const report = await inspectGitBackedCaseHome(
      {
        caseFolder: fixture.caseFolder,
        caseId: "PoliceConductUS/no-repository-precondition",
        configHome: fixture.configHome,
      },
      { git: runner },
    );
    expect(report.repository.state).toBe("unavailable");
  });

  test.each([
    [2, "", ""],
    [1, "unexpected", ""],
    [1, "", "unexpected"],
  ] as const)(
    "does not treat mismatched unborn tuple %s/%s/%s as unborn",
    async (exitCode, stdout, stderr) => {
      const fixture = await createCaseHome({ root: strictCaseRoot() });
      await mkdir(path.join(fixture.caseHome, ".git"));
      const canonicalHome = await realpath(fixture.caseHome);
      const runner: GitRunner = (args) => {
        const command = args.slice(1).join(" ");
        const outputs: Record<string, string> = {
          "--version": "git version test\n",
          "rev-parse --absolute-git-dir": `${path.join(canonicalHome, ".git")}\n`,
          "rev-parse --path-format=absolute --git-common-dir": `${path.join(canonicalHome, ".git")}\n`,
          "rev-parse --is-bare-repository": "false\n",
          "branch --show-current": "main\n",
          "for-each-ref --format=%(upstream:short) refs/heads/main": "",
          "rev-parse --show-toplevel": `${canonicalHome}\n`,
          "status --porcelain=v1": "",
          remote: "",
        };
        return Promise.resolve(
          command === "rev-parse --verify --quiet HEAD"
            ? { exitCode, stdout, stderr }
            : success(outputs[command] ?? ""),
        );
      };
      const report = await inspectGitBackedCaseHome(
        {
          caseFolder: fixture.caseFolder,
          caseId: "PoliceConductUS/unborn-tuple",
          configHome: fixture.configHome,
        },
        { git: runner },
      );
      expect(report.repository.state).toBe("unavailable");
    },
  );

  test("discards an earlier remote when a later URL query fails", async () => {
    const fixture = await createCaseHome({ root: strictCaseRoot() });
    await mkdir(path.join(fixture.caseHome, ".git"));
    const canonicalHome = await realpath(fixture.caseHome);
    const runner: GitRunner = (args) => {
      const command = args.slice(1).join(" ");
      if (command === "remote get-url --all beta")
        return Promise.resolve({
          exitCode: 9,
          stderr: "later remote failed\n",
          stdout: "",
        });
      const outputs: Record<string, string> = {
        "--version": "git version test\n",
        "rev-parse --absolute-git-dir": `${path.join(canonicalHome, ".git")}\n`,
        "rev-parse --path-format=absolute --git-common-dir": `${path.join(canonicalHome, ".git")}\n`,
        "rev-parse --is-bare-repository": "false\n",
        "rev-parse --show-toplevel": `${canonicalHome}\n`,
        "rev-parse --verify --quiet HEAD": `${"a".repeat(40)}\n`,
        "branch --show-current": "main\n",
        "status --porcelain=v1": "",
        "ls-tree --name-only HEAD -- root.yaml": "root.yaml\n",
        "for-each-ref --format=%(upstream:short) refs/heads/main": "",
        remote: "alpha\nbeta\n",
        "remote get-url --all alpha": "alpha-fetch\n",
        "remote get-url --push --all alpha": "alpha-push\n",
      };
      return Promise.resolve(success(outputs[command] ?? ""));
    };
    const report = await inspectGitBackedCaseHome(
      {
        caseFolder: fixture.caseFolder,
        caseId: "PoliceConductUS/atomic-remotes",
        configHome: fixture.configHome,
      },
      { git: runner },
    );
    expect(report.repository).toMatchObject({ state: "unavailable" });
    expect(report.structuralPushTarget).not.toHaveProperty("pushUrls");
    expect(report.recovery.remotes).not.toHaveProperty("remotes");
    expect(JSON.stringify(report)).not.toContain("alpha-fetch");
  });
});

describe("bare repository report", () => {
  test.each([false, true])(
    "reports an exact %s bare repository without worktree facts",
    async (committed) => {
      const caseFolder = await temporaryDirectory("casegraph-bare-exact-");
      const configHome = await temporaryDirectory("casegraph-config-");
      const caseHome = path.join(caseFolder, "casegraph");
      await git(caseFolder, [
        "init",
        "--bare",
        "--initial-branch=main",
        caseHome,
      ]);
      if (committed) {
        const source = await createCaseHome({ commit: true });
        await git(source.caseHome, ["remote", "add", "bare-target", caseHome]);
        await git(source.caseHome, ["push", "bare-target", "main:main"]);
      }
      const remoteUrl = path.join(caseFolder, "origin.git");
      await git(caseHome, ["remote", "add", "origin", remoteUrl]);
      const production = createGitRunner();
      const commands: readonly string[][] = [];
      const mutableCommands = commands as string[][];
      const report = await inspectGitBackedCaseHome(
        {
          caseFolder,
          caseId: `PoliceConductUS/bare-${String(committed)}`,
          configHome,
          selectedRemote: "origin",
        },
        {
          git: async (args, cwd) => {
            mutableCommands.push([...args]);
            return production(args, cwd);
          },
        },
      );
      expect(report.classification).toBe("conflict");
      if (
        report.repository.state !== "ineligible" ||
        report.repository.reason !== "bare"
      )
        throw new Error("expected exact bare repository report");
      if (committed)
        expect(report.repository.commit).toMatch(/^[0-9a-f]{40}$/u);
      else expect(report.repository.commit).toBeUndefined();
      expect(report.repository).toEqual({
        state: "ineligible",
        reason: "bare",
        bare: true,
        gitDirectory: await realpath(caseHome),
        commonDirectory: await realpath(caseHome),
        ...(committed ? { commit: report.repository.commit } : {}),
        unborn: !committed,
        branch: "main",
        detached: false,
        remotes: [
          { name: "origin", fetchUrls: [remoteUrl], pushUrls: [remoteUrl] },
        ],
      });
      if (committed) expect(report.repository).toHaveProperty("commit");
      else expect(report.repository).not.toHaveProperty("commit");
      expect(report.repository).not.toHaveProperty("upstream");
      expect(Object.keys(report.repository).sort()).toEqual(
        [
          "bare",
          "branch",
          "commonDirectory",
          ...(committed ? ["commit"] : []),
          "detached",
          "gitDirectory",
          "reason",
          "remotes",
          "state",
          "unborn",
        ].sort(),
      );
      for (const property of [
        "topLevel",
        "dirty",
        "rootTrackedInHead",
        "expectedTopLevel",
        "gitFile",
      ])
        expect(report.repository).not.toHaveProperty(property);
      const normalized = commands.map((args) => args.slice(1));
      expect(
        normalized.some(
          (args) =>
            args.join(" ") === "rev-parse --show-toplevel" ||
            args[0] === "status" ||
            args[0] === "ls-tree",
        ),
      ).toBe(false);
      expect(report.structuralPushTarget).toEqual({
        state: "known",
        ready: true,
        remote: "origin",
        pushUrls: [remoteUrl],
        provesWritability: false,
      });
      expect(report.recovery.remotes).toEqual({
        state: "known",
        remotes: [
          { name: "origin", fetchUrls: [remoteUrl], pushUrls: [remoteUrl] },
        ],
      });
      if (committed) expect(report.recovery).toHaveProperty("commit");
      else expect(report.recovery).not.toHaveProperty("commit");
      expect(report.recovery).not.toHaveProperty("repositoryDiagnostic");
      const bareReason = `Exact CaseHome repository at ${await realpath(caseHome)} is bare`;
      expect(report.registrationEligibility).toEqual({
        eligible: false,
        reasons: [bareReason],
      });
      expect(report.mutationReadiness).toEqual({
        ready: false,
        reasons: [bareReason],
      });
    },
  );

  test("omits absent branch and upstream keys for a detached bare repository", async () => {
    const caseFolder = await temporaryDirectory("casegraph-bare-detached-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const caseHome = path.join(caseFolder, "casegraph");
    await git(caseFolder, [
      "init",
      "--bare",
      "--initial-branch=main",
      caseHome,
    ]);
    const source = await createCaseHome({ commit: true });
    await git(source.caseHome, ["remote", "add", "bare-target", caseHome]);
    await git(source.caseHome, ["push", "bare-target", "main:main"]);
    const commit = await git(caseHome, ["rev-parse", "HEAD"]);
    await git(caseHome, ["update-ref", "--no-deref", "HEAD", commit]);

    const report = await inspectGitBackedCaseHome({
      caseFolder,
      caseId: "PoliceConductUS/bare-detached",
      configHome,
    });

    expect(report.repository).toMatchObject({
      state: "ineligible",
      reason: "bare",
      bare: true,
      commit,
      unborn: false,
      detached: true,
    });
    expect(report.repository).not.toHaveProperty("branch");
    expect(report.repository).not.toHaveProperty("upstream");
    expect(Object.keys(report.repository).sort()).toEqual(
      [
        "bare",
        "commit",
        "commonDirectory",
        "detached",
        "gitDirectory",
        "reason",
        "remotes",
        "state",
        "unborn",
      ].sort(),
    );
    const bareReason = `Exact CaseHome repository at ${await realpath(caseHome)} is bare`;
    expect(report.registrationEligibility.reasons).toEqual([bareReason]);
    expect(report.mutationReadiness.reasons).toEqual([bareReason]);
  });

  test.each([
    "remote",
    "remote get-url --all origin",
    "remote get-url --push --all origin",
  ])("makes a bare %s failure atomically unavailable", async (failed) => {
    const caseFolder = await temporaryDirectory("casegraph-bare-failure-");
    const configHome = await temporaryDirectory("casegraph-config-");
    const caseHome = path.join(caseFolder, "casegraph");
    await git(caseFolder, [
      "init",
      "--bare",
      "--initial-branch=main",
      caseHome,
    ]);
    await git(caseHome, ["remote", "add", "origin", "origin.example"]);
    const production = createGitRunner();
    const commands: string[] = [];
    const report = await inspectGitBackedCaseHome(
      {
        caseFolder,
        caseId: "PoliceConductUS/bare-remote-failure",
        configHome,
      },
      {
        git: async (args, cwd) => {
          const command = args.slice(1).join(" ");
          commands.push(command);
          if (command === failed)
            return {
              exitCode: 42,
              stdout: "",
              stderr: "bare remote failure\n",
            };
          return production(args, cwd);
        },
      },
    );
    expect(report.classification).toBe("unavailable");
    expect(report.repository).toMatchObject({ state: "unavailable" });
    expect(report.structuralPushTarget).toMatchObject({
      state: "unavailable",
    });
    expect(report.structuralPushTarget).not.toHaveProperty("pushUrls");
    expect(report.recovery.remotes).toMatchObject({ state: "unavailable" });
    expect(report.recovery.remotes).not.toHaveProperty("remotes");
    expect(commands.at(-1)).toBe(failed);
    expect(
      commands.some(
        (command) =>
          command === "rev-parse --show-toplevel" ||
          command.startsWith("status ") ||
          command.startsWith("ls-tree "),
      ),
    ).toBe(false);
  });
});
