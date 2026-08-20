import { writeFile } from "node:fs/promises";

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function serializeYaml(value: unknown, indent = 0): string {
  const prefix = " ".repeat(indent);

  if (value === null || value === undefined) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return yamlScalar(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return value
      .map((item) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          return `${prefix}- ${serializeYaml(item, indent + 2).trimStart()}`;
        }

        const rendered = serializeYaml(item, indent + 2);
        return `${prefix}-${rendered.startsWith("\n") ? "" : "\n"}${rendered}`;
      })
      .join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null,
    );

    if (entries.length === 0) {
      return "{}";
    }

    return entries
      .map(([key, entryValue]) => {
        if (
          entryValue === null ||
          entryValue === undefined ||
          typeof entryValue === "string" ||
          typeof entryValue === "number" ||
          typeof entryValue === "boolean" ||
          (Array.isArray(entryValue) && entryValue.length === 0)
        ) {
          return `${prefix}${key}: ${serializeYaml(entryValue, indent + 2).trimStart()}`;
        }

        return `${prefix}${key}:\n${serializeYaml(entryValue, indent + 2)}`;
      })
      .join("\n");
  }

  if (typeof value === "bigint") {
    return yamlScalar(value.toString());
  }

  return yamlScalar("");
}

export function graphRecordContent(record: Record<string, unknown>): string {
  return `${serializeYaml(record)}\n`;
}

export async function writeYamlFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  await writeFile(filePath, `${serializeYaml(data)}\n`, { flag: "wx" });
}
