import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { openCaseHomeResources } from "../../resources/casehome-storage/casehome-resources.js";
import { CaseResourceRegistry } from "../../resources/case/case-resource.js";
import { writeResourceDocument } from "../../resources/resource-document.js";
import {
  createGitRunner,
  prepareGitBackedCaseHome,
  type GitRunner,
} from "./index.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const CASE_ID = "PoliceConductUS/example-case";
const CASE_UID = "tz4a98xxat96iws9zmbrgj3a";
const MEMBER_UID = "tz4a98xxat96iws9zmbrgj3b";

const strictCase = (resources: readonly string[] = [], uid = CASE_UID) => ({
  apiVersion: "casegraph.policeconduct.org/v1alpha1" as const,
  kind: "Case" as const,
  metadata: { uid },
  spec: { resources: [...resources] },
});

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

async function absentPath(entryPath: string): Promise<boolean> {
  try {
    await lstat(entryPath);
    return false;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return true;
    }
    throw error;
  }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...args], {
    cwd,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      LC_ALL: "C",
    },
  });
  return result.stdout.trimEnd();
}

async function initializeRepository(directory: string): Promise<void> {
  await git(directory, ["init", "--initial-branch=main"]);
  await git(directory, ["config", "user.name", "CaseGraph Tests"]);
  await git(directory, ["config", "user.email", "casegraph@example.invalid"]);
}

async function snapshotTree(
  directory: string,
  relativeDirectory = "",
  skipGit = false,
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const entry of await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (skipGit && relativePath.split(path.sep).includes(".git")) continue;
    const entryPath = path.join(directory, relativePath);
    if (entry.isDirectory()) {
      snapshot[relativePath] = "directory";
      Object.assign(
        snapshot,
        await snapshotTree(directory, relativePath, skipGit),
      );
    } else if (entry.isSymbolicLink()) {
      snapshot[relativePath] = "symlink";
    } else {
      snapshot[relativePath] = (await readFile(entryPath)).toString("base64");
    }
  }
  return snapshot;
}

async function snapshotOuterRepository(directory: string) {
  return {
    files: await snapshotTree(directory, "", true),
    index: await readFile(path.join(directory, ".git", "index")),
    refs: await git(directory, ["show-ref"]),
    branch: await git(directory, ["branch", "--show-current"]),
    remotes: await git(directory, ["remote", "-v"]),
    upstreams: await git(directory, [
      "for-each-ref",
      "--format=%(refname):%(upstream:short)",
      "refs/heads",
    ]),
    status: (await git(directory, ["status", "--porcelain=v1"]))
      .split("\n")
      .filter(Boolean),
  };
}

function preparationInput(caseFolder: string, configHome: string) {
  return {
    caseFolder,
    configHome,
    caseId: CASE_ID,
    mode: "create" as const,
    initialCase: strictCase(),
  };
}

