import { readFile, writeFile } from "node:fs/promises";
import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import {
  openAiApiConfigured,
  openAiApiKey,
  openAiResponsesJsonWithResponse,
  type OpenAiResponsesOutput,
} from "../../../../system/ai/openai/responses.js";
import {
  IncidentFromComplaintExtractionSchema,
  incidentFromComplaintExtractionYaml,
  type IncidentFromComplaintChange,
  type IncidentFromComplaintExtraction,
  type IncidentFromComplaintWorkflowRun,
} from "./contract.js";

export type IncidentFromComplaintAiExtractor = {
  extractIncidentFromComplaint: (input: {
    complaintText: string;
    progress?: (message: string) => void;
  }) => Promise<unknown>;
};

export type IncidentFromComplaintAiAudit = {
  model: string;
  prompt: string;
  response: OpenAiResponsesOutput;
  schema_name: string;
};

export type IncidentFromComplaintAiCache = {
  directory: string;
  taskRunId: string;
};

export type IncidentFromComplaintWorkflowInput = {
  analysisId: string;
  caseId: string;
  complaintText: string;
  complaintSource: {
    docketEntryId?: string;
    pdfPath: string;
    recordId: string;
    recordKind: string;
    workflowTextPath?: string;
  };
  sourceTaskRunIds: readonly string[];
  timestamp: string;
};

export type IncidentFromComplaintWorkflowOutput = {
  aiAudit?: IncidentFromComplaintAiAudit;
  changes: IncidentFromComplaintChange[];
  extraction: IncidentFromComplaintExtraction;
  report: string;
  workflowRun: IncidentFromComplaintWorkflowRun;
};

const WorkflowState = Annotation.Root({
  aiAudit: Annotation<IncidentFromComplaintAiAudit | undefined>,
  complaintText: Annotation<string>,
  extraction: Annotation<IncidentFromComplaintExtraction | undefined>,
});

function normalizeAiExtractorResult(output: unknown): {
  aiAudit?: IncidentFromComplaintAiAudit;
  extraction: unknown;
} {
  if (
    output &&
    typeof output === "object" &&
    "extraction" in output &&
    "aiAudit" in output
  ) {
    const result = output as {
      aiAudit?: IncidentFromComplaintAiAudit;
      extraction: unknown;
    };

    return {
      aiAudit: result.aiAudit,
      extraction: result.extraction,
    };
  }

  return { extraction: output };
}

function isUnknownValue(value: string): boolean {
  return /^(unknown|not found|not found in complaint|not determined)$/i.test(
    value.trim(),
  );
}

function requireSourceLocations({
  sourceLocations,
  value,
  fieldName,
}: {
  sourceLocations: readonly string[];
  value: string;
  fieldName: string;
}): void {
  if (sourceLocations.length === 0 && !isUnknownValue(value)) {
    throw new Error(`No pinpoint, no support: ${fieldName}`);
  }
}

function validateSourceGrounding(
  extraction: IncidentFromComplaintExtraction,
): IncidentFromComplaintExtraction {
  requireSourceLocations({
    fieldName: "incident.date",
    sourceLocations: extraction.incident.date.source_locations,
    value: extraction.incident.date.value,
  });
  requireSourceLocations({
    fieldName: "incident.time",
    sourceLocations: extraction.incident.time.source_locations,
    value: extraction.incident.time.value,
  });
  requireSourceLocations({
    fieldName: "incident.location",
    sourceLocations: extraction.incident.location.source_locations,
    value: extraction.incident.location.primary,
  });

  for (const actor of extraction.actors) {
    requireSourceLocations({
      fieldName: `actor.${actor.name}`,
      sourceLocations: actor.source_locations,
      value: actor.name,
    });
  }

  for (const event of extraction.incident.events) {
    requireSourceLocations({
      fieldName: `incident_event.${event.type}`,
      sourceLocations: event.source_locations,
      value: event.description,
    });
  }

  for (const material of extraction.source_materials) {
    requireSourceLocations({
      fieldName: `source_material.${material.name}`,
      sourceLocations: material.source_locations,
      value: material.name,
    });
  }

  return extraction;
}

