import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { createGitRunner } from "./git.js";
import { inspectGitBackedCaseHome } from "./inspect.js";

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("sanitizes ambient Git selectors and configuration without losing PATH", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "casegraph-fake-git-"));
  temporaryDirectories.push(directory);
  const outputPath = path.join(directory, "environment.json");
  const executable = path.join(directory, "git");
  await writeFile(
    executable,
    `#!/usr/bin/env node\nconst fs = require("node:fs"); fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(process.env));\n`,
  );
  await chmod(executable, 0o755);

  const previous = { ...process.env };
  try {
    process.env.PATH = `${directory}${path.delimiter}${previous.PATH ?? ""}`;
    process.env.GIT_DIR = "/hostile/a";
    process.env.Git_Work_Tree = "/hostile/b";
    process.env.git_config_global = "/hostile/config";
    process.env.GIT_TRACE = path.join(directory, "trace");
    process.env.CASEGRAPH_PRESERVED = "yes";
    const result = await createGitRunner()(["--version"], directory);
    expect(result.exitCode).toBe(0);
  } finally {
    for (const key of Object.keys(process.env))
      Reflect.deleteProperty(process.env, key);
    Object.assign(process.env, previous);
  }

  const child = JSON.parse(await readFile(outputPath, "utf8")) as Record<
    string,
    string
  >;
  expect(
    Object.keys(child).filter(
      (key) =>
        key.toUpperCase().startsWith("GIT_") &&
        ![
          "GIT_OPTIONAL_LOCKS",
          "GIT_CONFIG_NOSYSTEM",
          "GIT_CONFIG_GLOBAL",
        ].includes(key),
    ),
  ).toEqual([]);
  expect(child).toMatchObject({
    CASEGRAPH_PRESERVED: "yes",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    LC_ALL: "C",
  });
  expect(child.PATH).toContain(directory);
});

test("the full inspector reports only repository A under hostile ambient Git state", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "casegraph-git-isolation-"),
  );
  temporaryDirectories.push(directory);
  const caseFolderA = path.join(directory, "a");
  const caseFolderB = path.join(directory, "b");
  const repositoryA = path.join(caseFolderA, "casegraph");
  const repositoryB = path.join(caseFolderB, "casegraph");
  const configHome = path.join(directory, "config");
  await mkdir(repositoryA, { recursive: true });
  await mkdir(repositoryB, { recursive: true });
  await mkdir(configHome);
  const runGit = async (cwd: string, args: readonly string[]) =>
    (await execFileAsync("git", [...args], { cwd })).stdout.trim();
  const root = [
    "apiVersion: casegraph.policeconduct.org/v1alpha1",
    "kind: Case",
    "metadata:",
    "  uid: tz4a98xxat96iws9zmbrgj3a",
    "spec:",
    "  resources: []",
    "",
  ].join("\n");
  await runGit(repositoryA, ["init", "--initial-branch=main"]);
  await runGit(repositoryA, ["config", "user.name", "Repository A"]);
  await runGit(repositoryA, [
    "config",
    "user.email",
    "repository-a@example.invalid",
  ]);
  await writeFile(path.join(repositoryA, "root.yaml"), root);
  await runGit(repositoryA, ["add", "root.yaml"]);
  await runGit(repositoryA, ["commit", "-m", "repository A"]);
  await runGit(repositoryA, ["remote", "add", "origin", "a.example"]);

  await runGit(repositoryB, ["init", "--initial-branch=hostile"]);
  await runGit(repositoryB, ["config", "user.name", "Repository B"]);
  await runGit(repositoryB, [
    "config",
    "user.email",
    "repository-b@example.invalid",
  ]);
  await writeFile(path.join(repositoryB, "other.txt"), "repository B\n");
  await runGit(repositoryB, ["add", "other.txt"]);
  await runGit(repositoryB, ["commit", "-m", "repository B"]);
  await writeFile(path.join(repositoryB, "root.yaml"), root);
  await runGit(repositoryB, ["remote", "add", "origin", "b.example"]);

  const commitA = await runGit(repositoryA, ["rev-parse", "HEAD"]);
  const commitB = await runGit(repositoryB, ["rev-parse", "HEAD"]);
  expect(commitA).not.toBe(commitB);
  const indexA = await readFile(path.join(repositoryA, ".git", "index"));
  const indexB = await readFile(path.join(repositoryB, ".git", "index"));
  const hostileGlobal = path.join(directory, "hostile.gitconfig");
  const tracePath = path.join(directory, "hostile.trace");
  await writeFile(hostileGlobal, "[core]\n\tbare = true\n");
  const previous = { ...process.env };
  let report: Awaited<ReturnType<typeof inspectGitBackedCaseHome>>;
  try {
    process.env.GIT_DIR = path.join(repositoryB, ".git");
    process.env.GIT_WORK_TREE = repositoryB;
    process.env.GIT_INDEX_FILE = path.join(repositoryB, ".git", "index");
    process.env.GIT_COMMON_DIR = path.join(repositoryB, ".git");
    process.env.GIT_OBJECT_DIRECTORY = path.join(
      repositoryB,
      ".git",
      "objects",
    );
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = path.join(
      repositoryB,
      ".git",
      "objects",
    );
    process.env.GIT_NAMESPACE = "hostile";
    process.env.GIT_CONFIG_GLOBAL = hostileGlobal;
    process.env.GIT_TRACE = tracePath;
    process.env.Git_Dir = path.join(repositoryB, ".git");
    report = await inspectGitBackedCaseHome({
      caseFolder: caseFolderA,
      caseId: "PoliceConductUS/repository-a",
      configHome,
      selectedRemote: "origin",
    });
  } finally {
    for (const key of Object.keys(process.env))
      Reflect.deleteProperty(process.env, key);
    Object.assign(process.env, previous);
  }
  const canonicalA = await realpath(repositoryA);
  expect(report.classification).toBe("primary");
  expect(report.repository).toMatchObject({
    state: "primary",
    gitDirectory: path.join(canonicalA, ".git"),
    commonDirectory: path.join(canonicalA, ".git"),
    topLevel: canonicalA,
    branch: "main",
    commit: commitA,
    dirty: false,
    rootTrackedInHead: true,
    remotes: [
      { name: "origin", fetchUrls: ["a.example"], pushUrls: ["a.example"] },
    ],
  });
  expect(report.repository).not.toMatchObject({
    branch: "hostile",
    commit: commitB,
    dirty: true,
    rootTrackedInHead: false,
    remotes: [
      { name: "origin", fetchUrls: ["b.example"], pushUrls: ["b.example"] },
    ],
  });
  expect(report.recovery.commit).toBe(commitA);
  expect(report.recovery.remotes).toEqual({
    state: "known",
    remotes: [
      { name: "origin", fetchUrls: ["a.example"], pushUrls: ["a.example"] },
    ],
  });
  await expect(
    readFile(path.join(repositoryA, ".git", "index")),
  ).resolves.toEqual(indexA);
  await expect(
    readFile(path.join(repositoryB, ".git", "index")),
  ).resolves.toEqual(indexB);
  await expect(readFile(tracePath)).rejects.toMatchObject({ code: "ENOENT" });
});
