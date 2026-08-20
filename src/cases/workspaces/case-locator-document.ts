import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import { z } from "zod";

export const CASEGRAPH_API_VERSION =
  "policeconduct.org/casegraph/v1alpha1" as const;

function isCanonicalCaseHomeRoot(value: string): boolean {
  return (
    path.isAbsolute(value) &&
    value === path.normalize(value) &&
    path.basename(value) === "root.yaml" &&
    value.endsWith("root.yaml")
  );
}

export const CaseLocatorSchema = z
  .object({
    apiVersion: z.literal(CASEGRAPH_API_VERSION),
    kind: z.literal("CaseLocator"),
    metadata: z.object({ name: z.string().min(1) }).strict(),
    spec: z
      .object({
        home: z.string().refine(isCanonicalCaseHomeRoot),
      })
      .strict(),
  })
  .strict();

export type CaseLocator = z.infer<typeof CaseLocatorSchema>;

export async function readCaseLocator(rootPath: string): Promise<CaseLocator> {
  const document = parseDocument(await readFile(rootPath, "utf8"));

  if (document.errors.length > 0) {
    throw new Error(
      `Invalid CaseLocator YAML at ${rootPath}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
  }

  return CaseLocatorSchema.parse(document.toJS());
}

export async function writeCaseLocator(
  rootPath: string,
  value: CaseLocator,
): Promise<void> {
  const locator = CaseLocatorSchema.parse(value);
  await writeFile(rootPath, stringify(locator), { flag: "wx" });
}