function sourceReference(
  input: IncidentFromComplaintWorkflowInput,
  complaintLocator: string,
  supportKind:
    | "direct-quote"
    | "paraphrase"
    | "summary"
    | "inference"
    | "missing-source-observation",
): IncidentFromComplaintChange["source_references"][number] {
  return {
    source_record_id: input.complaintSource.recordId,
    source_record_kind: input.complaintSource.recordKind,
    complaint_locator: complaintLocator,
    support_kind: supportKind,
  };
}

function firstLocator(
  input: IncidentFromComplaintWorkflowInput,
  sourceLocations: readonly string[],
): string {
  return (
    sourceLocations[0] ??
    (input.complaintSource.docketEntryId === undefined
      ? "complaint"
      : `docket entry ${input.complaintSource.docketEntryId}`)
  );
}

function changesFromExtraction(
  input: IncidentFromComplaintWorkflowInput,
  extraction: IncidentFromComplaintExtraction,
): IncidentFromComplaintChange[] {
  const incidentLocator = firstLocator(
    input,
    extraction.incident.date.source_locations,
  );
  const changes: IncidentFromComplaintChange[] = [
    {
      id: "change-add-incident",
      type: "add-incident",
      review_state: "proposed",
      summary: `Add incident: ${extraction.incident.label}`,
      proposed_record: {
        kind: "incident",
        label: extraction.incident.label,
        summary: extraction.incident.summary,
        date: extraction.incident.date.value,
        time: extraction.incident.time.value,
        location: extraction.incident.location.primary,
        actors: extraction.incident.primary_actors,
        events: extraction.incident.events,
        sources: [sourceReference(input, incidentLocator, "summary")],
        review_note: extraction.incident.confidence_review_note,
      },
      source_references: [sourceReference(input, incidentLocator, "summary")],
      source_task_run_ids: [...input.sourceTaskRunIds],
    },
  ];

  function nextId(prefix: string): string {
    return `${prefix}-${String(changes.length)}`;
  }

  for (const actor of extraction.actors) {
    const locator = firstLocator(input, actor.source_locations);
    changes.push({
      id: nextId("change-add-actor"),
      type: "add-actor",
      review_state: "proposed",
      summary: `Add actor: ${actor.name}`,
      proposed_record: {
        kind: "actor",
        id: actor.id,
        name: actor.name,
        role: actor.role,
        identity_status: actor.identity_status,
        category: actor.category,
      },
      source_references: [sourceReference(input, locator, "summary")],
      source_task_run_ids: [...input.sourceTaskRunIds],
    });
  }

  if (extraction.incident.location.primary !== "unknown") {
    const locator = firstLocator(
      input,
      extraction.incident.location.source_locations,
    );
    changes.push({
      id: "change-add-location",
      type: "add-location",
      review_state: "proposed",
      summary: `Add location: ${extraction.incident.location.primary}`,
      proposed_record: {
        kind: "location",
        label: extraction.incident.location.primary,
        specificity: extraction.incident.location.specificity,
      },
      source_references: [sourceReference(input, locator, "summary")],
      source_task_run_ids: [...input.sourceTaskRunIds],
    });
  }

  for (const material of extraction.source_materials) {
    const locator = firstLocator(input, material.source_locations);

    if (material.status === "available") {
      changes.push({
        id: nextId("change-add-source-reference"),
        type: "add-source-reference",
        review_state: "proposed",
        summary: `Add source reference: ${material.name}`,
        counts_as_proof: false,
        proposed_record: {
          kind: "source-reference",
          name: material.name,
          status: material.status,
          review_note: material.review_note,
        },
        source_references: [sourceReference(input, locator, "summary")],
        source_task_run_ids: [...input.sourceTaskRunIds],
      });
      continue;
    }

    changes.push({
      id: nextId("change-add-data-request"),
      type: "add-data-request",
      review_state: "proposed",
      summary: `Add data request: ${material.name}`,
      counts_as_proof: false,
      proposed_record: {
        kind: "data-request",
        source_material: material.name,
        status: material.status,
        target_agency: material.target_agency ?? "unknown",
        request_text:
          material.request_text ??
          `Request ${material.name} related to the incident described in the complaint.`,
        review_note: material.review_note,
      },
      source_references: [
        sourceReference(input, locator, "missing-source-observation"),
      ],
      source_task_run_ids: [...input.sourceTaskRunIds],
    });
  }

  return changes;
}

function stringValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function incompleteNotes(change: IncidentFromComplaintChange): string[] {
  const notes: string[] = [];
  const record = change.proposed_record;
  const reviewNote = stringValue(record, "review_note");

  if (reviewNote) {
    notes.push(reviewNote);
  }

  if (change.type === "add-data-request") {
    const status = stringValue(record, "status") ?? "unknown";
    notes.push(`source material is ${status}; data request needs review.`);
  }

  if (
    change.source_references.some(
      (reference) => reference.complaint_locator === "unknown",
    )
  ) {
    notes.push("source pinpoint is unknown.");
  }

  return notes.length === 0 ? ["none identified."] : notes;
}

function primitiveDisplay(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" ? entry : JSON.stringify(entry),
      )
      .join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return "unknown";
}

function selectedRecordProperties(record: Record<string, unknown>): string[] {
  return Object.entries(record)
    .filter(([key]) => !["kind", "id"].includes(key))
    .map(([key, value]) => `    - ${key}: ${primitiveDisplay(value)}`);
}

function newNodeTreeLines(change: IncidentFromComplaintChange): string[] {
  const record = change.proposed_record ?? {};
  const kind = stringValue(record, "kind") ?? change.type;

  return [
    "  - new-node",
    `    - kind: ${kind}`,
    ...selectedRecordProperties(record),
    `    - source: ${change.source_references.map((reference) => reference.complaint_locator).join(", ")}`,
    ...incompleteNotes(change).map((note) => `    - incomplete: ${note}`),
  ];
}

function updateNodeTreeLines(change: IncidentFromComplaintChange): string[] {
  const record = change.proposed_record ?? {};
  const documentId = stringValue(record, "document_id");
  const docketEntryId = stringValue(record, "docket_entry_id");
  const targetId = documentId ?? docketEntryId ?? "unknown";
  const propertyEntries = Object.entries(record).filter(
    ([key]) => !["document_id", "docket_entry_id"].includes(key),
  );

  return [
    `  - update-node: ${targetId}`,
    ...propertyEntries.flatMap(([property, value]) => [
      `    - property: ${property}`,
      `    - action: ${property === "alternate_representations" || property === "documents" ? "add-to-map" : Array.isArray(value) ? "add-to-list" : "set"}`,
      `    - value: ${primitiveDisplay(value)}`,
    ]),
    `    - source: ${change.source_references.map((reference) => reference.complaint_locator).join(", ")}`,
    ...incompleteNotes(change).map((note) => `    - incomplete: ${note}`),
  ];
}

function edgeTreeLines(change: IncidentFromComplaintChange): string[] {
  const record = change.proposed_record ?? {};

  return [
    "  - new-edge",
    `    - source-id: ${stringValue(record, "source_id") ?? "unknown"}`,
    `    - target-id: ${stringValue(record, "target_id") ?? "unknown"}`,
    `    - kind: ${stringValue(record, "kind") ?? change.type}`,
    `    - source: ${change.source_references.map((reference) => reference.complaint_locator).join(", ")}`,
    ...incompleteNotes(change).map((note) => `    - incomplete: ${note}`),
  ];
}

function changeTreeLines(change: IncidentFromComplaintChange): string[] {
  if (change.type === "update-document-sources") {
    return updateNodeTreeLines(change);
  }

  if (change.type === "update-document-file-path") {
    return updateNodeTreeLines(change);
  }

  if (change.type === "update-docket-entry-documents") {
    return updateNodeTreeLines(change);
  }

  if (change.type === "promote-artifact-to-case-files") {
    return [
      "  - artifact",
      `    - action: promote-to-case-files`,
      `    - value: ${primitiveDisplay(change.proposed_record)}`,
      `    - source: ${change.source_references.map((reference) => reference.complaint_locator).join(", ")}`,
      ...incompleteNotes(change).map((note) => `    - incomplete: ${note}`),
    ];
  }

  if (change.type === "add-source-reference") {
    return edgeTreeLines(change);
  }

  return newNodeTreeLines(change);
}

