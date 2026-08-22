import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CaseGraphRoot } from "../workspaces/case-home-document.js";
import { GraphNodeSchema, readGraphNodes } from "./records.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("graph record sources", () => {
  test("rejects numeric source IDs on non-root graph records", () => {
    const result = GraphNodeSchema.safeParse({
      type: "node",
      kind: "document",
      id: "complaint",
      sources: [{ source_id: 42 }],
    });

    expect(result.success).toBe(false);
  });

  test("adapts a numeric CaseHome root source ID at the graph reader boundary", async () => {
    const homeDirectory = await mkdtemp(
      path.join(tmpdir(), "casegraph-records-"),
    );
    temporaryDirectories.push(homeDirectory);
    await writeFile(
      path.join(homeDirectory, "root.yaml"),
      "this CaseHome envelope must not be parsed as a graph record\n",
    );
    const rootNode: CaseGraphRoot = {
      type: "node",
      kind: "case",
      id: "root",
      sources: [
        {
          mutation: "m_import",
          request: "courtlistener-docket-42",
          path: ".",
          source_system: "courtlistener",
          source_model: "docket",
          source_id: 42,
        },
      ],
    };

    const graphNodes = await readGraphNodes(homeDirectory, rootNode);

    expect(graphNodes).toEqual([
      {
        fileStem: "root",
        node: {
          type: "node",
          kind: "case",
          id: "root",
          sources: [
            {
              mutation: "m_import",
              request: "courtlistener-docket-42",
              path: ".",
              source_system: "courtlistener",
              source_model: "docket",
              source_id: "42",
            },
          ],
        },
      },
    ]);
  });
});
