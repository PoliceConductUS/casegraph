#!/usr/bin/env node

import path from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import {
  casesAnalysisNewHelp,
  casesAnalysisResumeHelp,
  runAnalysisNewCommand,
  runAnalysisResumeCommand,
  type AnalysisNewRuntime,
} from "./cases/analysis/new/command.js";
import {
  casesAddEvidenceHelp,
  runAddEvidenceCommand,
} from "./cases/add/evidence/command.js";
import {
  casesAddDocumentHelp,
  runAddDocumentCommand,
} from "./cases/add/document/command.js";
import {
  casesImportCourtListenerHelp,
  importCourtListenerDocket,
} from "./cases/import/courtlistener/docket/command.js";
import type { CourtListenerImportRuntime } from "./cases/import/courtlistener/docket/types.js";
import { casesNewHelp, runNewCaseCommand } from "./cases/new/command.js";
import {
  packagesAddHelp,
  runPackagesAddCommand,
} from "./cases/packages/add/command.js";
import type { WorkspaceRuntime } from "./cases/workspaces/create.js";
import { casesReportHelp, runReportCommand } from "./cases/report/command.js";
import { Command } from "commander";

type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

type Runtime = CourtListenerImportRuntime &
  AnalysisNewRuntime &
  WorkspaceRuntime;

const rootHelp = `Usage: casegraph <command>

CaseGraph creates separated case homes for personal case analysis.

Commands:
  cases    Work with case workspaces
  packages Manage external package roots

Run "casegraph cases --help" for case workspace commands.
Run "casegraph packages --help" for external package commands.
`;

const packagesHelp = `Usage: casegraph packages <command>

Manage external package roots for a case.

Commands:
  add <case-id> <path>...
                   Add ordered external package roots

Run "casegraph packages add --help" for details.
`;

const casesHelp = `Usage: casegraph cases <command>

Work with separated case homes.

Commands:
  new <case-id> --home <directory>
                   Create an external case home
  import courtlistener <docket-id> [--dry-run | --write]
                   Bootstrap a case workspace from CourtListener REST
  add document <case-id> complaint <path-to-pdf>
                   Record a complaint document node
  add evidence <case-id> <path-to-file>
                   Record an external evidence file node
  analysis         Run case analysis workflows
  report <case-id> Report the current legal docket chronology

Run "casegraph cases new --help" for details.
`;

const casesAddHelp = `Usage: casegraph cases add <resource>

Add records to an existing case workspace.

Commands:
  casegraph cases add document <case-id> complaint <path-to-pdf>
  casegraph cases add document complaint <path-to-pdf>
  casegraph cases add evidence <case-id> <path-to-file>
  casegraph cases add evidence <path-to-file>
`;

const casesAnalysisHelp = `Usage: casegraph cases analysis <command>

Run case analysis workflows.

Commands:
  new <case-id>    Start the incident-from-complaint workflow
  new              Create analysis for the only valid case
  resume <case-id> Continue the current analysis
  resume           Resume analysis for the only valid case
`;