function changeReviewTree(
  changes: readonly IncidentFromComplaintChange[],
): string[] {
  return changes.flatMap(changeTreeLines);
}

function listOrUnknown(values: readonly string[]): string {
  return values.length === 0 ? "unknown" : values.join(", ");
}

function markdownTableCell(value: string): string {
  return value.replace(/\r?\n/gu, " ").replaceAll("|", "\\|");
}

function eventActorSummary(
  actors: readonly {
    id: string;
    role: string;
    target_id?: string;
  }[],
): string {
  return actors.length === 0
    ? "unknown"
    : actors
        .map(
          (actor) =>
            `${actor.id} as ${actor.role}${
              actor.target_id === undefined
                ? ""
                : ` targeting ${actor.target_id}`
            }`,
        )
        .join(", ");
}

function eventLocationSummary({
  complaintSource,
  event,
}: {
  complaintSource: IncidentFromComplaintWorkflowInput["complaintSource"];
  event: IncidentFromComplaintExtraction["incident"]["events"][number];
}): string {
  const sourceLocations =
    event.source_locations.length === 0
      ? ["unknown"]
      : event.source_locations.map(
          (sourceLocation) => `${complaintSource.recordId}: ${sourceLocation}`,
        );

  return [event.location.value, ...sourceLocations].join("; ");
}

function eventTableRows(
  input: IncidentFromComplaintWorkflowInput,
  events: readonly IncidentFromComplaintExtraction["incident"]["events"][number][],
): string[] {
  if (events.length === 0) {
    return [
      "| time | label | actors | description | locations |",
      "| --- | --- | --- | --- | --- |",
      "| unknown | unknown | unknown | unknown | unknown |",
    ];
  }

  return [
    "| time | label | actors | description | locations |",
    "| --- | --- | --- | --- | --- |",
    ...events
      .map((event) =>
        [
          event.time.value,
          event.type,
          eventActorSummary(event.actors),
          event.description,
          eventLocationSummary({
            complaintSource: input.complaintSource,
            event,
          }),
        ]
          .map(markdownTableCell)
          .join(" | "),
      )
      .map((row) => `| ${row} |`),
  ];
}

export function incidentFromComplaintReport(
  input: IncidentFromComplaintWorkflowInput,
  extraction: IncidentFromComplaintExtraction,
  changes: readonly IncidentFromComplaintChange[],
): string {
  const incident = extraction.incident;
  const statementEvents = extraction.incident.events.filter(
    (event) => event.statement !== undefined,
  );

  return [
    "# Incident From Complaint Report",
    "",
    "## Incident",
    "",
    `- label: ${incident.label}`,
    `- summary: ${incident.summary}`,
    `- count: ${incident.incident_count}`,
    `- support: ${listOrUnknown(incident.date.source_locations)}`,
    "",
    "## Date and Time",
    "",
    `- date: ${incident.date.value}`,
    `- time: ${incident.time.value}`,
    `- certainty: ${incident.time.certainty}`,
    `- support: ${listOrUnknown([...incident.date.source_locations, ...incident.time.source_locations])}`,
    "",
    "## Location",
    "",
    `- primary: ${incident.location.primary}`,
    `- specificity: ${incident.location.specificity}`,
    `- secondary: ${listOrUnknown(incident.location.secondary_locations)}`,
    `- movement: ${incident.location.movement_between_locations}`,
    `- missing: ${incident.location.unclear_or_missing}`,
    `- support: ${listOrUnknown(incident.location.source_locations)}`,
    "",
    "## Actors",
    "",
    ...(extraction.actors.length === 0
      ? ["- unknown"]
      : extraction.actors.map(
          (actor) =>
            `- ${actor.name}: ${actor.role}; ${actor.identity_status}; ${actor.category}; support: ${listOrUnknown(actor.source_locations)}`,
        )),
    "",
    "## Sequence of Events",
    "",
    ...eventTableRows(input, extraction.incident.events),
    "",
    "## Statements",
    "",
    ...(statementEvents.length === 0
      ? ["- unknown"]
      : statementEvents.map(
          (event) =>
            `- ${event.statement?.form ?? "unknown"}: ${event.statement?.text ?? "unknown"} | support: ${listOrUnknown(event.source_locations)}`,
        )),
    "",
    "## Source Materials",
    "",
    `- complaint: ${input.complaintSource.recordId}`,
    `- complaint-pdf: ${input.complaintSource.pdfPath}`,
    ...(extraction.source_materials.length === 0
      ? ["- other: unknown"]
      : extraction.source_materials.map(
          (material) =>
            `- ${material.name}: ${material.status}; agency: ${material.target_agency ?? "unknown"}; request: ${material.request_text ?? "none"}; support: ${listOrUnknown(material.source_locations)}`,
        )),
    "",
    "## Change Review Tree",
    "",
    ...changeReviewTree(changes),
    "",
    "## Proposed Changes",
    "",
    ...changes.map((change) => `- ${change.type}: ${change.summary}`),
    "- no source reference: no change",
    "- no pinpoint: no support",
    "",
    "## Uncertainties and Review Items",
    "",
    ...(extraction.uncertainties.length === 0
      ? ["- No uncertainties were identified by the extractor."]
      : extraction.uncertainties.map((uncertainty) => `- ${uncertainty}`)),
    "",
    "## Next Review Actions",
    "",
    "- review change-set.yaml",
    "- approve, edit, or discard changes",
    "",
  ].join("\n");
}

