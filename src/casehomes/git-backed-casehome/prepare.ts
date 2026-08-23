import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { CaseResourceRegistry } from "../../resources/case/case-resource.js";
import { openCaseHomeResources } from "../../resources/casehome-storage/casehome-resources.js";
import { writeResourceDocument } from "../../resources/resource-document.js";
import { createGitRunner, type GitRunner } from "./git.js";
import {
  inspectGitBackedCaseHome,
  type CaseHomeRepositoryReport,
} from "./inspect.js";

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
}

export type PreparationFailureStep =
  | "precondition"
  | "git-availability"
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
): PreparedCaseHomeReport {
  return deepFreeze({
    state: "incomplete",
    failedStep,
    diagnostic: message,
    safeNextAction,
    ...(report === undefined ? {} : { report }),
  });
}

function commandDiagnostic(
  args: readonly string[],
  result: { readonly exitCode: number; readonly stderr: string },
): string {
  const stderr = result.stderr.trim();
  return `Git command \`git ${args.join(" ")}\` failed with exit ${String(result.exitCode)}${stderr.length === 0 ? "" : `: ${stderr}`}`;
}

const absentRegistrationStore = {
  read(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map());
  },
};

async function inspectForPreparation(
  input: CommonPreparationInput,
  git: GitRunner,
): Promise<CaseHomeRepositoryReport> {
  return inspectGitBackedCaseHome(input, {
    git,
    registrationStore: absentRegistrationStore,
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

async function exactChildExists(caseFolder: string): Promise<boolean> {
  try {
    await lstat(path.join(path.resolve(caseFolder), "casegraph"));
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
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
    const report = await inspectForPreparation(input, executeGit);
    return incomplete(
      "git-availability",
      message,
      "Install Git or restore it to PATH, then retry preparation.",
      report,
    );
  }

  const before = await inspectForPreparation(input, executeGit);
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

  const childPreviouslyExisted = await exactChildExists(
    before.paths.caseFolder,
  );
  if (!childPreviouslyExisted) {
    await mkdir(before.paths.caseHome, { recursive: true });
  }

  const initArgs = ["init"] as const;
  const init = await executeGit(initArgs, before.paths.caseHome);
  if (init.exitCode !== 0) {
    const report = await inspectForPreparation(input, executeGit);
    return incomplete(
      "git-initialization",
      commandDiagnostic(initArgs, init),
      "Inspect the preserved CaseHome and retry Git initialization after resolving the reported failure.",
      report,
    );
  }

  if (input.mode === "create") {
    try {
      await writeRoot(
        path.join(before.paths.caseHome, "root.yaml"),
        input.initialCase,
        CaseResourceRegistry,
      );
    } catch (error) {
      const report = await inspectForPreparation(input, executeGit);
      return incomplete(
        "root-write",
        diagnostic(error),
        "Inspect the initialized repository and retry only after resolving the root write failure.",
        report,
      );
    }
  }

  try {
    await openResources(before.paths.caseHome, CaseResourceRegistry);
  } catch (error) {
    const report = await inspectForPreparation(input, executeGit);
    return incomplete(
      "resource-reopen",
      diagnostic(error),
      "Inspect the preserved repository and strict resources before retrying preparation.",
      report,
    );
  }

  const report = await inspectForPreparation(input, executeGit);
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
