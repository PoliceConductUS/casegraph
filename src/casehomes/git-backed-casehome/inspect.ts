import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { CaseResourceRegistry } from "../../resources/case/case-resource.js";
import { openCaseHomeResources } from "../../resources/casehome-storage/casehome-resources.js";
import { createGitRunner, type GitRunner } from "./git.js";
import { CaseHomeRegistrationStore } from "./registration.js";

export interface InspectGitBackedCaseHomeInput {
  readonly caseFolder: string;
  readonly caseId: string;
  readonly configHome: string;
  readonly selectedRemote?: string;
}

export interface InspectGitBackedCaseHomeDependencies {
  readonly git?: GitRunner;
  readonly registrationStore?: Pick<CaseHomeRegistrationStore, "read">;
}

export interface GitRemoteReport {
  readonly name: string;
  readonly fetchUrls: readonly string[];
  readonly pushUrls: readonly string[];
}

interface RepositoryDetails {
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly topLevel?: string;
  readonly branch?: string;
  readonly detached: boolean;
  readonly unborn: boolean;
  readonly dirty: boolean;
  readonly commit?: string;
  readonly rootTrackedInHead: boolean;
  readonly upstream?: string;
  readonly remotes: readonly GitRemoteReport[];
}

export type RepositoryReport =
  | { readonly state: "absent" }
  | { readonly state: "unavailable"; readonly diagnostic: string }
  | ({ readonly state: "primary" } & RepositoryDetails)
  | ({
      readonly state: "inherited";
      readonly expectedTopLevel: string;
      readonly inheritedTopLevel: string;
    } & RepositoryDetails)
  | ({
      readonly state: "ineligible";
      readonly bare: boolean;
      readonly expectedTopLevel: string;
      readonly gitFile?: string;
    } & RepositoryDetails);

export type CaseHomeResourceReport =
  | { readonly state: "absent" }
  | { readonly state: "valid"; readonly count: number }
  | { readonly state: "invalid"; readonly diagnostic: string };

export type RegistrationReport =
  | { readonly state: "absent" }
  | { readonly state: "current"; readonly registeredRoot: string }
  | { readonly state: "different"; readonly registeredRoot: string }
  | {
      readonly state: "conflicting-root";
      readonly registeredCaseId: string;
      readonly registeredRoot: string;
    }
  | { readonly state: "invalid"; readonly diagnostic: string };

export interface CaseHomeRepositoryReport {
  readonly classification:
    | "absent"
    | "empty"
    | "non-git"
    | "primary"
    | "inherited"
    | "conflict"
    | "unavailable";
  readonly paths: {
    readonly caseFolder: string;
    readonly caseHome: string;
    readonly root: string;
  };
  readonly resource: CaseHomeResourceReport;
  readonly repository: RepositoryReport;
  readonly registration: RegistrationReport;
  readonly structuralPushTarget: {
    readonly ready: boolean;
    readonly remote?: string;
    readonly pushUrls: readonly string[];
    readonly provesWritability: false;
  };
  readonly registrationEligibility: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
  readonly mutationReadiness: {
    readonly ready: boolean;
    readonly reasons: readonly string[];
  };
  readonly diagnostics: readonly string[];
  readonly recovery: {
    readonly paths: readonly string[];
    readonly resourceCount?: number;
    readonly commit?: string;
    readonly remotes: readonly GitRemoteReport[];
    readonly registration: RegistrationReport["state"];
  };
}

function errorCode(error: unknown): unknown {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code;
  }
  return undefined;
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.toString() : String(error);
}

