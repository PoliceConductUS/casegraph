import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeYamlFile } from "../../import/courtlistener/docket/yaml.js";

type EvidenceHistoryInput = {
  caseId: string;
  completedAt: string;
  evidenceId: string;
  evidencePath: string;
  mutationId: string;
  startedAt: string;
  workspacePath: string;
};

function mutationIndexEntry(
  mutationId: string,
  startedAt: string,
  command: string,
): string {
  return [
    `  - id: ${JSON.stringify(mutationId)}`,
    `    started_at: "${startedAt}"`,
    `    command: ${JSON.stringify(command)}`,
    '    status: "success"',
    "",
  ].join("\n");
}

async function readExistingHistoryIndex(indexPath: string): Promise<string> {
  try {
    return await readFile(indexPath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return 'type: "history_index"\nmutations:\n';
    }

    throw error;
  }
}

export async function writeEvidenceHistory({
  caseId,
  completedAt,
  evidenceId,
  evidencePath,
  mutationId,
  startedAt,
  workspacePath,
}: EvidenceHistoryInput): Promise<void> {
  const historyRoot = path.join(workspacePath, ".history");
  const mutationPath = path.join(historyRoot, mutationId);
  const commandArgv = [
    "casegraph",
    "cases",
    "add",
    "evidence",
    caseId,
    evidencePath,
  ];

  await mkdir(mutationPath, { recursive: true });

  await writeYamlFile(path.join(mutationPath, "manifest.yaml"), {
    type: "mutation",
    id: mutationId,
    started_at: startedAt,
    completed_at: completedAt,
    status: "success",
    command: { argv: commandArgv },
    records_created: [evidenceId],
    inputs: {
      evidence_path: evidencePath,
      hash: {
        algorithm: "sha256",
        value: evidenceId,
      },
    },
  });

  const indexPath = path.join(historyRoot, "index.yaml");
  const existingIndex = await readExistingHistoryIndex(indexPath);
  await writeFile(
    indexPath,
    `${existingIndex}${mutationIndexEntry(
      mutationId,
      startedAt,
      commandArgv.join(" "),
    )}`,
  );
}
