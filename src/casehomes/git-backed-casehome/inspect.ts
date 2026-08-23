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

interface WorktreeRepositoryDetails {
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
  | { readonly state: "not-inspected"; readonly diagnostic: string }
  | { readonly state: "unavailable"; readonly diagnostic: string }
  | ({ readonly state: "primary" } & WorktreeRepositoryDetails)
  | ({
      readonly state: "inherited";
      readonly expectedTopLevel: string;
      readonly inheritedTopLevel: string;
    } & WorktreeRepositoryDetails)
  | {
      readonly state: "ineligible";
      readonly reason: "bare";
      readonly bare: true;
      readonly gitDirectory: string;
      readonly commonDirectory: string;
      readonly commit?: string;
      readonly unborn: boolean;
      readonly branch?: string;
      readonly detached: boolean;
      readonly upstream?: string;
      readonly remotes: readonly GitRemoteReport[];
    }
  | ({
      readonly state: "ineligible";
      readonly reason: "gitfile" | "mismatched-top-level";
      readonly bare: false;
      readonly expectedTopLevel: string;
      readonly gitFile?: string;
    } & WorktreeRepositoryDetails);

export type CaseHomeResourceReport =
  | { readonly state: "absent" }
  | { readonly state: "not-inspected"; readonly diagnostic: string }
  | { readonly state: "valid"; readonly count: number }
  | { readonly state: "invalid"; readonly diagnostic: string };

export type RegistrationReport =
  | { readonly state: "absent" }
  | { readonly state: "not-inspected"; readonly diagnostic: string }
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
  readonly structuralPushTarget:
    | {
        readonly state: "known";
        readonly ready: boolean;
        readonly remote?: string;
        readonly pushUrls: readonly string[];
        readonly provesWritability: false;
      }
    | {
        readonly state: "not-inspected" | "unavailable";
        readonly ready: false;
        readonly remote?: string;
        readonly diagnostic: string;
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
    readonly repositoryDiagnostic?: string;
    readonly remotes:
      | {
          readonly state: "known";
          readonly remotes: readonly GitRemoteReport[];
        }
      | {
          readonly state: "not-inspected" | "unavailable";
          readonly diagnostic: string;
        };
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

function commandDiagnostic(
  args: readonly string[],
  result: { readonly exitCode: number; readonly stderr: string },
): string {
  const stderr = result.stderr.trim();
  return `Git command \`git ${args.join(" ")}\` failed with exit ${String(result.exitCode)}${stderr.length === 0 ? "" : `: ${stderr}`}`;
}

async function requiredGitValue(
  git: GitRunner,
  cwd: string,
  args: readonly string[],
): Promise<
  | { readonly state: "success"; readonly value: string }
  | { readonly state: "failure"; readonly diagnostic: string }
> {
  const result = await git(args, cwd);
  return result.exitCode === 0
    ? { state: "success", value: result.stdout.trim() }
    : { state: "failure", diagnostic: commandDiagnostic(args, result) };
}

function canonicalGitPath(value: string, cwd: string): string {
  return path.resolve(cwd, value);
}

async function inspectRemotes(
  git: GitRunner,
  cwd: string,
): Promise<
  | { readonly state: "success"; readonly remotes: readonly GitRemoteReport[] }
  | { readonly state: "failure"; readonly diagnostic: string }
> {
  const namesResult = await requiredGitValue(git, cwd, ["remote"]);
  if (namesResult.state === "failure") return namesResult;
  const remotes: GitRemoteReport[] = [];
  for (const name of lines(namesResult.value)) {
    const fetch = await requiredGitValue(git, cwd, [
      "remote",
      "get-url",
      "--all",
      name,
    ]);
    if (fetch.state === "failure") return fetch;
    const push = await requiredGitValue(git, cwd, [
      "remote",
      "get-url",
      "--push",
      "--all",
      name,
    ]);
    if (push.state === "failure") return push;
    remotes.push({
      name,
      fetchUrls: lines(fetch.value),
      pushUrls: lines(push.value),
    });
  }
  return { state: "success", remotes };
}

interface RepositoryInspection {
  readonly repository: RepositoryReport;
  readonly recoveryCommit?: string;
}

function inspected(
  repository: RepositoryReport,
  recoveryCommit?: string,
): RepositoryInspection {
  return recoveryCommit === undefined
    ? { repository }
    : { repository, recoveryCommit };
}

function unavailable(
  diagnostic: string,
  recoveryCommit?: string,
): RepositoryInspection {
  return inspected({ state: "unavailable", diagnostic }, recoveryCommit);
}

async function inspectRepository(
  git: GitRunner,
  cwd: string,
  expectedTopLevel: string,
  gitEntry:
    | { readonly isDirectory: boolean; readonly isFile: boolean }
    | undefined,
): Promise<RepositoryInspection> {
  const absoluteGitDirectoryArgs = ["rev-parse", "--absolute-git-dir"] as const;
  const gitDirectoryResult = await git(absoluteGitDirectoryArgs, cwd);
  if (gitDirectoryResult.exitCode !== 0) {
    const stderrLines = lines(gitDirectoryResult.stderr);
    if (
      gitEntry === undefined &&
      gitDirectoryResult.exitCode === 128 &&
      gitDirectoryResult.stdout.trim() === "" &&
      stderrLines.length === 1 &&
      stderrLines[0]?.startsWith("fatal: not a git repository")
    ) {
      return inspected({ state: "absent" });
    }
    return unavailable(
      commandDiagnostic(absoluteGitDirectoryArgs, gitDirectoryResult),
    );
  }
  const gitDirectoryValue = gitDirectoryResult.stdout.trim();
  if (gitDirectoryValue.length === 0)
    return unavailable(
      "Git command `git rev-parse --absolute-git-dir` returned an empty Git directory",
    );

  const commonDirectoryResult = await requiredGitValue(git, cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  if (commonDirectoryResult.state === "failure")
    return unavailable(commonDirectoryResult.diagnostic);
  if (commonDirectoryResult.value.length === 0)
    return unavailable(
      "Git command `git rev-parse --path-format=absolute --git-common-dir` returned an empty common directory",
    );
  const gitDirectory = canonicalGitPath(gitDirectoryValue, cwd);
  const commonDirectory = canonicalGitPath(commonDirectoryResult.value, cwd);
  const bareResult = await requiredGitValue(git, cwd, [
    "rev-parse",
    "--is-bare-repository",
  ]);
  if (bareResult.state === "failure") return unavailable(bareResult.diagnostic);
  if (bareResult.value !== "true" && bareResult.value !== "false")
    return unavailable(
      `Git command \`git rev-parse --is-bare-repository\` returned unexpected value ${JSON.stringify(bareResult.value)}`,
    );
  const bare = bareResult.value === "true";

  const headArgs = ["rev-parse", "--verify", "--quiet", "HEAD"] as const;
  const headResult = await git(headArgs, cwd);
  let commit: string | undefined;
  if (headResult.exitCode === 0) commit = headResult.stdout.trim();
  else if (
    headResult.exitCode !== 1 ||
    headResult.stdout.trim() !== "" ||
    headResult.stderr.trim() !== ""
  )
    return unavailable(commandDiagnostic(headArgs, headResult));

  const branchResult = await requiredGitValue(git, cwd, [
    "branch",
    "--show-current",
  ]);
  if (branchResult.state === "failure")
    return unavailable(branchResult.diagnostic, commit);
  const branch = branchResult.value || undefined;
  const upstreamArgs =
    branch === undefined
      ? (["for-each-ref", "--format=%(upstream:short)", "HEAD"] as const)
      : ([
          "for-each-ref",
          "--format=%(upstream:short)",
          `refs/heads/${branch}`,
        ] as const);
  const upstreamResult = await requiredGitValue(git, cwd, upstreamArgs);
  if (upstreamResult.state === "failure")
    return unavailable(upstreamResult.diagnostic, commit);
  const upstream = upstreamResult.value || undefined;

  if (bare) {
    const remoteResult = await inspectRemotes(git, cwd);
    if (remoteResult.state === "failure")
      return unavailable(remoteResult.diagnostic, commit);
    return inspected(
      {
        state: "ineligible",
        reason: "bare",
        bare: true,
        gitDirectory,
        commonDirectory,
        ...(commit === undefined ? {} : { commit }),
        unborn: commit === undefined,
        ...(branch === undefined ? {} : { branch }),
        detached: branch === undefined && commit !== undefined,
        ...(upstream === undefined ? {} : { upstream }),
        remotes: remoteResult.remotes,
      },
      commit,
    );
  }

  const topLevelResult = await requiredGitValue(git, cwd, [
    "rev-parse",
    "--show-toplevel",
  ]);
  if (topLevelResult.state === "failure")
    return unavailable(topLevelResult.diagnostic, commit);
  if (topLevelResult.value.length === 0)
    return unavailable(
      "Git command `git rev-parse --show-toplevel` returned an empty top-level path",
      commit,
    );
  const topLevel = canonicalGitPath(topLevelResult.value, cwd);
  const statusResult = await requiredGitValue(git, cwd, [
    "status",
    "--porcelain=v1",
  ]);
  if (statusResult.state === "failure")
    return unavailable(statusResult.diagnostic, commit);
  let rootEntry: string | undefined;
  if (commit !== undefined) {
    const rootResult = await requiredGitValue(git, cwd, [
      "ls-tree",
      "--name-only",
      "HEAD",
      "--",
      "root.yaml",
    ]);
    if (rootResult.state === "failure")
      return unavailable(rootResult.diagnostic, commit);
    rootEntry = rootResult.value;
  }
  const remoteResult = await inspectRemotes(git, cwd);
  if (remoteResult.state === "failure")
    return unavailable(remoteResult.diagnostic, commit);
  const details: WorktreeRepositoryDetails = {
    gitDirectory,
    commonDirectory,
    topLevel,
    branch,
    detached: branch === undefined && commit !== undefined,
    unborn: commit === undefined,
    dirty: statusResult.value.length > 0,
    commit,
    rootTrackedInHead: rootEntry === "root.yaml",
    upstream,
    remotes: remoteResult.remotes,
  };

  if (gitEntry?.isFile === true) {
    return inspected(
      {
        state: "ineligible",
        reason: "gitfile",
        expectedTopLevel,
        bare: false,
        gitFile: path.join(cwd, ".git"),
        ...details,
      },
      commit,
    );
  }
  if (topLevel !== expectedTopLevel) {
    if (gitEntry === undefined) {
      return inspected(
        {
          state: "inherited",
          expectedTopLevel,
          inheritedTopLevel: topLevel,
          ...details,
        },
        commit,
      );
    }
    return inspected(
      {
        state: "ineligible",
        reason: "mismatched-top-level",
        expectedTopLevel,
        bare: false,
        ...details,
      },
      commit,
    );
  }
  if (gitEntry?.isDirectory !== true) {
    return inspected(
      {
        state: "ineligible",
        reason: "mismatched-top-level",
        expectedTopLevel,
        bare: false,
        ...details,
      },
      commit,
    );
  }
  return inspected({ state: "primary", ...details }, commit);
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

function registrationConflictReason(
  registration: RegistrationReport,
): string | undefined {
  switch (registration.state) {
    case "different":
      return "case ID is already registered to a different root";
    case "conflicting-root":
      return "CaseHome root is already registered to a different case ID";
    case "invalid":
      return "machine registration is invalid";
    default:
      return undefined;
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
  const executeGit = dependencies.git ?? createGitRunner();
  const git: GitRunner = (args, cwd) =>
    executeGit(["--no-optional-locks", ...args], cwd);
  const registrationStore =
    dependencies.registrationStore ?? new CaseHomeRegistrationStore();
  const caseFolder = await canonicalCaseFolder(input.caseFolder);
  const caseHome = path.join(caseFolder, "casegraph");
  const root = path.join(caseHome, "root.yaml");
  const paths = { caseFolder, caseHome, root };

  const gitProbe = await git(["--version"], process.cwd());
  const gitUnavailableDiagnostic =
    gitProbe.exitCode === 0
      ? undefined
      : `Git is unavailable: ${gitProbe.stderr || `exit ${String(gitProbe.exitCode)}`}`;

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
    const resourceDiagnostic = `Strict CaseHome resources were not inspected because ${message}`;
    const repositoryDiagnostic = `Repository was not inspected because ${message}`;
    const registrationDiagnostic = `Machine registration was not inspected because ${message}`;
    const registration: RegistrationReport = {
      state: "not-inspected",
      diagnostic: registrationDiagnostic,
    };
    recoveryPaths.push(caseHome);
    const reasons = [message];
    return deepFreeze({
      classification: "conflict",
      paths,
      resource: { state: "not-inspected", diagnostic: resourceDiagnostic },
      repository: {
        state: "not-inspected",
        diagnostic: repositoryDiagnostic,
      },
      registration,
      structuralPushTarget: {
        state: "not-inspected",
        ready: false,
        ...(input.selectedRemote === undefined
          ? {}
          : { remote: input.selectedRemote }),
        diagnostic: repositoryDiagnostic,
        provesWritability: false,
      },
      registrationEligibility: { eligible: false, reasons },
      mutationReadiness: { ready: false, reasons },
      diagnostics: [
        message,
        resourceDiagnostic,
        repositoryDiagnostic,
        registrationDiagnostic,
      ],
      recovery: {
        paths: recoveryPaths,
        remotes: {
          state: "not-inspected",
          diagnostic: repositoryDiagnostic,
        },
        registration: registration.state,
      },
    });
  }

  if (childEntry === undefined) {
    const repositoryInspection: RepositoryInspection =
      gitUnavailableDiagnostic !== undefined
        ? {
            repository: {
              state: "unavailable",
              diagnostic: gitUnavailableDiagnostic,
            },
          }
        : (await exists(caseFolder))
          ? await inspectRepository(git, caseFolder, caseHome, undefined)
          : { repository: { state: "absent" } };
    const repository = repositoryInspection.repository;
    const inherited = repository.state === "inherited";
    const repositoryUnavailable = repository.state === "unavailable";
    const repositoryReason =
      gitUnavailableDiagnostic !== undefined
        ? "Git is unavailable"
        : repositoryUnavailable
          ? repository.diagnostic
          : "repository is not an exact primary checkout";
    const registration = await inspectRegistration(
      registrationStore,
      input.configHome,
      input.caseId,
      root,
    );
    const structuralPushTarget: CaseHomeRepositoryReport["structuralPushTarget"] =
      repository.state === "unavailable"
        ? {
            state: "unavailable",
            ready: false,
            diagnostic: repository.diagnostic,
            provesWritability: false,
          }
        : {
            state: "known",
            ready: false,
            pushUrls: [],
            provesWritability: false,
          };
    return deepFreeze({
      classification: repositoryUnavailable
        ? "unavailable"
        : inherited
          ? "inherited"
          : "absent",
      paths,
      resource: { state: "absent" },
      repository,
      registration,
      structuralPushTarget,
      registrationEligibility: {
        eligible: false,
        reasons: [repositoryReason],
      },
      mutationReadiness: {
        ready: false,
        reasons: [repositoryReason],
      },
      diagnostics: [
        ...(repositoryUnavailable ? [repository.diagnostic] : []),
        ...(registration.state === "invalid" ? [registration.diagnostic] : []),
      ],
      recovery: {
        paths: recoveryPaths,
        ...(repositoryInspection.recoveryCommit === undefined
          ? {}
          : { commit: repositoryInspection.recoveryCommit }),
        ...(repository.state === "unavailable"
          ? { repositoryDiagnostic: repository.diagnostic }
          : {}),
        remotes:
          repository.state === "inherited"
            ? { state: "known", remotes: repository.remotes }
            : repository.state === "unavailable"
              ? {
                  state: "unavailable",
                  diagnostic: repository.diagnostic,
                }
              : { state: "known", remotes: [] },
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

  let resource: CaseHomeResourceReport = { state: "absent" };
  let resourceDocumentPaths: readonly string[] = [];
  if (!isEmpty) {
    try {
      const snapshot = await openCaseHomeResources(
        canonicalHome,
        CaseResourceRegistry,
      );
      resource = { state: "valid", count: snapshot.count };
      resourceDocumentPaths = snapshot.documentPaths;
    } catch (error) {
      resource = { state: "invalid", diagnostic: diagnostic(error) };
    }
  }
  if (resource.state === "valid") {
    recoveryPaths.push(...resourceDocumentPaths);
  } else if (rootExists) {
    recoveryPaths.push(paths.root);
  }
  for (const reservedName of ["config.yaml", "casegraph.lock.yaml"] as const) {
    const reservedPath = path.join(canonicalHome, reservedName);
    if (await exists(reservedPath)) recoveryPaths.push(reservedPath);
  }

  const gitEntry = await gitEntryAt(canonicalHome);
  if (gitEntry !== undefined)
    recoveryPaths.push(path.join(canonicalHome, ".git"));
  const repositoryInspection: RepositoryInspection =
    gitUnavailableDiagnostic === undefined
      ? await inspectRepository(git, canonicalHome, canonicalHome, gitEntry)
      : {
          repository: {
            state: "unavailable",
            diagnostic: gitUnavailableDiagnostic,
          },
        };
  const repository = repositoryInspection.repository;
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
    ...(repository.state === "unavailable"
      ? {
          state: "unavailable" as const,
          ready: false as const,
          remote: input.selectedRemote,
          diagnostic: repository.diagnostic,
          provesWritability: false as const,
        }
      : {
          state: "known" as const,
          ready: selected !== undefined && selected.pushUrls.length > 0,
          remote: input.selectedRemote,
          pushUrls: selected?.pushUrls ?? [],
          provesWritability: false as const,
        }),
  };
  const registrationReasons: string[] = [];
  if (repository.state === "unavailable") {
    registrationReasons.push(
      gitUnavailableDiagnostic === undefined
        ? repository.diagnostic
        : "Git is unavailable",
    );
    if (resource.state !== "valid")
      registrationReasons.push("strict CaseHome resources are invalid");
  } else if (repository.state !== "primary") {
    registrationReasons.push(
      repository.state === "ineligible" && repository.reason === "bare"
        ? `Exact CaseHome repository at ${canonicalHome} is bare`
        : "repository is not an exact primary checkout",
    );
  } else {
    if (resource.state !== "valid")
      registrationReasons.push("strict CaseHome resources are invalid");
    if (repository.unborn) registrationReasons.push("repository has no commit");
    if (!repository.rootTrackedInHead)
      registrationReasons.push("root.yaml is not tracked in HEAD");
  }
  const registrationReason = registrationConflictReason(registration);
  if (registrationReason !== undefined)
    registrationReasons.push(registrationReason);
  const mutationReasons: string[] = [];
  if (repository.state === "unavailable") {
    mutationReasons.push(
      gitUnavailableDiagnostic === undefined
        ? repository.diagnostic
        : "Git is unavailable",
    );
    if (resource.state !== "valid")
      mutationReasons.push("strict CaseHome resources are invalid");
  } else if (repository.state !== "primary") {
    mutationReasons.push(
      repository.state === "ineligible" && repository.reason === "bare"
        ? `Exact CaseHome repository at ${canonicalHome} is bare`
        : "repository is not an exact primary checkout",
    );
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
  if (repository.state === "unavailable")
    diagnostics.push(repository.diagnostic);
  if (repository.state === "ineligible") {
    diagnostics.push(
      repository.reason === "bare"
        ? `Exact CaseHome repository at ${canonicalHome} is bare`
        : repository.gitFile !== undefined
          ? `Exact CaseHome uses an ineligible gitfile at ${repository.gitFile}`
          : `Git top-level ${String(repository.topLevel)} does not equal exact CaseHome ${canonicalHome}`,
    );
  }

  const classification =
    repository.state === "unavailable"
      ? "unavailable"
      : resource.state === "invalid"
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
      ...(repositoryInspection.recoveryCommit === undefined
        ? {}
        : { commit: repositoryInspection.recoveryCommit }),
      ...(repository.state === "unavailable"
        ? { repositoryDiagnostic: repository.diagnostic }
        : {}),
      remotes:
        repository.state === "unavailable"
          ? { state: "unavailable", diagnostic: repository.diagnostic }
          : { state: "known", remotes },
      registration: registration.state,
    },
  });
}
