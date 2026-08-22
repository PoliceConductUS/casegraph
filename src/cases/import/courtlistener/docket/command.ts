import path from "node:path";
import { init as initCuid2 } from "@paralleldrive/cuid2";
import {
  CASEGRAPH_API_VERSION,
  type CaseHome,
} from "../../../workspaces/case-home-document.js";
import {
  prepareCaseHome,
  registerCaseHome,
} from "../../../workspaces/create.js";
import { fetchCourtListenerDocket } from "./api.js";
import { deriveCaseIdFromDocket } from "./case-id.js";
import { writeImportedGraphRecords } from "./graph-records.js";
import { writeHistory } from "./history.js";
import { loadMappings } from "./mapping.js";
import type { CommandResult, CourtListenerImportRuntime } from "./types.js";

export const casesImportCourtListenerHelp = `Usage: casegraph cases import courtlistener <docket-id> [--dry-run | --write] [--home <directory>] [--yes]

Bootstrap a new case home from CourtListener REST docket data.

The command uses COURTLISTENER_API_TOKEN from the environment.
Dry-run is the default and needs no home. Use --write with --home to create the case.
CourtListener API tokens are never printed or persisted.
`;

const createDefaultMutationId = initCuid2({ length: 10 });

function commandShapeError(unexpectedArgument?: string): CommandResult {
  return {
    exitCode: 1,
    stderr: unexpectedArgument
      ? `Unexpected import argument: ${unexpectedArgument}\n\n${casesImportCourtListenerHelp}`
      : casesImportCourtListenerHelp,
  };
}

type ImportOptions =
  | {
      dryRun: boolean;
      write: false;
      home?: string;
      yes: boolean;
    }
  | {
      dryRun: boolean;
      write: true;
      home: string;
      yes: boolean;
    };

function parseImportOptions(
  flags: readonly string[],
): ImportOptions | CommandResult {
  let dryRun = false;
  let write = false;
  let home: string | undefined;
  let yes = false;

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--dry-run") {
      dryRun = true;
    } else if (flag === "--write") {
      write = true;
    } else if (flag === "--yes") {
      yes = true;
    } else if (flag === "--home") {
      const homeValue = flags[index + 1];
      if (!homeValue || homeValue.startsWith("--")) {
        return commandShapeError();
      }
      home = homeValue;
      index += 1;
    } else if (flag.startsWith("--")) {
      return commandShapeError();
    } else {
      return commandShapeError(flag);
    }
  }

  if (dryRun && write) {
    return {
      exitCode: 1,
      stderr: "`--dry-run` and `--write` cannot be used together.\n",
    };
  }

  if (write) {
    if (!home) {
      return {
        exitCode: 1,
        stderr: "--home <directory> is required for a write import.\n",
      };
    }

    return { dryRun, write: true, home, yes };
  }

  return { dryRun, write: false, home, yes };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function importCourtListenerDocket(
  docketId: string | undefined,
  flags: readonly string[],
  cwd: string,
  runtime: CourtListenerImportRuntime,
  argv: readonly string[],
): Promise<CommandResult> {
  if (!docketId) {
    return commandShapeError();
  }

  const options = parseImportOptions(flags);
  if ("exitCode" in options) {
    return options;
  }

  const token = runtime.env?.COURTLISTENER_API_TOKEN;
  if (!token) {
    return {
      exitCode: 1,
      stderr: "COURTLISTENER_API_TOKEN is required for CourtListener import.\n",
    };
  }

  const fetchFunction = runtime.fetch ?? fetch;
  const { responses, error } = await fetchCourtListenerDocket(
    docketId,
    token,
    fetchFunction,
  );

  if (error) {
    return error;
  }

  if (!responses) {
    return {
      exitCode: 1,
      stderr: "CourtListener import failed without a response.\n",
    };
  }

  const caseId = deriveCaseIdFromDocket(responses.docket);
  if (!caseId) {
    return {
      exitCode: 1,
      stderr:
        "No safe case ID could be derived from CourtListener docket data.\n",
    };
  }

  const output = [
    `CourtListener docket: ${docketId}`,
    `Derived case ID: ${caseId}`,
    `Docket entries: ${String(responses.docketEntries.length)}`,
    `Parties: ${String(responses.parties.length)}`,
    `Attorneys: ${String(responses.attorneys.length)}`,
    `RECAP documents: ${String(responses.recapDocuments.length)}`,
  ];

  if (responses.citationLookupIncomplete) {
    output.push("Citation lookup incomplete for one or more RECAP documents.");
  }

  if (!options.write) {
    output.push("Dry run only. No case home created.");
    return { exitCode: 0, stdout: `${output.join("\n")}\n` };
  }

  const prepared = await prepareCaseHome(
    {
      caseId,
      cwd,
      home: options.home,
      yes: options.yes,
      existingHome: "reject",
    },
    runtime,
  );
  if ("exitCode" in prepared) {
    return prepared;
  }

  const timestamp = (runtime.now?.() ?? new Date()).toISOString();
  const mutationId = `m_${runtime.createMutationId?.() ?? createDefaultMutationId()}`;
  const allRequests = [
    responses.docketRequest,
    ...responses.docketEntryRequests,
    ...responses.partyRequests,
    ...responses.attorneyRequests,
    ...responses.recapDocumentRequests,
    ...responses.citationLookupRequests,
  ];

  try {
    await writeHistory(
      prepared.homeDirectory,
      mutationId,
      ["casegraph", ...argv],
      responses.citationLookupIncomplete ? "incomplete" : "success",
      timestamp,
      timestamp,
      allRequests,
    );
    const graphRoot = await writeImportedGraphRecords(
      prepared.homeDirectory,
      timestamp,
      mutationId,
      responses,
      runtime.createGraphRecordId ?? createDefaultMutationId,
      await loadMappings(),
    );
    const caseHome: CaseHome = {
      apiVersion: CASEGRAPH_API_VERSION,
      kind: "CaseHome",
      metadata: { name: caseId },
      spec: {
        graphRoot,
        packagePath: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    await registerCaseHome(prepared, caseHome);
  } catch (error) {
    return {
      exitCode: 1,
      stderr:
        `CourtListener import failed. Partial case home retained: ${prepared.homeDirectory}\n` +
        `${errorMessage(error)}\n`,
    };
  }

  output.push(`Case home: ${prepared.homeDirectory}`);
  output.push(`CaseHome root: ${prepared.homeRoot}`);
  output.push(`Case locator: ${prepared.locatorRoot}`);
  output.push(
    `Created mutation history: ${path.join(prepared.homeDirectory, ".history", mutationId)}`,
  );

  return { exitCode: 0, stdout: `${output.join("\n")}\n` };
}