describe("local Git-backed CaseHome preparation", () => {
  test("creates a missing exact child as an unborn uncommitted repository", async () => {
    const parent = await temporaryDirectory("casegraph-prepare-parent-");
    const caseFolder = path.join(parent, "selected-case");
    const configHome = path.join(parent, "configuration");

    const result = await prepareGitBackedCaseHome(
      preparationInput(caseFolder, configHome),
    );
    const realCaseFolder = await realpath(caseFolder);

    expect(result.state).toBe("prepared");
    if (result.state !== "prepared") throw new Error(result.diagnostic);
    expect(result.mode).toBe("create");
    expect(result.report).toMatchObject({
      classification: "primary",
      paths: {
        caseFolder: realCaseFolder,
        caseHome: path.join(realCaseFolder, "casegraph"),
        root: path.join(realCaseFolder, "casegraph", "root.yaml"),
      },
      resource: { state: "valid", count: 1 },
      repository: {
        state: "primary",
        unborn: true,
        commit: undefined,
        rootTrackedInHead: false,
        remotes: [],
      },
      registration: { state: "absent" },
    });
    expect(
      await openCaseHomeResources(
        path.join(caseFolder, "casegraph"),
        CaseResourceRegistry,
      ),
    ).toMatchObject({ count: 1 });
    expect(
      await git(path.join(caseFolder, "casegraph"), [
        "rev-list",
        "--all",
        "--count",
      ]),
    ).toBe("0");
    expect(await git(path.join(caseFolder, "casegraph"), ["remote"])).toBe("");
    expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
      true,
    );
    expect(
      await absentPath(path.join(caseFolder, "casegraph", "config.yaml")),
    ).toBe(true);
    expect(
      await absentPath(
        path.join(caseFolder, "casegraph", "casegraph.lock.yaml"),
      ),
    ).toBe(true);
  });

  test("uses an existing empty exact child and preserves unrelated CaseFolder files", async () => {
    const caseFolder = await temporaryDirectory("casegraph-prepare-empty-");
    const configHome = await temporaryDirectory("casegraph-prepare-config-");
    const caseHome = path.join(caseFolder, "casegraph");
    await mkdir(caseHome);
    await writeFile(path.join(caseFolder, "notes.txt"), "outside repository\n");

    const result = await prepareGitBackedCaseHome(
      preparationInput(caseFolder, configHome),
    );

    expect(result.state).toBe("prepared");
    if (result.state !== "prepared") throw new Error(result.diagnostic);
    expect(await readFile(path.join(caseFolder, "notes.txt"), "utf8")).toBe(
      "outside repository\n",
    );
    expect(await git(caseHome, ["rev-parse", "--show-toplevel"])).toBe(
      await realpath(caseHome),
    );
  });

  test("rejects nonempty caller membership before probing Git or creating paths", async () => {
    const parent = await temporaryDirectory("casegraph-prepare-membership-");
    const caseFolder = path.join(parent, "selected-case");
    const configHome = path.join(parent, "config");
    const calls: readonly string[][] = [];
    const gitRunner: GitRunner = (args) => {
      (calls as string[][]).push([...args]);
      return Promise.reject(new Error("Git must not run"));
    };

    const result = await prepareGitBackedCaseHome(
      {
        ...preparationInput(caseFolder, configHome),
        initialCase: strictCase([MEMBER_UID]),
      },
      { git: gitRunner },
    );

    expect(result).toMatchObject({
      state: "incomplete",
      failedStep: "precondition",
      diagnostic:
        "New CaseHome preparation requires an empty Case spec.resources membership",
    });
    expect(calls).toEqual([]);
    expect(await absentPath(caseFolder)).toBe(true);
    expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
      true,
    );
  });

  test("adopts only an explicitly approved complete strict non-Git graph without changing existing bytes", async () => {
    const caseFolder = await temporaryDirectory("casegraph-prepare-adopt-");
    const configHome = await temporaryDirectory("casegraph-prepare-config-");
    const caseHome = path.join(caseFolder, "casegraph");
    const memberFolder = path.join(caseHome, MEMBER_UID);
    await mkdir(memberFolder, { recursive: true });
    await writeResourceDocument(
      path.join(caseHome, "root.yaml"),
      strictCase([MEMBER_UID]),
    );
    await writeResourceDocument(
      path.join(memberFolder, "root.yaml"),
      strictCase([], MEMBER_UID),
    );
    await writeFile(path.join(caseHome, "owned-note.txt"), "preserve me\n");
    await writeFile(path.join(caseHome, "config.yaml"), "malformed: [\n");
    await writeFile(
      path.join(caseHome, "casegraph.lock.yaml"),
      "arbitrary lock bytes\n",
    );
    const before = await snapshotTree(caseHome);

    const result = await prepareGitBackedCaseHome({
      caseFolder,
      configHome,
      caseId: CASE_ID,
      mode: "adopt",
      approveExistingNonGitCaseHome: true,
    });

    expect(result.state).toBe("prepared");
    if (result.state !== "prepared") throw new Error(result.diagnostic);
    expect(result.mode).toBe("adopt");
    expect(result.report).toMatchObject({
      classification: "primary",
      resource: { state: "valid", count: 2 },
      repository: { state: "primary", unborn: true, remotes: [] },
      registration: { state: "absent" },
    });
    const after = await snapshotTree(caseHome);
    expect(
      Object.fromEntries(
        Object.entries(after).filter(([name]) => !name.startsWith(".git")),
      ),
    ).toEqual(before);
    const realCaseHome = await realpath(caseHome);
    expect(result.report.recovery.paths).toEqual(
      expect.arrayContaining([
        realCaseHome,
        path.join(realCaseHome, "root.yaml"),
        path.join(realCaseHome, MEMBER_UID, "root.yaml"),
        path.join(realCaseHome, "config.yaml"),
        path.join(realCaseHome, "casegraph.lock.yaml"),
      ]),
    );
  });

  test("declines adoption and rejects invalid or conflicting exact children without mutation", async () => {
    const scenarios: Array<{
      readonly name: string;
      readonly arrange: (caseHome: string) => Promise<void>;
    }> = [
      {
        name: "declined",
        arrange: async (caseHome) => {
          await mkdir(caseHome);
          await writeResourceDocument(
            path.join(caseHome, "root.yaml"),
            strictCase(),
          );
        },
      },
      {
        name: "invalid-root",
        arrange: async (caseHome) => {
          await mkdir(caseHome);
          await writeFile(path.join(caseHome, "root.yaml"), "metadata: [\n");
        },
      },
      {
        name: "invalid-rooted-membership",
        arrange: async (caseHome) => {
          await mkdir(caseHome);
          await writeResourceDocument(
            path.join(caseHome, "root.yaml"),
            strictCase([MEMBER_UID]),
          );
        },
      },
      {
        name: "file-child",
        arrange: async (caseHome) => writeFile(caseHome, "not a directory\n"),
      },
      {
        name: "symlink-child",
        arrange: async (caseHome) => {
          const target = await temporaryDirectory("casegraph-prepare-target-");
          await symlink(target, caseHome, "dir");
        },
      },
    ];

    for (const scenario of scenarios) {
      const caseFolder = await temporaryDirectory(
        `casegraph-prepare-${scenario.name}-`,
      );
      const configHome = await temporaryDirectory("casegraph-prepare-config-");
      const caseHome = path.join(caseFolder, "casegraph");
      await scenario.arrange(caseHome);
      const before = scenario.name.includes("child")
        ? await lstat(caseHome)
        : await snapshotTree(caseHome);

      const result = await prepareGitBackedCaseHome({
        caseFolder,
        configHome,
        caseId: CASE_ID,
        mode: "adopt",
        approveExistingNonGitCaseHome: scenario.name !== "declined",
      });

      expect(result.state, scenario.name).toBe("incomplete");
      if (result.state !== "incomplete") {
        throw new Error(`${scenario.name} unexpectedly prepared`);
      }
      expect(result.failedStep, scenario.name).toBe("precondition");
      if (scenario.name.includes("child")) {
        const after = await lstat(caseHome);
        expect({ mode: after.mode, size: after.size }).toEqual({
          mode: (before as Awaited<ReturnType<typeof lstat>>).mode,
          size: (before as Awaited<ReturnType<typeof lstat>>).size,
        });
      } else {
        expect(await snapshotTree(caseHome), scenario.name).toEqual(before);
      }
      expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
        true,
      );
    }
  });

  test("preserves an outer repository except for Git's natural nested-child status delta", async () => {
    const caseFolder = await temporaryDirectory("casegraph-prepare-outer-");
    const configHome = await temporaryDirectory("casegraph-prepare-config-");
    await writeFile(path.join(caseFolder, "outer.txt"), "outer bytes\n");
    await initializeRepository(caseFolder);
    await git(caseFolder, ["add", "outer.txt"]);
    await git(caseFolder, ["commit", "-m", "outer baseline"]);
    const before = await snapshotOuterRepository(caseFolder);

    const result = await prepareGitBackedCaseHome(
      preparationInput(caseFolder, configHome),
    );

    expect(result.state).toBe("prepared");
    if (result.state !== "prepared") throw new Error(result.diagnostic);
    const after = await snapshotOuterRepository(caseFolder);
    expect(after.files["outer.txt"]).toBe(before.files["outer.txt"]);
    expect(after.index).toEqual(before.index);
    expect(after.refs).toBe(before.refs);
    expect(after.branch).toBe(before.branch);
    expect(after.remotes).toBe(before.remotes);
    expect(after.upstreams).toBe(before.upstreams);
    expect(before.status).toEqual([]);
    expect(after.status).toEqual(["?? casegraph/"]);
  });

  test("does not require a new outer status entry when ignore rules suppress the child", async () => {
    const caseFolder = await temporaryDirectory("casegraph-prepare-ignored-");
    const configHome = await temporaryDirectory("casegraph-prepare-config-");
    await writeFile(path.join(caseFolder, ".gitignore"), "casegraph/\n");
    await initializeRepository(caseFolder);
    await git(caseFolder, ["add", ".gitignore"]);
    await git(caseFolder, ["commit", "-m", "ignore nested CaseHome"]);
    const before = await snapshotOuterRepository(caseFolder);

    const result = await prepareGitBackedCaseHome(
      preparationInput(caseFolder, configHome),
    );

    expect(result.state).toBe("prepared");
    const after = await snapshotOuterRepository(caseFolder);
    expect(after.status).toEqual(before.status);
    expect(after.index).toEqual(before.index);
    expect(after.refs).toBe(before.refs);
    expect(after.files[".gitignore"]).toBe(before.files[".gitignore"]);
  });

  test("adopts child content already represented by outer status without inventing another outer delta", async () => {
    const caseFolder = await temporaryDirectory("casegraph-prepare-status-");
    const configHome = await temporaryDirectory("casegraph-prepare-config-");
    const caseHome = path.join(caseFolder, "casegraph");
    await initializeRepository(caseFolder);
    await writeFile(
      path.join(caseFolder, "outer.txt"),
      "tracked outer bytes\n",
    );
    await git(caseFolder, ["add", "outer.txt"]);
    await git(caseFolder, ["commit", "-m", "outer baseline"]);
    await mkdir(caseHome);
    await writeResourceDocument(path.join(caseHome, "root.yaml"), strictCase());
    const before = await snapshotOuterRepository(caseFolder);

    const result = await prepareGitBackedCaseHome({
      caseFolder,
      configHome,
      caseId: CASE_ID,
      mode: "adopt",
      approveExistingNonGitCaseHome: true,
    });

    expect(result.state).toBe("prepared");
    const after = await snapshotOuterRepository(caseFolder);
    expect(before.status).toEqual(["?? casegraph/"]);
    expect(after.status).toEqual(before.status);
    expect(after.index).toEqual(before.index);
    expect(after.refs).toBe(before.refs);
    expect(after.files["outer.txt"]).toBe(before.files["outer.txt"]);
    expect(after.files["casegraph/root.yaml"]).toBe(
      before.files["casegraph/root.yaml"],
    );
  });

  test("rejects an existing repository whose configured worktree is a different top-level", async () => {
    const fixture = await temporaryDirectory("casegraph-prepare-mismatch-");
    const caseFolder = path.join(fixture, "selected-case");
    const caseHome = path.join(caseFolder, "casegraph");
    const otherWorktree = path.join(fixture, "other-worktree");
    const configHome = path.join(fixture, "config");
    await mkdir(caseHome, { recursive: true });
    await mkdir(otherWorktree);
    await writeResourceDocument(path.join(caseHome, "root.yaml"), strictCase());
    await initializeRepository(caseHome);
    await git(caseHome, ["config", "core.worktree", otherWorktree]);
    const before = await snapshotTree(caseHome);

    const result = await prepareGitBackedCaseHome({
      caseFolder,
      configHome,
      caseId: CASE_ID,
      mode: "adopt",
      approveExistingNonGitCaseHome: true,
    });

    expect(result.state).toBe("incomplete");
    if (result.state !== "incomplete") throw new Error("mismatch prepared");
    expect(result.failedStep).toBe("precondition");
    expect(result.report?.repository).toMatchObject({
      state: "ineligible",
      reason: "mismatched-top-level",
      topLevel: await realpath(otherWorktree),
    });
    expect(await snapshotTree(caseHome)).toEqual(before);
  });

  test("rejects linked-worktree, separate-git-dir, and submodule gitfiles unchanged", async () => {
    const variants = [
      "linked-worktree",
      "separate-git-dir",
      "submodule",
    ] as const;

    for (const variant of variants) {
      const fixture = await temporaryDirectory(`casegraph-prepare-${variant}-`);
      const caseFolder = path.join(fixture, "selected-case");
      const caseHome = path.join(caseFolder, "casegraph");
      const configHome = path.join(fixture, "config");
      await mkdir(caseFolder);

      if (variant === "linked-worktree") {
        const primary = path.join(fixture, "primary");
        await mkdir(primary);
        await writeResourceDocument(
          path.join(primary, "root.yaml"),
          strictCase(),
        );
        await initializeRepository(primary);
        await git(primary, ["add", "root.yaml"]);
        await git(primary, ["commit", "-m", "primary"]);
        await git(primary, ["worktree", "add", "--detach", caseHome]);
      } else if (variant === "separate-git-dir") {
        await mkdir(caseHome);
        await git(caseHome, [
          "init",
          "--separate-git-dir",
          path.join(fixture, "separate-metadata.git"),
        ]);
        await writeResourceDocument(
          path.join(caseHome, "root.yaml"),
          strictCase(),
        );
      } else {
        const source = path.join(fixture, "submodule-source");
        await mkdir(source);
        await writeResourceDocument(
          path.join(source, "root.yaml"),
          strictCase(),
        );
        await initializeRepository(source);
        await git(source, ["add", "root.yaml"]);
        await git(source, ["commit", "-m", "submodule source"]);
        await initializeRepository(caseFolder);
        await git(caseFolder, [
          "-c",
          "protocol.file.allow=always",
          "submodule",
          "add",
          source,
          "casegraph",
        ]);
      }
      expect((await lstat(path.join(caseHome, ".git"))).isFile()).toBe(true);
      const before = await snapshotTree(caseHome);

      const result = await prepareGitBackedCaseHome({
        caseFolder,
        configHome,
        caseId: CASE_ID,
        mode: "adopt",
        approveExistingNonGitCaseHome: true,
      });

      expect(result.state, variant).toBe("incomplete");
      if (result.state !== "incomplete") {
        throw new Error(`${variant} unexpectedly prepared`);
      }
      expect(result.failedStep).toBe("precondition");
      expect(result.report?.repository).toMatchObject({
        state: "ineligible",
        reason: "gitfile",
        gitFile: path.join(await realpath(caseHome), ".git"),
      });
      expect(await snapshotTree(caseHome)).toEqual(before);
      expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
        true,
      );
    }
  });

  test("runs only inspection plus exact local init and never stages, commits, configures remotes, or registers", async () => {
    const parent = await temporaryDirectory("casegraph-prepare-audit-");
    const caseFolder = path.join(parent, "selected-case");
    const configHome = path.join(parent, "config");
    const realGit = createGitRunner();
    const calls: string[][] = [];
    const observedGit: GitRunner = async (args, cwd) => {
      calls.push([...args]);
      return realGit(args, cwd);
    };

    const result = await prepareGitBackedCaseHome(
      preparationInput(caseFolder, configHome),
      { git: observedGit },
    );

    expect(result.state).toBe("prepared");
    const normalized = calls.map((args) =>
      args.filter((argument) => argument !== "--no-optional-locks"),
    );
    expect(normalized.filter((args) => args[0] === "init")).toEqual([["init"]]);
    expect(
      normalized.some(
        (args) =>
          args[0] === "add" ||
          args[0] === "commit" ||
          args[0] === "push" ||
          args[0] === "config" ||
          (args[0] === "remote" &&
            (args[1] === "add" || args[1] === "set-url")),
      ),
    ).toBe(false);
    expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
      true,
    );
  });

  test("probes Git before creating paths and reports ordered init, write, and reopen failures", async () => {
    const boundaries = [
      "git-availability",
      "git-initialization",
      "root-write",
      "resource-reopen",
    ] as const;

    for (const boundary of boundaries) {
      const parent = await temporaryDirectory(`casegraph-prepare-${boundary}-`);
      const caseFolder = path.join(parent, "selected-case");
      const configHome = path.join(parent, "config");
      const realGit = createGitRunner();
      const gitRunner: GitRunner = async (args, cwd) => {
        const command = args.filter((arg) => arg !== "--no-optional-locks");
        if (boundary === "git-availability" && command[0] === "--version") {
          return { exitCode: 127, stdout: "", stderr: "git not found" };
        }
        if (boundary === "git-initialization" && command[0] === "init") {
          return { exitCode: 1, stdout: "", stderr: "init denied" };
        }
        return realGit(args, cwd);
      };
      const result = await prepareGitBackedCaseHome(
        preparationInput(caseFolder, configHome),
        {
          git: gitRunner,
          ...(boundary === "root-write"
            ? {
                writeRoot: () => {
                  return Promise.reject(new Error("writer failed"));
                },
              }
            : {}),
          ...(boundary === "resource-reopen"
            ? {
                openResources: () => {
                  return Promise.reject(new Error("reopen failed"));
                },
              }
            : {}),
        },
      );

      expect(result).toMatchObject({
        state: "incomplete",
        failedStep: boundary,
      });
      if (result.state !== "incomplete") {
        throw new Error(`${boundary} unexpectedly prepared`);
      }
      expect(result.safeNextAction).toEqual(expect.any(String));
      expect(result.report).toBeDefined();
      if (result.report === undefined)
        throw new Error("missing recovery report");
      expect(result.report.registration).toEqual({ state: "absent" });
      if (boundary === "git-availability") {
        expect(await absentPath(caseFolder)).toBe(true);
      }
      if (boundary === "git-initialization") {
        expect(await stat(path.join(caseFolder, "casegraph"))).toEqual(
          expect.objectContaining({}),
        );
        expect(
          await absentPath(path.join(caseFolder, "casegraph", "root.yaml")),
        ).toBe(true);
      }
      if (boundary === "root-write") {
        expect(
          await git(path.join(caseFolder, "casegraph"), [
            "rev-parse",
            "--is-inside-work-tree",
          ]),
        ).toBe("true");
        expect(
          await absentPath(path.join(caseFolder, "casegraph", "root.yaml")),
        ).toBe(true);
      }
      if (boundary === "resource-reopen") {
        expect(
          await readFile(
            path.join(caseFolder, "casegraph", "root.yaml"),
            "utf8",
          ),
        ).toContain("kind: Case");
      }
      expect(await absentPath(path.join(configHome, "casehomes.yaml"))).toBe(
        true,
      );
    }
  });
});