function isHelpRequest(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function importFlags(options: { dryRun?: boolean; write?: boolean }): string[] {
  return [
    ...(options.dryRun === true ? ["--dry-run"] : []),
    ...(options.write === true ? ["--write"] : []),
  ];
}

function commandArguments(
  ...values: (string | string[] | undefined)[]
): string[] {
  return values.flatMap((value) => {
    if (value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  });
}

export async function runCasegraph(
  args: readonly string[],
  cwd = process.cwd(),
  runtime: Runtime = { env: process.env },
): Promise<CommandResult> {
  if (args.length === 0 || isHelpRequest(args.slice(0, 1))) {
    return { exitCode: 0, stdout: rootHelp };
  }

  const [command, subcommand] = args;

  if (command === "packages") {
    if (!subcommand || isHelpRequest(args.slice(1, 2))) {
      return { exitCode: 0, stdout: packagesHelp };
    }

    if (subcommand === "add" && isHelpRequest(args.slice(2))) {
      return { exitCode: 0, stdout: packagesAddHelp };
    }

    if (subcommand !== "add") {
      return {
        exitCode: 1,
        stderr: `Unknown packages command: ${subcommand}\n\n${packagesHelp}`,
      };
    }

    let packageCommandResult: CommandResult | undefined;
    const packageProgram = new Command();
    packageProgram
      .name("casegraph")
      .exitOverride()
      .allowUnknownOption(false)
      .helpOption(false)
      .showHelpAfterError(false)
      .showSuggestionAfterError(false);

    packageProgram
      .command("packages")
      .helpOption(false)
      .command("add")
      .helpOption(false)
      .argument("[caseId]")
      .argument("[paths...]")
      .action(async (caseId: string | undefined, paths: string[]) => {
        packageCommandResult = await runPackagesAddCommand(
          commandArguments(caseId, paths),
          cwd,
          runtime,
        );
      });

    try {
      await packageProgram.parseAsync([...args], { from: "user" });
    } catch {
      return { exitCode: 1, stderr: packagesAddHelp };
    }

    return packageCommandResult ?? { exitCode: 1, stderr: packagesAddHelp };
  }

  if (command !== "cases") {
    return {
      exitCode: 1,
      stderr: `Unknown command: ${command}\n\n${rootHelp}`,
    };
  }

  if (!subcommand || isHelpRequest(args.slice(1, 2))) {
    return { exitCode: 0, stdout: casesHelp };
  }

  if (subcommand === "add" && isHelpRequest(args.slice(2, 3))) {
    return { exitCode: 0, stdout: casesAddHelp };
  }

  if (subcommand === "analysis" && isHelpRequest(args.slice(2, 3))) {
    return { exitCode: 0, stdout: casesAnalysisHelp };
  }

  if (
    subcommand === "analysis" &&
    args[2] === "new" &&
    isHelpRequest(args.slice(3))
  ) {
    return { exitCode: 0, stdout: casesAnalysisNewHelp };
  }

  if (
    subcommand === "analysis" &&
    args[2] === "resume" &&
    isHelpRequest(args.slice(3))
  ) {
    return { exitCode: 0, stdout: casesAnalysisResumeHelp };
  }

  if (
    subcommand === "add" &&
    args[2] === "document" &&
    isHelpRequest(args.slice(3))
  ) {
    return { exitCode: 0, stdout: casesAddDocumentHelp };
  }

  if (
    subcommand === "add" &&
    args[2] === "evidence" &&
    isHelpRequest(args.slice(3))
  ) {
    return { exitCode: 0, stdout: casesAddEvidenceHelp };
  }

  if (subcommand === "import" && isHelpRequest(args.slice(2))) {
    return { exitCode: 0, stdout: casesImportCourtListenerHelp };
  }

  if (subcommand === "new" && isHelpRequest(args.slice(2))) {
    return { exitCode: 0, stdout: casesNewHelp };
  }

  if (subcommand === "report" && isHelpRequest(args.slice(2))) {
    return { exitCode: 0, stdout: casesReportHelp };
  }

  if (!["add", "analysis", "import", "new", "report"].includes(subcommand)) {
    return {
      exitCode: 1,
      stderr: `Unknown cases command: ${subcommand}\n\n${casesHelp}`,
    };
  }

  let commandResult: CommandResult | undefined;
  const program = new Command();
  program
    .name("casegraph")
    .exitOverride()
    .allowUnknownOption(false)
    .helpOption(false)
    .showHelpAfterError(false)
    .showSuggestionAfterError(false);

  const casesCommand = program.command("cases").helpOption(false);

  const analysisCommand = casesCommand.command("analysis").helpOption(false);

  analysisCommand
    .command("new")
    .helpOption(false)
    .argument("[caseId]")
    .argument("[extra...]")
    .action(async (caseId: string | undefined, extra: string[]) => {
      commandResult = await runAnalysisNewCommand(
        commandArguments(caseId, extra),
        cwd,
        runtime,
      );
    });

  analysisCommand
    .command("resume")
    .helpOption(false)
    .argument("[caseId]")
    .argument("[extra...]")
    .action(async (caseId: string | undefined, extra: string[]) => {
      commandResult = await runAnalysisResumeCommand(
        commandArguments(caseId, extra),
        cwd,
        runtime,
      );
    });

  casesCommand
    .command("new")
    .helpOption(false)
    .argument("[caseId]")
    .requiredOption("--home <directory>")
    .option("--yes")
    .action(
      async (
        caseId: string | undefined,
        options: { home?: string; yes?: boolean },
      ) => {
        commandResult = await runNewCaseCommand(
          {
            caseId: caseId ?? "",
            cwd,
            home: options.home,
            yes: options.yes === true,
          },
          runtime,
        );
      },
    );

  const addCommand = casesCommand.command("add").helpOption(false);

  addCommand
    .command("document")
    .helpOption(false)
    .argument("[caseIdOrType]")
    .argument("[typeOrPath]")
    .argument("[path]")
    .argument("[extra...]")
    .action(
      async (
        caseIdOrType: string | undefined,
        typeOrPath: string | undefined,
        documentPath: string | undefined,
        extra: string[],
      ) => {
        commandResult = await runAddDocumentCommand(
          "document",
          commandArguments(caseIdOrType, typeOrPath, documentPath, extra),
          cwd,
          runtime,
        );
      },
    );

  addCommand
    .command("evidence")
    .helpOption(false)
    .argument("[caseIdOrPath]")
    .argument("[path]")
    .argument("[extra...]")
    .action(
      async (
        caseIdOrPath: string | undefined,
        evidencePath: string | undefined,
        extra: string[],
      ) => {
        commandResult = await runAddEvidenceCommand(
          commandArguments(caseIdOrPath, evidencePath, extra),
          cwd,
          runtime,
        );
      },
    );

  casesCommand
    .command("import")
    .helpOption(false)
    .argument("[source]")
    .argument("[docketId]")
    .argument("[extra...]")
    .option("--dry-run")
    .option("--write")
    .action(
      (
        source: string | undefined,
        docketId: string | undefined,
        extra: string[],
        options: { dryRun?: boolean; write?: boolean },
      ) => {
        if (source !== "courtlistener") {
          commandResult = {
            exitCode: 1,
            stderr: casesImportCourtListenerHelp,
          };
          return;
        }

        return importCourtListenerDocket(
          docketId,
          [...extra, ...importFlags(options)],
          cwd,
          runtime,
          args,
        ).then((result) => {
          commandResult = result;
        });
      },
    );

  casesCommand
    .command("report")
    .helpOption(false)
    .argument("[caseId]")
    .argument("[extra...]")
    .action(async (caseId: string | undefined, extra: string[]) => {
      commandResult = await runReportCommand(
        caseId ? [caseId, ...extra] : extra,
        cwd,
        runtime,
      );
    });

  try {
    await program.parseAsync([...args], { from: "user" });
  } catch (error) {
    const commanderError = error as Error & { code?: string; message?: string };
    if (!commanderError.code?.startsWith("commander.")) {
      return {
        exitCode: 1,
        stderr: `${commanderError.message}\n`,
      };
    }

    return {
      exitCode: 1,
      stderr:
        commanderError.code === "commander.unknownOption" ||
        commanderError.code === "commander.missingMandatoryOptionValue" ||
        commanderError.code === "commander.excessArguments"
          ? `${commanderError.message}\n`
          : casesHelp,
    };
  }

  return commandResult ?? { exitCode: 1, stderr: casesHelp };
}

async function main(): Promise<void> {
  function normalizePromptedPath(answer: string): string | undefined {
    const trimmed = answer.trim();
    if (!trimmed) {
      return undefined;
    }

    const unquoted = trimmed.replace(/^(['"])(.*)\1$/, "$2");
    return path.isAbsolute(unquoted)
      ? unquoted
      : path.resolve(process.cwd(), unquoted);
  }

  const result = await runCasegraph(process.argv.slice(2), process.cwd(), {
    env: process.env,
    async approveCreation(request) {
      if (!process.stdin.isTTY) {
        return false;
      }

      const readline = createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        const target =
          request.type === "createHomeDirectory"
            ? "case home directory"
            : "CaseHome root";
        const answer = await readline.question(
          `Create ${target}: ${request.path}? [y/N] `,
        );
        return /^(y|yes)$/i.test(answer.trim());
      } finally {
        readline.close();
      }
    },
    emitProgress(message) {
      process.stderr.write(message);
    },
    async promptForOriginalPdfPath({ invalidPath, unusableNativeTextPath }) {
      if (!process.stdin.isTTY) {
        return undefined;
      }

      const readline = createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        if (invalidPath) {
          process.stderr.write(
            `Original complaint PDF is not readable: ${invalidPath}\n`,
          );
        }
        if (unusableNativeTextPath) {
          process.stderr.write(
            `Original complaint PDF does not contain usable native text: ${unusableNativeTextPath}\n`,
          );
        }
        const answer = await readline.question(
          "Native complaint PDF text was not usable. If you have the original complaint PDF, enter its path now, or press Enter to continue to OCR: ",
        );
        return normalizePromptedPath(answer);
      } finally {
        readline.close();
      }
    },
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
