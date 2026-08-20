import { z } from "zod";

const HistoryEntrySchema = z.object({
  event: z.string(),
  at: z.string(),
});

export const PdfToMarkdownWorkflowRootSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  status: z.literal("draft"),
  created_at: z.string(),
  updated_at: z.string(),
  workflow: z.object({
    name: z.literal("pdf-to-markdown"),
    version: z.literal(1),
  }),
  source: z.object({
    record_id: z.string(),
    record_kind: z.string(),
    source_pdf_path: z.string(),
    selection_reason: z.string(),
  }),
  artifacts: z.object({
    source_pdf: z.string(),
    markdown: z.string().optional(),
    extraction: z.literal("artifacts/extraction.yaml"),
    report: z.literal("report.md"),
    workflow_run: z.literal("workflow-run.yaml"),
  }),
  history: z.array(HistoryEntrySchema),
});

export type PdfToMarkdownWorkflowRoot = z.infer<
  typeof PdfToMarkdownWorkflowRootSchema
>;

const MethodAttemptSchema = z.object({
  method: z.enum([
    "source-metadata",
    "native-text",
    "alternate-original",
    "ocr",
    "vision",
  ]),
  status: z.enum(["completed", "failed", "skipped"]),
  reason: z.string().optional(),
});

export const PdfToMarkdownExtractionSchema = z.object({
  workflow: z.literal("pdf-to-markdown"),
  source_record_id: z.string(),
  source_pdf_path: z.string(),
  markdown_path: z.string().optional(),
  method: z.enum([
    "source-metadata",
    "native-text",
    "alternate-original",
    "ocr",
    "vision",
  ]),
  status: z.enum(["completed", "paused"]),
  method_attempts: z.array(MethodAttemptSchema),
  source_text_available: z.boolean(),
  native_text_usable: z.boolean().optional(),
  ocr_text_usable: z.boolean().optional(),
  vision_text_usable: z.boolean().optional(),
  reason: z.string().optional(),
});

export type PdfToMarkdownExtraction = z.infer<
  typeof PdfToMarkdownExtractionSchema
>;

export const PdfToMarkdownTaskRunSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  task_id: z.string(),
  task: z.literal("pdf-to-markdown"),
  task_version: z.literal(1),
  executor: z.object({
    engine: z.literal("local"),
    ai: z.literal("none"),
  }),
  status: z.enum(["completed", "paused"]),
  started_at: z.string(),
  completed_at: z.string(),
  inputs: z.object({
    source_record_id: z.string(),
    source_pdf: z.string(),
  }),
  outputs: z.object({
    extraction: z.literal("artifacts/pdf-to-markdown-extraction.yaml"),
    markdown: z.string().optional(),
    report: z.string(),
  }),
  history: z.array(HistoryEntrySchema),
});

export type PdfToMarkdownTaskRun = z.infer<typeof PdfToMarkdownTaskRunSchema>;

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function serializeYaml(value: unknown, indent = 0): string {
  const prefix = " ".repeat(indent);

  if (value === null || value === undefined) {
    return "";
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
        if (item === null || item === undefined) {
          return "";
        }

        if (typeof item !== "object" || Array.isArray(item)) {
          return `${prefix}- ${serializeYaml(item, indent + 2).trimStart()}`;
        }

        const rendered = serializeYaml(item, indent + 2);
        return `${prefix}-${rendered.startsWith("\n") ? "" : "\n"}${rendered}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(
        ([, entryValue]) => entryValue !== undefined && entryValue !== null,
      )
      .map(([key, entryValue]) => {
        if (
          typeof entryValue === "string" ||
          typeof entryValue === "number" ||
          typeof entryValue === "boolean" ||
          (Array.isArray(entryValue) && entryValue.length === 0)
        ) {
          return `${prefix}${key}: ${serializeYaml(
            entryValue,
            indent + 2,
          ).trimStart()}`;
        }

        return `${prefix}${key}:\n${serializeYaml(entryValue, indent + 2)}`;
      })
      .join("\n");
  }

  return yamlScalar("");
}

function documentYaml(value: unknown): string {
  return `${serializeYaml(value)}\n`;
}

export function pdfToMarkdownWorkflowRootYaml(
  root: PdfToMarkdownWorkflowRoot,
): string {
  return documentYaml(PdfToMarkdownWorkflowRootSchema.parse(root));
}

export function pdfToMarkdownExtractionYaml(
  extraction: PdfToMarkdownExtraction,
): string {
  return documentYaml(PdfToMarkdownExtractionSchema.parse(extraction));
}

export function pdfToMarkdownTaskRunYaml(run: PdfToMarkdownTaskRun): string {
  return documentYaml(PdfToMarkdownTaskRunSchema.parse(run));
}
