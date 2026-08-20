import { z } from "zod";

export const AnalysisStatusSchema = z.enum(["draft", "applied", "abandoned"]);

export const ReviewStateSchema = z.enum([
  "proposed",
  "approved",
  "discarded",
  "conflicted",
  "applied",
]);

export const SourceSupportKindSchema = z.enum([
  "direct-quote",
  "paraphrase",
  "summary",
  "inference",
  "missing-source-observation",
]);

const HistoryEntrySchema = z.object({
  event: z.string(),
  at: z.string(),
});

const CurrentAnalysisWorkflowSchema = z.object({
  id: z.string(),
  name: z.literal("incident-from-complaint"),
  path: z.literal("incident-from-complaint/root.yaml"),
  status: AnalysisStatusSchema,
  started_at: z.string(),
  completed_at: z.string().optional(),
  tasks: z.array(
    z.object({
      id: z.string(),
      name: z.enum(["pdf-to-markdown", "extract-incident"]),
      path: z.string(),
    }),
  ),
});

const CurrentAnalysisRunSchema = z.object({
  id: z.string(),
  operation: z.enum(["analysis new", "analysis resume"]),
  path: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  started_at: z.string(),
  completed_at: z.string().optional(),
});

const MainGraphSnapshotSchema = z.object({
  captured_at: z.string(),
  case_id: z.string(),
  hash_algorithm: z.literal("sha256"),
  graph_hash: z.string(),
  records: z.record(z.string(), z.string()),
});

export const CurrentAnalysisRootSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  status: AnalysisStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  main_graph: MainGraphSnapshotSchema,
  change_stack: z.array(z.string()),
  working_graph: z.string(),
  runs: z.array(CurrentAnalysisRunSchema),
  workflows: z.array(CurrentAnalysisWorkflowSchema),
  history: z.array(HistoryEntrySchema),
});

export type CurrentAnalysisRoot = z.infer<typeof CurrentAnalysisRootSchema>;

const WorkflowArtifactSchema = z.object({
  change_set: z.literal("change-set.yaml"),
  extraction: z.literal("artifacts/extraction.yaml"),
  report: z.literal("report.md"),
  workflow_run: z.literal("workflow-run.yaml"),
  complaint_pdf: z.string().optional(),
  complaint_text: z.string().optional(),
});

const WorkflowTaskSchema = z.object({
  id: z.string(),
  name: z.enum(["pdf-to-markdown", "extract-incident"]),
  path: z.string(),
  status: z.enum(["completed", "paused"]),
});

const WorkingGraphSnapshotSchema = z.object({
  graph_hash: z.string(),
  records: z.record(z.string(), z.string()),
});

const ComplaintSourceSchema = z.object({
  record_id: z.string(),
  record_kind: z.string(),
  pdf_path: z.string(),
  docket_entry_id: z.string().optional(),
  selection_reason: z.string(),
});

export const IncidentFromComplaintWorkflowRootSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  status: AnalysisStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  workflow: z.object({
    name: z.literal("incident-from-complaint"),
    version: z.literal(1),
  }),
  working_graph: z.object({
    input_snapshot: WorkingGraphSnapshotSchema,
    output_snapshot: WorkingGraphSnapshotSchema,
  }),
  complaint_source: ComplaintSourceSchema,
  artifacts: WorkflowArtifactSchema,
  tasks: z.array(WorkflowTaskSchema).optional(),
  history: z.array(HistoryEntrySchema),
});

export type IncidentFromComplaintWorkflowRoot = z.infer<
  typeof IncidentFromComplaintWorkflowRootSchema
>;

const SourceReferenceSchema = z.object({
  source_record_id: z.string(),
  source_record_kind: z.string(),
  complaint_locator: z.string(),
  support_kind: SourceSupportKindSchema,
});

