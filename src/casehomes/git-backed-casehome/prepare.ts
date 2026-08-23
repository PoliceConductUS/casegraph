import { lstat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { CaseResourceRegistry } from "../../resources/case/case-resource.js";
import { openCaseHomeResources } from "../../resources/casehome-storage/casehome-resources.js";
import { writeResourceDocument } from "../../resources/resource-document.js";
import { createGitRunner, type GitRunner } from "./git.js";
import {
  inspectGitBackedCaseHome,
  type CaseHomeRepositoryReport,
} from "./inspect.js";
import type { CaseHomeRegistrationStore } from "./registration.js";

export interface PreparationCaseResource {
  readonly apiVersion: "casegraph.policeconduct.org/v1alpha1";
  readonly kind: "Case";
  readonly metadata: { readonly uid: string };
  readonly spec: { readonly resources: readonly string[] };
}

interface CommonPreparationInput {
  readonly caseFolder: string;
  readonly configHome: string;
  readonly caseId: string;
}

export type PrepareGitBackedCaseHomeInput = CommonPreparationInput &
  (
    | {
        readonly mode: "create";
        readonly initialCase: PreparationCaseResource;
      }
    | {
        readonly mode: "adopt";
        readonly approveExistingNonGitCaseHome: boolean;
      }
  );

export interface PrepareGitBackedCaseHomeDependencies {
  readonly git?: GitRunner;
  readonly writeRoot?: typeof writeResourceDocument;
  readonly openResources?: typeof openCaseHomeResources;
  readonly registrationStore?: Pick<CaseHomeRegistrationStore, "read">;
}

export type PreparationFailureStep =
  | "precondition"
  | "git-availability"
  | "path-preparation"
  | "exact-child-recheck"
  | "git-initialization"
  | "root-write"
  | "resource-reopen";

export type PreparedCaseHomeReport =
  | {
      readonly state: "prepared";
      readonly mode: PrepareGitBackedCaseHomeInput["mode"];
      readonly report: CaseHomeRepositoryReport;
    }
  | {
      readonly state: "incomplete";
      readonly failedStep: PreparationFailureStep;
      readonly diagnostic: string;
      readonly safeNextAction: string;
      readonly report?: CaseHomeRepositoryReport;
      readonly recoveryDiagnostic?: string;
    };

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.toString() : String(error);
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function incomplete(
  failedStep: PreparationFailureStep,
  message: string,
  safeNextAction: string,
  report?: CaseHomeRepositoryReport,
  recoveryDiagnostic?: string,
): PreparedCaseHomeReport {
  return deepFreeze({
    state: "incomplete",
    failedStep,
    diagnostic: message,
    safeNextAction,
    ...(report === undefined ? {} : { report }),
    ...(recoveryDiagnostic === undefined ? {} : { recoveryDiagnostic }),
  });
}

function commandDiagnostic(
  args: readonly string[],
  result: { readonly exitCode: number; readonly stderr: string },
): string {
  const stderr = result.stderr.trim();
  return `Git command \`git ${args.join(" ")}\` failed with exit ${String(result.exitCode)}${stderr.length === 0 ? "" : `: ${stderr}`}`;
}

async function inspectForPreparation(
  input: CommonPreparationInput,
  git: GitRunner,
  registrationStore?: Pick<CaseHomeRegistrationStore, "read">,
): Promise<CaseHomeRepositoryReport> {
  return inspectGitBackedCaseHome(input, {
    git,
    ...(registrationStore === undefined ? {} : { registrationStore }),
  });
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function observeExactChild(
  caseHome: string,
): Promise<
  | { readonly state: "missing" }
  | { readonly state: "directory" }
  | { readonly state: "conflict"; readonly diagnostic: string }
> {
  try {
    const entry = await lstat(caseHome);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      return { state: "directory" };
    }
    const kind = entry.isSymbolicLink() ? "symbolic link" : "non-directory";
    return {
      state: "conflict",
      diagnostic: `Exact CaseHome child ${caseHome} changed to a ${kind} before preparation mutation`,
    };
  } catch (error) {
    if (isMissingPathError(error)) return { state: "missing" };
    throw error;
  }
}

function withRecoveryPaths(
  report: CaseHomeRepositoryReport,
  additionalPaths: readonly string[],
): CaseHomeRepositoryReport {
  if (additionalPaths.length === 0) return report;
  const paths = [
    ...new Set([...report.recovery.paths, ...additionalPaths]),
  ].sort((left, right) => left.localeCompare(right));
  return deepFreeze({
    ...report,
    recovery: { ...report.recovery, paths },
  });
}

async function inventoryExistingContent(directory: string): Promise<string[]> {
  const paths: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      paths.push(entryPath);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await visit(entryPath);
      }
    }
  }
  await visit(directory);
  return paths;
}

