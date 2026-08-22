import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import { z } from "zod";
import { CASEGRAPH_API_VERSION } from "./case-locator-document.js";

export { CASEGRAPH_API_VERSION } from "./case-locator-document.js";

export const CaseHomeSourceReferenceSchema = z
  .object({
    mutation: z.string().min(1),
    request: z.string().min(1),
    path: z.string().min(1),
    source_system: z.string().min(1),
    source_model: z.string().min(1),
    source_id: z.union([z.string().min(1), z.number()]),
  })
  .strict();

export const CaseGraphRootSchema = z
  .object({
    type: z.literal("node"),
    kind: z.literal("case"),
    id: z.literal("root"),
    sources: z.array(CaseHomeSourceReferenceSchema).optional(),
  })
  .strict();

export const CaseHomeSchema = z
  .object({
    apiVersion: z.literal(CASEGRAPH_API_VERSION),
    kind: z.literal("CaseHome"),
    metadata: z.object({ name: z.string().min(1) }).strict(),
    spec: z
      .object({
        graphRoot: CaseGraphRootSchema,
        packagePath: z.array(z.string()),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type CaseHomeSourceReference = z.infer<
  typeof CaseHomeSourceReferenceSchema
>;
export type CaseGraphRoot = z.infer<typeof CaseGraphRootSchema>;
export type CaseHome = z.infer<typeof CaseHomeSchema>;

export type CaseHomeWriteOperation =
  | { type: "create"; value: CaseHome }
  | { type: "replacePackagePath"; packagePath: readonly string[] };

export async function readCaseHome(rootPath: string): Promise<CaseHome> {
  const document = parseDocument(await readFile(rootPath, "utf8"));

  if (document.errors.length > 0) {
    throw new Error(
      `Invalid CaseHome YAML at ${rootPath}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }

  return CaseHomeSchema.parse(document.toJS());
}

export async function writeCaseHome(
  rootPath: string,
  operation: CaseHomeWriteOperation,
): Promise<void> {
  if (operation.type === "create") {
    const caseHome = CaseHomeSchema.parse(operation.value);
    await writeFile(rootPath, stringify(caseHome), { flag: "wx" });
    return;
  }

  await readCaseHome(rootPath);
  const document = parseDocument(await readFile(rootPath, "utf8"));

  if (document.errors.length > 0) {
    throw new Error(
      `Invalid CaseHome YAML at ${rootPath}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }

  document.setIn(["spec", "packagePath"], [...operation.packagePath]);
  const temporaryPath = path.join(
    path.dirname(rootPath),
    `.${path.basename(rootPath)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, document.toString(), { flag: "wx" });
    await readCaseHome(temporaryPath);
    await rename(temporaryPath, rootPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
