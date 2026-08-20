import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DocketImportMappings, GraphRecordMapping } from "./types.js";

const mappingFilePath = fileURLToPath(
  new URL("./docket.mapping.yaml", import.meta.url),
);

function parseMappingYaml(content: string): DocketImportMappings {
  const mappings: Partial<
    Record<keyof DocketImportMappings, GraphRecordMapping>
  > = {};
  let currentRecord: keyof DocketImportMappings | undefined;
  let inProperties = false;

  for (const rawLine of content.split("\n")) {
    if (rawLine.trim().length === 0 || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const recordMatch = rawLine.match(/^([a-z_]+):$/);
    if (recordMatch?.[1]) {
      currentRecord = recordMatch[1] as keyof DocketImportMappings;
      mappings[currentRecord] = { kind: "", properties: {} };
      inProperties = false;
      continue;
    }

    if (!currentRecord) {
      throw new Error("Mapping file must start with a record name.");
    }

    const kindMatch = rawLine.match(/^  kind: ([A-Za-z0-9_-]+)$/);
    if (kindMatch?.[1]) {
      mappings[currentRecord] = {
        ...(mappings[currentRecord] ?? { properties: {} }),
        kind: kindMatch[1],
      };
      continue;
    }

    if (rawLine === "  properties:") {
      inProperties = true;
      continue;
    }

    const propertyMatch = rawLine.match(
      /^    ([A-Za-z0-9_]+): ([A-Za-z0-9_]+)$/,
    );
    if (propertyMatch?.[1] && propertyMatch[2] && inProperties) {
      const mapping = mappings[currentRecord];
      if (!mapping) {
        throw new Error(`Missing mapping for ${currentRecord}.`);
      }

      mapping.properties[propertyMatch[1]] = propertyMatch[2];
      continue;
    }

    throw new Error(`Unsupported mapping line: ${rawLine}`);
  }

  for (const key of [
    "docket",
    "party",
    "attorney",
    "docket_entry",
    "recap_document",
  ] as const) {
    if (!mappings[key]?.kind) {
      throw new Error(`Missing mapping for ${key}.`);
    }
  }

  return mappings as DocketImportMappings;
}

export async function loadMappings(): Promise<DocketImportMappings> {
  return parseMappingYaml(await readFile(mappingFilePath, "utf8"));
}

export function mappedProperties(
  mapping: GraphRecordMapping,
  source: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(mapping.properties).map(([target, sourceField]) => {
      if (target === "document_type") {
        return [target, "recap_document"];
      }

      return [target, source[sourceField]];
    }),
  );
}
