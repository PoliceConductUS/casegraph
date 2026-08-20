import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { SourceRequestRecord } from "./types.js";
import { writeYamlFile } from "./yaml.js";

export async function writeHistory(
  workspacePath: string,
  mutationId: string,
  argv: readonly string[],
  statusValue: string,
  startedAt: string,
  completedAt: string,
  requests: readonly SourceRequestRecord[],
): Promise<void> {
  const historyRoot = path.join(workspacePath, ".history");
  const mutationPath = path.join(historyRoot, mutationId);
  await mkdir(mutationPath, { recursive: true });

  const requestEntries = requests.map((request) => ({
    id: request.id,
    file: `${request.id}.yaml`,
  }));

  await writeYamlFile(path.join(mutationPath, "manifest.yaml"), {
    type: "mutation",
    id: mutationId,
    started_at: startedAt,
    completed_at: completedAt,
    status: statusValue,
    command: { argv },
    requests: requestEntries,
  });

  for (const request of requests) {
    await writeYamlFile(path.join(mutationPath, `${request.id}.yaml`), request);
  }

  await writeYamlFile(path.join(historyRoot, "index.yaml"), {
    type: "history_index",
    mutations: [
      {
        id: mutationId,
        started_at: startedAt,
        command: argv.join(" "),
        status: statusValue,
      },
    ],
  });
}