export async function runIncidentFromComplaintWorkflow({
  aiExtractor,
  input,
  progress,
}: {
  aiExtractor: IncidentFromComplaintAiExtractor;
  input: IncidentFromComplaintWorkflowInput;
  progress?: (message: string) => void;
}): Promise<IncidentFromComplaintWorkflowOutput> {
  progress?.("incident-from-complaint: compiling LangGraph workflow");
  const graph = new StateGraph(WorkflowState)
    .addNode("extract", async (state: typeof WorkflowState.State) => {
      const result = normalizeAiExtractorResult(
        await aiExtractor.extractIncidentFromComplaint({
          complaintText: state.complaintText,
          progress,
        }),
      );

      return {
        aiAudit: result.aiAudit,
        extraction: IncidentFromComplaintExtractionSchema.parse(
          result.extraction,
        ),
      };
    })
    .addEdge(START, "extract")
    .addEdge("extract", END)
    .compile();
  progress?.("incident-from-complaint: invoking LangGraph workflow");
  const state = await graph.invoke({
    aiAudit: undefined,
    complaintText: input.complaintText,
    extraction: undefined,
  });
  progress?.("incident-from-complaint: parsing workflow extraction");
  const extraction = IncidentFromComplaintExtractionSchema.parse(
    state.extraction,
  );
  progress?.("incident-from-complaint: validating source grounding");
  const sourceGroundedExtraction = validateSourceGrounding(extraction);
  progress?.("incident-from-complaint: generating proposed changes");
  const changes = changesFromExtraction(input, sourceGroundedExtraction);
  progress?.("incident-from-complaint: generating report");

  return {
    aiAudit: state.aiAudit,
    changes,
    extraction: sourceGroundedExtraction,
    report: incidentFromComplaintReport(
      input,
      sourceGroundedExtraction,
      changes,
    ),
    workflowRun: {
      analysis_id: input.analysisId,
      case_id: input.caseId,
      workflow: "incident-from-complaint",
      workflow_version: 1,
      executor: {
        engine: "langgraph",
        ai: "openai-responses",
      },
      status: "draft",
      started_at: input.timestamp,
      completed_at: input.timestamp,
      inputs: {
        complaint_text: input.complaintSource.workflowTextPath ?? "unknown",
      },
      outputs: {
        extraction: "artifacts/extraction.yaml",
        change_set: "change-set.yaml",
        report: "report.md",
      },
      history: [
        { event: "workflow_run_started", at: input.timestamp },
        { event: "ai_extraction_completed", at: input.timestamp },
        { event: "workflow_run_completed", at: input.timestamp },
      ],
    },
  };
}

