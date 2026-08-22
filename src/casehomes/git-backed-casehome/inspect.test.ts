import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
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
      const result = await execFileAsync("git", [...args], { cwd: caseHome });
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

    const fileReport = await inspectGitBackedCaseHome({
      caseFolder: fileFolder,
      caseId: "PoliceConductUS/file",
      configHome: fileConfig,
    });
    const symlinkReport = await inspectGitBackedCaseHome({
      caseFolder: symlinkFolder,
      caseId: "PoliceConductUS/link",
      configHome: symlinkConfig,
    });

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
      const readinessReasons = [
        identityDiagnostic,
        "case ID is already registered to a different root",
      ];

      expect(report).toEqual({
        classification: "conflict",
        paths: { caseFolder: canonicalFolder, caseHome, root },
        resource: { state: "not-inspected", diagnostic: resourceDiagnostic },
        repository: {
          state: "not-inspected",
          diagnostic: repositoryDiagnostic,
        },
        registration: {
          state: "different",
          registeredRoot: await realpath(registered.rootPath),
        },
        structuralPushTarget: {
          ready: false,
          pushUrls: [],
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
        ],
        recovery: {
          paths: [canonicalFolder, caseHome],
          remotes: [],
          registration: "different",
        },
      });
    }
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
      if (report.repository.state !== "ineligible") {
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
        ready: false,
        remote: "origin",
        pushUrls: [],
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
        commit: undefined,
        remotes: [],
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