export const IncidentFromComplaintExtractionSchema = z.object({
  incident: z.object({
    label: z.string(),
    summary: z.string(),
    incident_count: z.string(),
    date: z.object({
      value: z.string(),
      certainty: z.enum([
        "exact",
        "approximate",
        "relative",
        "inferred",
        "unknown",
        "conflicting",
      ]),
      source_locations: z.array(z.string()),
    }),
    time: z.object({
      value: z.string(),
      certainty: z.enum([
        "exact",
        "approximate",
        "relative",
        "inferred",
        "unknown",
        "conflicting",
      ]),
      source_locations: z.array(z.string()),
    }),
    location: z.object({
      primary: z.string(),
      specificity: z.string(),
      secondary_locations: z.array(z.string()),
      movement_between_locations: z.string(),
      unclear_or_missing: z.string(),
      source_locations: z.array(z.string()),
    }),
    primary_actors: z.array(z.string()),
    events: z.array(
      z.object({
        type: z.string(),
        time: z.object({
          value: z.string(),
          certainty: z.enum([
            "exact",
            "approximate",
            "relative",
            "inferred",
            "unknown",
            "conflicting",
          ]),
        }),
        location: z.object({
          value: z.string(),
          certainty: z.string(),
        }),
        actors: z.array(
          z.object({
            id: z.string(),
            role: z.string(),
            target_id: z.string().optional(),
          }),
        ),
        description: z.string(),
        statement: z
          .object({
            form: z.enum(["direct-quote", "paraphrase", "summary"]),
            text: z.string(),
          })
          .optional(),
        support: z.enum(["directly-alleged", "inferred", "uncertain"]),
        source_locations: z.array(z.string()),
        review_note: z.string().optional(),
      }),
    ),
    confidence_review_note: z.string(),
  }),
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      identity_status: z.enum(["named", "unnamed", "unknown", "inferred"]),
      category: z.string(),
      source_locations: z.array(z.string()),
    }),
  ),
  source_materials: z.array(
    z.object({
      name: z.string(),
      status: z.enum([
        "available",
        "directly-referenced",
        "likely-exists",
        "unknown",
        "needed-to-verify",
      ]),
      target_agency: z.string().optional(),
      request_text: z.string().optional(),
      review_note: z.string(),
      source_locations: z.array(z.string()),
    }),
  ),
  uncertainties: z.array(z.string()),
});

export type IncidentFromComplaintExtraction = z.infer<
  typeof IncidentFromComplaintExtractionSchema
>;

export const IncidentFromComplaintChangeSchema = z.object({
  id: z.string(),
  type: z.enum([
    "add-incident",
    "add-actor",
    "add-location",
    "add-data-request",
    "add-source-reference",
    "create-markdown-text-artifact",
    "promote-artifact-to-case-files",
    "update-document-sources",
    "update-docket-entry-documents",
    "update-document-file-path",
  ]),
  review_state: ReviewStateSchema,
  summary: z.string(),
  counts_as_proof: z.boolean().optional(),
  proposed_record: z.record(z.string(), z.unknown()).optional(),
  source_references: z.array(SourceReferenceSchema).min(1),
  source_task_run_ids: z.array(z.string()).min(1),
});

export type IncidentFromComplaintChange = z.infer<
  typeof IncidentFromComplaintChangeSchema
>;

export const IncidentFromComplaintChangeSetSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  workflow: z.literal("incident-from-complaint"),
  status: AnalysisStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  changes: z.array(IncidentFromComplaintChangeSchema),
  history: z.array(HistoryEntrySchema),
});

export type IncidentFromComplaintChangeSet = z.infer<
  typeof IncidentFromComplaintChangeSetSchema
>;

export const IncidentFromComplaintWorkflowRunSchema = z.object({
  analysis_id: z.string(),
  case_id: z.string(),
  workflow: z.literal("incident-from-complaint"),
  workflow_version: z.literal(1),
  executor: z.object({
    engine: z.literal("langgraph"),
    ai: z.literal("openai-responses"),
  }),
  status: AnalysisStatusSchema,
  started_at: z.string(),
  completed_at: z.string(),
  inputs: z.object({
    complaint_text: z.string(),
  }),
  outputs: z.object({
    extraction: z.literal("artifacts/extraction.yaml"),
    change_set: z.literal("change-set.yaml"),
    report: z.literal("report.md"),
  }),
  history: z.array(HistoryEntrySchema),
});

export type IncidentFromComplaintWorkflowRun = z.infer<
  typeof IncidentFromComplaintWorkflowRunSchema
>;

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
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined && entryValue !== null,
    );

    return entries
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

export function currentAnalysisRootYaml(root: CurrentAnalysisRoot): string {
  return documentYaml(CurrentAnalysisRootSchema.parse(root));
}

export function incidentFromComplaintWorkflowRootYaml(
  root: IncidentFromComplaintWorkflowRoot,
): string {
  return documentYaml(IncidentFromComplaintWorkflowRootSchema.parse(root));
}

export function incidentFromComplaintChangeSetYaml(
  changeSet: IncidentFromComplaintChangeSet,
): string {
  return documentYaml(IncidentFromComplaintChangeSetSchema.parse(changeSet));
}

export function incidentFromComplaintWorkflowRunYaml(
  run: IncidentFromComplaintWorkflowRun,
): string {
  return documentYaml(IncidentFromComplaintWorkflowRunSchema.parse(run));
}

export function incidentFromComplaintExtractionYaml(
  extraction: IncidentFromComplaintExtraction,
): string {
  return documentYaml(IncidentFromComplaintExtractionSchema.parse(extraction));
}