async function incompleteWithRecovery(
  failedStep: PreparationFailureStep,
  message: string,
  safeNextAction: string,
  input: CommonPreparationInput,
  git: GitRunner,
  registrationStore?: Pick<CaseHomeRegistrationStore, "read">,
  additionalPaths: readonly string[] = [],
): Promise<PreparedCaseHomeReport> {
  try {
    const report = withRecoveryPaths(
      await inspectForPreparation(input, git, registrationStore),
      additionalPaths,
    );
    return incomplete(failedStep, message, safeNextAction, report);
  } catch (error) {
    const recoveryDiagnostic = `Recovery inspection failed: ${diagnostic(error)}`;
    return incomplete(
      failedStep,
      `${message}; ${recoveryDiagnostic}`,
      safeNextAction,
      undefined,
      recoveryDiagnostic,
    );
  }
}

async function requireExactChildDirectory(
  caseHome: string,
  input: CommonPreparationInput,
  git: GitRunner,
  registrationStore?: Pick<CaseHomeRegistrationStore, "read">,
): Promise<PreparedCaseHomeReport | undefined> {
  try {
    const observation = await observeExactChild(caseHome);
    if (observation.state === "directory") return undefined;
    const message =
      observation.state === "conflict"
        ? observation.diagnostic
        : `Exact CaseHome child ${caseHome} disappeared before preparation mutation`;
    return await incompleteWithRecovery(
      "exact-child-recheck",
      message,
      "Inspect the exact child identity and retry only after restoring a normal directory.",
      input,
      git,
      registrationStore,
    );
  } catch (error) {
    return incompleteWithRecovery(
      "exact-child-recheck",
      diagnostic(error),
      "Inspect the exact child path and retry after resolving the identity-check failure.",
      input,
      git,
      registrationStore,
    );
  }
}

function createPreconditionFailure(
  report: CaseHomeRepositoryReport,
): string | undefined {
  if (
    (report.classification === "absent" ||
      report.classification === "inherited") &&
    report.resource.state === "absent"
  ) {
    return undefined;
  }
  if (report.classification === "empty" && report.resource.state === "absent") {
    return undefined;
  }
  return `Create mode requires a missing or empty exact CaseHome at ${report.paths.caseHome}`;
}

function adoptionPreconditionFailure(
  report: CaseHomeRepositoryReport,
): string | undefined {
  if (
    report.resource.state === "valid" &&
    (report.repository.state === "absent" ||
      report.repository.state === "inherited")
  ) {
    return undefined;
  }
  return `Adoption requires a complete strict non-Git CaseHome at ${report.paths.caseHome}`;
}