export const IncidentExtractionJsonSchema: Record<string, unknown> = {
  additionalProperties: true,
  properties: {
    actors: {
      items: {
        additionalProperties: false,
        properties: {
          category: { type: "string" },
          id: { type: "string" },
          identity_status: {
            enum: ["named", "unnamed", "unknown", "inferred"],
            type: "string",
          },
          name: { type: "string" },
          role: { type: "string" },
          source_locations: {
            items: { type: "string" },
            type: "array",
          },
        },
        required: [
          "id",
          "name",
          "role",
          "identity_status",
          "category",
          "source_locations",
        ],
        type: "object",
      },
      type: "array",
    },
    incident: {
      additionalProperties: false,
      properties: {
        confidence_review_note: { type: "string" },
        date: {
          additionalProperties: false,
          properties: {
            certainty: {
              enum: [
                "exact",
                "approximate",
                "relative",
                "inferred",
                "unknown",
                "conflicting",
              ],
              type: "string",
            },
            source_locations: {
              items: { type: "string" },
              type: "array",
            },
            value: { type: "string" },
          },
          required: ["value", "certainty", "source_locations"],
          type: "object",
        },
        events: {
          items: {
            additionalProperties: false,
            properties: {
              actors: {
                items: {
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    role: { type: "string" },
                    target_id: { type: "string" },
                  },
                  required: ["id", "role"],
                  type: "object",
                },
                type: "array",
              },
              description: { type: "string" },
              location: {
                additionalProperties: false,
                properties: {
                  certainty: { type: "string" },
                  value: { type: "string" },
                },
                required: ["value", "certainty"],
                type: "object",
              },
              review_note: { type: "string" },
              source_locations: {
                items: { type: "string" },
                type: "array",
              },
              statement: {
                additionalProperties: false,
                properties: {
                  form: {
                    enum: ["direct-quote", "paraphrase", "summary"],
                    type: "string",
                  },
                  text: { type: "string" },
                },
                required: ["form", "text"],
                type: "object",
              },
              support: {
                enum: ["directly-alleged", "inferred", "uncertain"],
                type: "string",
              },
              time: {
                additionalProperties: false,
                properties: {
                  certainty: {
                    enum: [
                      "exact",
                      "approximate",
                      "relative",
                      "inferred",
                      "unknown",
                      "conflicting",
                    ],
                    type: "string",
                  },
                  value: { type: "string" },
                },
                required: ["value", "certainty"],
                type: "object",
              },
              type: { type: "string" },
            },
            required: [
              "type",
              "time",
              "location",
              "actors",
              "description",
              "support",
              "source_locations",
            ],
            type: "object",
          },
          type: "array",
        },
        incident_count: { type: "string" },
        label: { type: "string" },
        location: {
          additionalProperties: false,
          properties: {
            movement_between_locations: { type: "string" },
            primary: { type: "string" },
            secondary_locations: {
              items: { type: "string" },
              type: "array",
            },
            source_locations: {
              items: { type: "string" },
              type: "array",
            },
            specificity: { type: "string" },
            unclear_or_missing: { type: "string" },
          },
          required: [
            "primary",
            "specificity",
            "secondary_locations",
            "movement_between_locations",
            "unclear_or_missing",
            "source_locations",
          ],
          type: "object",
        },
        primary_actors: {
          items: { type: "string" },
          type: "array",
        },
        summary: { type: "string" },
        time: {
          additionalProperties: false,
          properties: {
            certainty: {
              enum: [
                "exact",
                "approximate",
                "relative",
                "inferred",
                "unknown",
                "conflicting",
              ],
              type: "string",
            },
            source_locations: {
              items: { type: "string" },
              type: "array",
            },
            value: { type: "string" },
          },
          required: ["value", "certainty", "source_locations"],
          type: "object",
        },
      },
      required: [
        "label",
        "summary",
        "incident_count",
        "date",
        "time",
        "location",
        "primary_actors",
        "events",
        "confidence_review_note",
      ],
      type: "object",
    },
    source_materials: {
      items: {
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          request_text: { type: "string" },
          review_note: { type: "string" },
          source_locations: {
            items: { type: "string" },
            type: "array",
          },
          status: {
            enum: [
              "available",
              "directly-referenced",
              "likely-exists",
              "unknown",
              "needed-to-verify",
            ],
            type: "string",
          },
          target_agency: { type: "string" },
        },
        required: ["name", "status", "review_note", "source_locations"],
        type: "object",
      },
      type: "array",
    },
    uncertainties: {
      items: { type: "string" },
      type: "array",
    },
  },
  required: ["incident", "actors", "source_materials", "uncertainties"],
  type: "object",
};

