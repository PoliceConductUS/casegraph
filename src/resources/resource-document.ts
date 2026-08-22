import { readFile, writeFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { CaseResourceRegistry } from "./case/case-resource.js";
import type { CaseGraphResource, ResourceRegistry } from "./resource-kind.js";

function parseResourceYaml(yaml: string, resourcePath: string): unknown {
  const document = parseDocument(yaml);

  if (document.errors.length > 0) {
    throw new Error(
      `Invalid CaseGraph resource YAML at ${resourcePath}: ${document.errors[0].message}`,
    );
  }

  return document.toJS();
}

export async function readResourceDocument(
  rootPath: string,
  registry: ResourceRegistry = CaseResourceRegistry,
): Promise<CaseGraphResource> {
  const yaml = await readFile(rootPath, "utf8");
  return registry.read(parseResourceYaml(yaml, rootPath), rootPath);
}

export async function writeResourceDocument(
  rootPath: string,
  value: unknown,
  registry: ResourceRegistry = CaseResourceRegistry,
): Promise<void> {
  const yaml = registry.serialize(value, rootPath);
  registry.read(parseResourceYaml(yaml, rootPath), rootPath);
  await writeFile(rootPath, yaml, { flag: "wx" });
}