export async function prepareGitBackedCaseHome(
  input: PrepareGitBackedCaseHomeInput,
  dependencies: PrepareGitBackedCaseHomeDependencies = {},
): Promise<PreparedCaseHomeReport> {
  const executeGit = dependencies.git ?? createGitRunner();
  const writeRoot = dependencies.writeRoot ?? writeResourceDocument;
  const openResources = dependencies.openResources ?? openCaseHomeResources;
  const registrationStore = dependencies.registrationStore;

  if (input.mode === "create") {
    let validatedCase;
    try {
      validatedCase = CaseResourceRegistry.read(
        input.initialCase,
        path.join(path.resolve(input.caseFolder), "casegraph", "root.yaml"),
      );
    } catch (error) {
      return incomplete(
        "precondition",
        diagnostic(error),
        "Supply a valid strict Case resource before retrying preparation.",
      );
    }
    const resources = (validatedCase.spec as { readonly resources: unknown })
      .resources;
    if (!Array.isArray(resources) || resources.length !== 0) {
      return incomplete(
        "precondition",
        "New CaseHome preparation requires an empty Case spec.resources membership",
        "Supply a strict Case resource with an empty spec.resources array.",
      );
    }
  }

  const probeArgs = ["--no-optional-locks", "--version"] as const;
  const probe = await executeGit(probeArgs, process.cwd());
  if (probe.exitCode !== 0) {
    const message = `Git is unavailable: ${probe.stderr.trim() || `exit ${String(probe.exitCode)}`}`;
    return incompleteWithRecovery(
      "git-availability",
      message,
      "Install Git or restore it to PATH, then retry preparation.",
      input,
      executeGit,
      registrationStore,
    );
  }

  const before = await inspectForPreparation(
    input,
    executeGit,
    registrationStore,
  );
  if (input.mode === "create") {
    const reason = createPreconditionFailure(before);
    if (reason !== undefined) {
      return incomplete(
        "precondition",
        reason,
        "Choose a missing or empty exact CaseHome, or explicitly adopt a valid existing non-Git CaseHome.",
        before,
      );
    }
  } else {
    if (!input.approveExistingNonGitCaseHome) {
      return incomplete(
        "precondition",
        `Adoption of existing non-Git CaseHome at ${before.paths.caseHome} was not approved`,
        "Set explicit adoption approval only after reviewing the existing strict CaseHome.",
        before,
      );
    }
    const reason = adoptionPreconditionFailure(before);
    if (reason !== undefined) {
      return incomplete(
        "precondition",
        reason,
        "Repair or select a complete strict non-Git CaseHome before retrying adoption.",
        before,
      );
    }
  }

  const childWasObserved = before.recovery.paths.includes(
    before.paths.caseHome,
  );
  let childObservation;
  try {
    childObservation = await observeExactChild(before.paths.caseHome);
  } catch (error) {
    return incompleteWithRecovery(
      "exact-child-recheck",
      diagnostic(error),
      "Inspect the exact child path and retry after resolving the identity-check failure.",
      input,
      executeGit,
      registrationStore,
    );
  }
  if (
    childObservation.state === "conflict" ||
    (childWasObserved && childObservation.state === "missing") ||
    (!childWasObserved && childObservation.state === "directory")
  ) {
    const message =
      childObservation.state === "conflict"
        ? childObservation.diagnostic
        : `Exact CaseHome child ${before.paths.caseHome} changed identity after inspection`;
    return incompleteWithRecovery(
      "exact-child-recheck",
      message,
      "Inspect the exact child identity and retry only after restoring the inspected state.",
      input,
      executeGit,
      registrationStore,
    );
  }

  if (childObservation.state === "missing") {
    try {
      await mkdir(before.paths.caseHome, { recursive: true });
    } catch (error) {
      return incompleteWithRecovery(
        "path-preparation",
        diagnostic(error),
        "Inspect the partially created CaseFolder and retry after resolving path creation.",
        input,
        executeGit,
        registrationStore,
      );
    }
  }

  const initialRecheck = await requireExactChildDirectory(
    before.paths.caseHome,
    input,
    executeGit,
    registrationStore,
  );
  if (initialRecheck !== undefined) return initialRecheck;

  let preservedContentPaths: readonly string[] = [];
  if (input.mode === "adopt") {
    try {
      preservedContentPaths = await inventoryExistingContent(
        before.paths.caseHome,
      );
    } catch (error) {
      return incompleteWithRecovery(
        "exact-child-recheck",
        diagnostic(error),
        "Inspect the existing CaseHome contents and retry after resolving inventory failure.",
        input,
        executeGit,
        registrationStore,
      );
    }
  }

  const preInitRecheck = await requireExactChildDirectory(
    before.paths.caseHome,
    input,
    executeGit,
    registrationStore,
  );
  if (preInitRecheck !== undefined) return preInitRecheck;

  const initArgs = ["init"] as const;
  const init = await executeGit(initArgs, before.paths.caseHome);
  if (init.exitCode !== 0) {
    return incompleteWithRecovery(
      "git-initialization",
      commandDiagnostic(initArgs, init),
      "Inspect the preserved CaseHome and retry Git initialization after resolving the reported failure.",
      input,
      executeGit,
      registrationStore,
      preservedContentPaths,
    );
  }

  const postInitRecheck = await requireExactChildDirectory(
    before.paths.caseHome,
    input,
    executeGit,
    registrationStore,
  );
  if (postInitRecheck !== undefined) return postInitRecheck;

  if (input.mode === "create") {
    try {
      await writeRoot(
        path.join(before.paths.caseHome, "root.yaml"),
        input.initialCase,
        CaseResourceRegistry,
      );
    } catch (error) {
      return incompleteWithRecovery(
        "root-write",
        diagnostic(error),
        "Inspect the initialized repository and retry only after resolving the root write failure.",
        input,
        executeGit,
        registrationStore,
      );
    }
  }

  const preReopenRecheck = await requireExactChildDirectory(
    before.paths.caseHome,
    input,
    executeGit,
    registrationStore,
  );
  if (preReopenRecheck !== undefined) return preReopenRecheck;

  try {
    await openResources(before.paths.caseHome, CaseResourceRegistry);
  } catch (error) {
    return incompleteWithRecovery(
      "resource-reopen",
      diagnostic(error),
      "Inspect the preserved repository and strict resources before retrying preparation.",
      input,
      executeGit,
      registrationStore,
      preservedContentPaths,
    );
  }

  const report = withRecoveryPaths(
    await inspectForPreparation(input, executeGit, registrationStore),
    preservedContentPaths,
  );
  if (report.repository.state !== "primary" || !report.repository.unborn) {
    return incomplete(
      "git-initialization",
      `Git initialization did not produce an unborn exact primary repository at ${report.paths.caseHome}`,
      "Inspect the preserved repository state before retrying preparation.",
      report,
    );
  }

  return deepFreeze({ state: "prepared", mode: input.mode, report });
}