export function openAiIncidentFromComplaintExtractor(
  defaultProgress?: (message: string) => void,
  env?: NodeJS.ProcessEnv,
  cache?: IncidentFromComplaintAiCache,
): IncidentFromComplaintAiExtractor {
  return {
    async extractIncidentFromComplaint({ complaintText, progress }) {
      const emit = progress ?? defaultProgress;
      const promptTemplate = await readFile(
        new URL("./prompts/extraction.md", import.meta.url),
        "utf8",
      );
      const prompt = [
        promptTemplate.trim(),
        "Return only JSON matching this TypeScript shape:",
        "{ incident: { label, summary, incident_count, date: { value, certainty, source_locations }, time: { value, certainty, source_locations }, location: { primary, specificity, secondary_locations, movement_between_locations, unclear_or_missing, source_locations }, primary_actors, events, confidence_review_note }, actors, source_materials, uncertainties }.",
        "Use unknown when the complaint does not support an answer.",
        "Every factual item must include source_locations with complaint paragraph/page/section labels when available.",
        "Put the incident narrative in incident.events as an ordered array; do not include a sequence field on events because array order defines sequence.",
        "Each event must include type, time, location, actors, description, support, source_locations, and optional statement and review_note.",
        "Each event actor must include id and role, with optional target_id for directed action.",
        "Do not extract claims, defenses, legal standards, strategy, or motion arguments.",
        "Do not extract authorities for this workflow; authority extraction is a later workflow.",
        "For each source material, include target_agency and request_text when the source is not available.",
        "Use kebab-case enum values such as direct-quote, directly-referenced, likely-exists, and needed-to-verify.",
        "Every source material must be either available with a pinpoint source location or unavailable with enough information to draft a data request.",
        "",
        "Complaint text:",
        complaintText,
      ].join("\n");
      const apiKey = openAiApiKey(env);
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }

      emit?.("incident-from-complaint: running OpenAI Responses extraction");
      emit?.(
        `incident-from-complaint: model ${env?.CASEGRAPH_OPENAI_MODEL ?? "gpt-5.2"}`,
      );
      emit?.("incident-from-complaint: prompt begin");
      emit?.(prompt);
      emit?.("incident-from-complaint: prompt end");

      const model = env?.CASEGRAPH_OPENAI_MODEL ?? "gpt-5.2";
      const schemaName = "incident_from_complaint_extraction";
      const output = await openAiResponsesJsonWithResponse({
        apiKey,
        cache: cache
          ? {
              directory: cache.directory,
              domain: ["case-analysis", "extract-incident"],
              progress: emit,
              taskId: cache.taskRunId,
            }
          : undefined,
        env,
        jsonSchema: IncidentExtractionJsonSchema,
        prompt,
        schemaName,
      });

      emit?.("incident-from-complaint: OpenAI output begin");
      emit?.(JSON.stringify(output.parsed, null, 2));
      emit?.("incident-from-complaint: OpenAI output end");

      return {
        aiAudit: {
          model,
          prompt,
          response: output.response,
          schema_name: schemaName,
        },
        extraction: output.parsed,
      };
    },
  };
}

export function openAiCommandAvailable({
  env,
}: {
  env?: NodeJS.ProcessEnv;
}): boolean {
  return openAiApiConfigured(env);
}

export async function writeExtractionArtifact({
  extraction,
  path: extractionPath,
}: {
  extraction: IncidentFromComplaintExtraction;
  path: string;
}): Promise<void> {
  // Artifact writes are reported by the command so this helper stays reusable.
  await writeFile(
    extractionPath,
    incidentFromComplaintExtractionYaml(
      IncidentFromComplaintExtractionSchema.parse(extraction),
    ),
    { flag: "wx" },
  );
}