async function exists(entryPath: string): Promise<boolean> {
  try {
    await lstat(entryPath);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function lines(value: string): readonly string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function gitValue(
  git: GitRunner,
  cwd: string,
  args: readonly string[],
): Promise<string | undefined> {
  const result = await git(args, cwd);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

function canonicalGitPath(value: string, cwd: string): string {
  return path.resolve(cwd, value);
}

async function inspectRemotes(
  git: GitRunner,
  cwd: string,
): Promise<readonly GitRemoteReport[]> {
  const names = lines((await git(["remote"], cwd)).stdout);
  return Promise.all(
    names.map(async (name) => {
      const fetch = await git(["remote", "get-url", "--all", name], cwd);
      const push = await git(
        ["remote", "get-url", "--push", "--all", name],
        cwd,
      );
      return {
        name,
        fetchUrls: fetch.exitCode === 0 ? lines(fetch.stdout) : [],
        pushUrls: push.exitCode === 0 ? lines(push.stdout) : [],
      };
    }),
  );
}

async function inspectRepository(
  git: GitRunner,
  cwd: string,
  expectedTopLevel: string,
  gitEntry:
    | { readonly isDirectory: boolean; readonly isFile: boolean }
    | undefined,
): Promise<RepositoryReport> {
  const gitDirectoryValue = await gitValue(git, cwd, [
    "rev-parse",
    "--absolute-git-dir",
  ]);
  if (gitDirectoryValue === undefined) return { state: "absent" };

  const commonDirectoryValue = await gitValue(git, cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const gitDirectory = canonicalGitPath(gitDirectoryValue, cwd);
  const commonDirectory = canonicalGitPath(
    commonDirectoryValue ?? gitDirectory,
    cwd,
  );
  const bare =
    (await gitValue(git, cwd, ["rev-parse", "--is-bare-repository"])) ===
    "true";
  const topLevelValue = await gitValue(git, cwd, [
    "rev-parse",
    "--show-toplevel",
  ]);
  const topLevel =
    topLevelValue === undefined
      ? undefined
      : canonicalGitPath(topLevelValue, cwd);
  const commit = await gitValue(git, cwd, ["rev-parse", "--verify", "HEAD"]);
  const branch = await gitValue(git, cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  const status = await git(["status", "--porcelain=v1"], cwd);
  const rootEntry =
    commit === undefined
      ? undefined
      : await gitValue(git, cwd, [
          "ls-tree",
          "--name-only",
          "HEAD",
          "--",
          "root.yaml",
        ]);
  const upstream = await gitValue(git, cwd, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const remotes = await inspectRemotes(git, cwd);
  const details: RepositoryDetails = {
    gitDirectory,
    commonDirectory,
    topLevel,
    branch,
    detached: branch === undefined && commit !== undefined,
    unborn: commit === undefined,
    dirty: status.exitCode !== 0 || status.stdout.length > 0,
    commit,
    rootTrackedInHead: rootEntry === "root.yaml",
    upstream,
    remotes,
  };

  if (bare || gitEntry?.isFile === true) {
    return {
      state: "ineligible",
      expectedTopLevel,
      bare,
      gitFile: gitEntry?.isFile === true ? path.join(cwd, ".git") : undefined,
      ...details,
    };
  }
  if (topLevel !== expectedTopLevel) {
    if (gitEntry === undefined) {
      return {
        state: "inherited",
        expectedTopLevel,
        inheritedTopLevel: topLevel ?? gitDirectory,
        ...details,
      };
    }
    return {
      state: "ineligible",
      expectedTopLevel,
      bare,
      ...details,
    };
  }
  if (gitEntry?.isDirectory !== true) {
    return {
      state: "ineligible",
      expectedTopLevel,
      bare,
      ...details,
    };
  }
  return { state: "primary", ...details };
}

async function inspectRegistration(
  registrationStore: Pick<CaseHomeRegistrationStore, "read">,
  configHome: string,
  caseId: string,
  rootPath: string,
): Promise<RegistrationReport> {
  try {
    const registrations = await registrationStore.read(configHome);
    const registeredRoot = registrations.get(caseId);
    if (registeredRoot !== undefined) {
      return {
        state: registeredRoot === rootPath ? "current" : "different",
        registeredRoot,
      };
    }
    for (const [registeredCaseId, candidateRoot] of registrations) {
      if (candidateRoot === rootPath) {
        return {
          state: "conflicting-root",
          registeredCaseId,
          registeredRoot: candidateRoot,
        };
      }
    }
    return { state: "absent" };
  } catch (error) {
    return { state: "invalid", diagnostic: diagnostic(error) };
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

async function canonicalCaseFolder(caseFolder: string): Promise<string> {
  const absolute = path.resolve(caseFolder);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return absolute;
    throw error;
  }
}

async function gitEntryAt(
  caseHome: string,
): Promise<
  { readonly isDirectory: boolean; readonly isFile: boolean } | undefined
> {
  try {
    const entry = await lstat(path.join(caseHome, ".git"));
    return { isDirectory: entry.isDirectory(), isFile: entry.isFile() };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

export async function inspectGitBackedCaseHome(
  input: InspectGitBackedCaseHomeInput,
  dependencies: InspectGitBackedCaseHomeDependencies = {},
): Promise<CaseHomeRepositoryReport> {
  const git = dependencies.git ?? createGitRunner();
  const registrationStore =
    dependencies.registrationStore ?? new CaseHomeRegistrationStore();
  const caseFolder = await canonicalCaseFolder(input.caseFolder);
  const caseHome = path.join(caseFolder, "casegraph");
  const root = path.join(caseHome, "root.yaml");
  const paths = { caseFolder, caseHome, root };

  const gitProbe = await git(["--version"], process.cwd());
  if (gitProbe.exitCode !== 0) {
    const diagnosticText = `Git is unavailable: ${gitProbe.stderr || `exit ${String(gitProbe.exitCode)}`}`;
    return deepFreeze({
      classification: "unavailable",
      paths,
      resource: { state: "absent" },
      repository: { state: "unavailable", diagnostic: diagnosticText },
      registration: { state: "absent" },
      structuralPushTarget: {
        ready: false,
        pushUrls: [],
        provesWritability: false,
      },
      registrationEligibility: {
        eligible: false,
        reasons: ["Git is unavailable"],
      },
      mutationReadiness: {
        ready: false,
        reasons: ["Git is unavailable"],
      },
      diagnostics: [diagnosticText],
      recovery: { paths: [], remotes: [], registration: "absent" },
    });
  }

  const recoveryPaths: string[] = [];
  if (await exists(caseFolder)) recoveryPaths.push(caseFolder);
  let childEntry;
  try {
    childEntry = await lstat(caseHome);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }

  if (
    childEntry?.isSymbolicLink() === true ||
    (childEntry !== undefined && !childEntry.isDirectory())
  ) {
    const kind = childEntry.isSymbolicLink()
      ? "symbolic link"
      : "non-directory file";
    const message = `Exact CaseHome child ${caseHome} is a ${kind}`;
    return deepFreeze({
      classification: "conflict",
      paths,
      resource: { state: "absent" },
      repository: { state: "absent" },
      registration: { state: "absent" },
      structuralPushTarget: {
        ready: false,
        pushUrls: [],
        provesWritability: false,
      },
      registrationEligibility: { eligible: false, reasons: [message] },
      mutationReadiness: { ready: false, reasons: [message] },
      diagnostics: [message],
      recovery: { paths: recoveryPaths, remotes: [], registration: "absent" },
    });
  }

  if (childEntry === undefined) {
    const repository = (await exists(caseFolder))
      ? await inspectRepository(git, caseFolder, caseHome, undefined)
      : ({ state: "absent" } as const);
    const inherited = repository.state === "inherited";
    const registration = await inspectRegistration(
      registrationStore,
      input.configHome,
      input.caseId,
      root,
    );
    return deepFreeze({
      classification: inherited ? "inherited" : "absent",
      paths,
      resource: { state: "absent" },
      repository,
      registration,
      structuralPushTarget: {
        ready: false,
        pushUrls: [],
        provesWritability: false,
      },
      registrationEligibility: {
        eligible: false,
        reasons: ["repository is not an exact primary checkout"],
      },
      mutationReadiness: {
        ready: false,
        reasons: ["repository is not an exact primary checkout"],
      },
      diagnostics:
        registration.state === "invalid" ? [registration.diagnostic] : [],
      recovery: {
        paths: recoveryPaths,
        remotes: repository.state === "inherited" ? repository.remotes : [],
        registration: registration.state,
      },
    });
  }

  const canonicalHome = await realpath(caseHome);
  paths.caseHome = canonicalHome;
  paths.root = path.join(canonicalHome, "root.yaml");
  recoveryPaths.push(canonicalHome);
  const entries = await readdir(canonicalHome);
  const isEmpty = entries.length === 0;
  const rootExists = await exists(paths.root);
  if (rootExists) recoveryPaths.push(paths.root);
  for (const reservedName of ["config.yaml", "casegraph.lock.yaml"] as const) {
    const reservedPath = path.join(canonicalHome, reservedName);
    if (await exists(reservedPath)) recoveryPaths.push(reservedPath);
  }

  let resource: CaseHomeResourceReport = { state: "absent" };
  if (!isEmpty) {
    try {
      const snapshot = await openCaseHomeResources(
        canonicalHome,
        CaseResourceRegistry,
      );
      resource = { state: "valid", count: snapshot.count };
    } catch (error) {
      resource = { state: "invalid", diagnostic: diagnostic(error) };
    }
  }

  const gitEntry = await gitEntryAt(canonicalHome);
  if (gitEntry !== undefined)
    recoveryPaths.push(path.join(canonicalHome, ".git"));
  const repository = await inspectRepository(
    git,
    canonicalHome,
    canonicalHome,
    gitEntry,
  );
  const registration = await inspectRegistration(
    registrationStore,
    input.configHome,
    input.caseId,
    paths.root,
  );
  const remotes =
    repository.state === "primary" ||
    repository.state === "inherited" ||
    repository.state === "ineligible"
      ? repository.remotes
      : [];
  const selected = remotes.find(
    (remote) => remote.name === input.selectedRemote,
  );
  const structuralPushTarget = {
    ready: selected !== undefined && selected.pushUrls.length > 0,
    remote: input.selectedRemote,
    pushUrls: selected?.pushUrls ?? [],
    provesWritability: false as const,
  };
  const registrationReasons: string[] = [];
  if (repository.state !== "primary") {
    registrationReasons.push("repository is not an exact primary checkout");
  } else {
    if (resource.state !== "valid")
      registrationReasons.push("strict CaseHome resources are invalid");
    if (repository.unborn) registrationReasons.push("repository has no commit");
    if (!repository.rootTrackedInHead)
      registrationReasons.push("root.yaml is not tracked in HEAD");
  }
  if (registration.state === "invalid") {
    registrationReasons.push("machine registration is invalid");
  }
  const mutationReasons: string[] = [];
  if (repository.state !== "primary") {
    mutationReasons.push("repository is not an exact primary checkout");
  } else {
    if (resource.state !== "valid")
      mutationReasons.push("strict CaseHome resources are invalid");
    if (repository.dirty)
      mutationReasons.push("repository working tree is dirty");
    if (!structuralPushTarget.ready)
      mutationReasons.push("selected remote is not structurally ready");
  }
  const diagnostics: string[] = [];
  if (resource.state === "invalid") diagnostics.push(resource.diagnostic);
  if (registration.state === "invalid")
    diagnostics.push(registration.diagnostic);
  if (repository.state === "ineligible") {
    diagnostics.push(
      repository.bare
        ? `Exact CaseHome repository at ${canonicalHome} is bare`
        : repository.gitFile !== undefined
          ? `Exact CaseHome uses an ineligible gitfile at ${repository.gitFile}`
          : `Git top-level ${String(repository.topLevel)} does not equal exact CaseHome ${canonicalHome}`,
    );
  }

  const classification =
    resource.state === "invalid"
      ? "conflict"
      : repository.state === "primary"
        ? "primary"
        : repository.state === "inherited"
          ? "inherited"
          : repository.state === "ineligible"
            ? "conflict"
            : isEmpty
              ? "empty"
              : "non-git";

  return deepFreeze({
    classification,
    paths,
    resource,
    repository,
    registration,
    structuralPushTarget,
    registrationEligibility: {
      eligible: registrationReasons.length === 0,
      reasons: registrationReasons,
    },
    mutationReadiness: {
      ready: mutationReasons.length === 0,
      reasons: mutationReasons,
    },
    diagnostics,
    recovery: {
      paths: recoveryPaths,
      resourceCount: resource.state === "valid" ? resource.count : undefined,
      commit:
        repository.state === "primary" ||
        repository.state === "inherited" ||
        repository.state === "ineligible"
          ? repository.commit
          : undefined,
      remotes,
      registration: registration.state,
    },
  });
}
