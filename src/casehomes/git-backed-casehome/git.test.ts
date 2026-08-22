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

test("ambient repository selectors cannot make repository B masquerade as A", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "casegraph-git-isolation-"),
  );
  temporaryDirectories.push(directory);
  const repositoryA = path.join(directory, "a");
  const repositoryB = path.join(directory, "b");
  await mkdir(repositoryA);
  await mkdir(repositoryB);
  await execFileAsync("git", ["init", "--initial-branch=main"], {
    cwd: repositoryA,
  });
  await execFileAsync("git", ["init", "--initial-branch=other"], {
    cwd: repositoryB,
  });
  const hostileGlobal = path.join(directory, "hostile.gitconfig");
  const tracePath = path.join(directory, "hostile.trace");
  await writeFile(hostileGlobal, "[core]\n\tbare = true\n");
  const previous = { ...process.env };
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
    const runner = createGitRunner();
    const topLevel = await runner(
      ["rev-parse", "--show-toplevel"],
      repositoryA,
    );
    const gitDirectory = await runner(
      ["rev-parse", "--absolute-git-dir"],
      repositoryA,
    );
    const branch = await runner(["branch", "--show-current"], repositoryA);
    const bare = await runner(
      ["rev-parse", "--is-bare-repository"],
      repositoryA,
    );
    expect([topLevel, gitDirectory, branch, bare]).toMatchObject([
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0 },
      { exitCode: 0 },
    ]);
    const canonicalA = await realpath(repositoryA);
    expect(topLevel.stdout.trim()).toBe(canonicalA);
    expect(gitDirectory.stdout.trim()).toBe(path.join(canonicalA, ".git"));
    expect(branch.stdout.trim()).toBe("main");
    expect(bare.stdout.trim()).toBe("false");
    await expect(readFile(tracePath)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    for (const key of Object.keys(process.env))
      Reflect.deleteProperty(process.env, key);
    Object.assign(process.env, previous);
  }
});
