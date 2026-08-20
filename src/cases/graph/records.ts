import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const SourceSchema = z.looseObject({
  download_url: z.string().optional(),
  filepath_local: z.string().optional(),
  is_available: z.string().optional(),
  source_system: z.string().optional(),
  source_model: z.string().optional(),
  source_id: z.string().optional(),
  source_url: z.string().optional(),
});

const DocketEntryDocumentReferenceSchema = z.union([
  z.boolean(),
  z.object({
    role: z.string().optional(),
  }),
]);

const BaseNodeSchema = z.object({
  type: z.literal("node"),
  id: z.string(),
  sources: z.array(SourceSchema).optional(),
});

export const CaseNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("case"),
});

export const DocketNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("docket"),
  docket_entries: z.array(z.string()).optional(),
  parties: z.array(z.string()).optional(),
  attorneys: z.array(z.string()).optional(),
  recap_documents: z.array(z.string()).optional(),
});

export const PartyNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("party"),
  attorneys: z.array(z.string()).optional(),
});

export const AttorneyNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("attorney"),
});

export const DocketEntryNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("docket_entry"),
  date_filed: z.string().optional(),
  description: z.string().optional(),
  documents: z
    .record(z.string(), DocketEntryDocumentReferenceSchema)
    .optional(),
  entry_number: z.number().optional(),
  recap_documents: z.array(z.string()).optional(),
});

export const DocumentNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("document"),
  description: z.string().optional(),
  docket_entry: z.string().optional(),
  document_number: z.number().optional(),
  document_type: z.string().optional(),
  path: z.string().optional(),
  plain_text: z.string().optional(),
});

export const IncidentNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("incident"),
  label: z.string().optional(),
});

export const EvidenceNodeSchema = BaseNodeSchema.extend({
  kind: z.literal("evidence"),
  path: z.string(),
  hash: z
    .object({
      algorithm: z.literal("sha256"),
      value: z.string(),
    })
    .optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const GraphNodeSchema = z.discriminatedUnion("kind", [
  CaseNodeSchema,
  DocketNodeSchema,
  PartyNodeSchema,
  AttorneyNodeSchema,
  DocketEntryNodeSchema,
  DocumentNodeSchema,
  IncidentNodeSchema,
  EvidenceNodeSchema,
]);

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type CaseNode = z.infer<typeof CaseNodeSchema>;
export type DocketNode = z.infer<typeof DocketNodeSchema>;
export type PartyNode = z.infer<typeof PartyNodeSchema>;
export type AttorneyNode = z.infer<typeof AttorneyNodeSchema>;
export type DocketEntryNode = z.infer<typeof DocketEntryNodeSchema>;
export type DocumentNode = z.infer<typeof DocumentNodeSchema>;
export type IncidentNode = z.infer<typeof IncidentNodeSchema>;
export type EvidenceNode = z.infer<typeof EvidenceNodeSchema>;

export type ParsedGraphNode = {
  fileStem: string;
  node: GraphNode;
};

export type GraphTraversalSummary = {
  danglingReferenceCount: number;
  fileIdMismatchCount: number;
  invalidRecordCount: number;
  unlinkedRecordCount: number;
};

export type GraphNodeVisitor<T> = {
  attorney: (node: AttorneyNode) => T;
  case: (node: CaseNode) => T;
  docket: (node: DocketNode) => T;
  docket_entry: (node: DocketEntryNode) => T;
  document: (node: DocumentNode) => T;
  evidence: (node: EvidenceNode) => T;
  incident: (node: IncidentNode) => T;
  party: (node: PartyNode) => T;
};

export function visitGraphNode<T>(
  node: GraphNode,
  visitor: GraphNodeVisitor<T>,
): T {
  switch (node.kind) {
    case "attorney":
      return visitor.attorney(node);
    case "case":
      return visitor.case(node);
    case "docket":
      return visitor.docket(node);
    case "docket_entry":
      return visitor.docket_entry(node);
    case "document":
      return visitor.document(node);
    case "evidence":
      return visitor.evidence(node);
    case "incident":
      return visitor.incident(node);
    case "party":
      return visitor.party(node);
  }
}

function yamlScalarValue(content: string, key: string): string | undefined {
  return content.match(new RegExp(`^${key}: "?([^"\\n]+)"?$`, "m"))?.[1];
}

function yamlNumberValue(content: string, key: string): number | undefined {
  const value = yamlScalarValue(content, key);

  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  return Number(value);
}

function yamlStringList(content: string, key: string): string[] | undefined {
  const lines = content.split("\n");
  const keyIndex = lines.findIndex((line) => line === `${key}:`);

  if (keyIndex === -1) {
    return undefined;
  }

  const values: string[] = [];

  for (const line of lines.slice(keyIndex + 1)) {
    if (!line.startsWith("  - ")) {
      break;
    }

    const rawValue = line.slice(4).trim();
    values.push(rawValue.replace(/^"|"$/g, ""));
  }

  return values;
}

function yamlDocumentReferences(
  content: string,
):
  | Record<string, z.infer<typeof DocketEntryDocumentReferenceSchema>>
  | undefined {
  const lines = content.split("\n");
  const keyIndex = lines.findIndex((line) => line === "documents:");

  if (keyIndex === -1) {
    return undefined;
  }

  const references: Record<
    string,
    z.infer<typeof DocketEntryDocumentReferenceSchema>
  > = {};
  let currentDocumentId: string | undefined;

  for (const line of lines.slice(keyIndex + 1)) {
    if (!line.startsWith("  ")) {
      break;
    }

    const documentMatch = line.match(/^  ([A-Za-z0-9_-]+):(?: (.+))?$/);
    if (documentMatch) {
      currentDocumentId = documentMatch[1];
      const rawValue = documentMatch.at(2)?.trim();
      references[currentDocumentId] =
        rawValue === "true" ? true : rawValue === "false" ? false : {};
      continue;
    }

    const roleMatch = line.match(/^    role: (.+)$/);
    if (roleMatch && currentDocumentId) {
      references[currentDocumentId] = {
        role: parseYamlScalar(roleMatch[1]),
      };
    }
  }

  return references;
}

function parseYamlScalar(rawValue: string): string {
  return rawValue.trim().replace(/^"|"$/g, "");
}

function yamlSources(
  content: string,
): z.infer<typeof SourceSchema>[] | undefined {
  const lines = content.split("\n");
  const sourcesIndex = lines.findIndex((line) => line === "sources:");

  if (sourcesIndex === -1) {
    return undefined;
  }

  const sources: z.infer<typeof SourceSchema>[] = [];
  let currentSource: Record<string, string> | undefined;

  for (const line of lines.slice(sourcesIndex + 1)) {
    if (!line.startsWith("  ")) {
      break;
    }

    const itemMatch = line.match(/^  - ([A-Za-z0-9_]+): (.+)$/);
    if (itemMatch) {
      currentSource = {
        [itemMatch[1]]: parseYamlScalar(itemMatch[2]),
      };
      sources.push(currentSource);
      continue;
    }

    const propertyMatch = line.match(/^    ([A-Za-z0-9_]+): (.+)$/);
    if (propertyMatch && currentSource) {
      currentSource[propertyMatch[1]] = parseYamlScalar(propertyMatch[2]);
    }
  }

  return sources;
}

function parseGraphNodeYaml(content: string): unknown {
  const kind = yamlScalarValue(content, "kind");

  return {
    type: yamlScalarValue(content, "type"),
    kind,
    id: yamlScalarValue(content, "id"),
    sources: yamlSources(content),
    attorneys: yamlStringList(content, "attorneys"),
    date_filed: yamlScalarValue(content, "date_filed"),
    description: yamlScalarValue(content, "description"),
    documents: yamlDocumentReferences(content),
    docket_entries: yamlStringList(content, "docket_entries"),
    docket_entry: yamlScalarValue(content, "docket_entry"),
    document_number: yamlNumberValue(content, "document_number"),
    document_type: yamlScalarValue(content, "document_type"),
    entry_number: yamlNumberValue(content, "entry_number"),
    label: yamlScalarValue(content, "label"),
    parties: yamlStringList(content, "parties"),
    path: yamlScalarValue(content, "path"),
    plain_text: yamlScalarValue(content, "plain_text"),
    recap_documents: yamlStringList(content, "recap_documents"),
  };
}

export async function readGraphNodes(
  workspacePath: string,
): Promise<ParsedGraphNode[]> {
  const entries = await readdir(workspacePath, { withFileTypes: true });
  const parsedNodes: ParsedGraphNode[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
      continue;
    }

    const content = await readFile(
      path.join(workspacePath, entry.name),
      "utf8",
    );
    const parseResult = GraphNodeSchema.safeParse(parseGraphNodeYaml(content));

    if (parseResult.success) {
      parsedNodes.push({
        fileStem: path.basename(entry.name, ".yaml"),
        node: parseResult.data,
      });
    }
  }

  return parsedNodes;
}

function nodeReferences(node: GraphNode): string[] {
  return visitGraphNode(node, {
    attorney: () => [],
    case: () => [],
    docket: (docket) => [
      ...(docket.docket_entries ?? []),
      ...(docket.parties ?? []),
      ...(docket.attorneys ?? []),
      ...(docket.recap_documents ?? []),
    ],
    docket_entry: (entry) => [
      ...Object.keys(entry.documents ?? {}),
      ...(entry.recap_documents ?? []),
    ],
    document: (document) =>
      document.docket_entry === undefined ? [] : [document.docket_entry],
    evidence: () => [],
    incident: () => [],
    party: (party) => party.attorneys ?? [],
  });
}

function sharesCourtListenerDocketSource(
  left: GraphNode,
  right: GraphNode,
): boolean {
  const leftSources = left.sources ?? [];
  const rightSources = right.sources ?? [];

  return leftSources.some((leftSource) =>
    rightSources.some(
      (rightSource) =>
        leftSource.source_system === "courtlistener" &&
        rightSource.source_system === "courtlistener" &&
        leftSource.source_model === "docket" &&
        rightSource.source_model === "docket" &&
        leftSource.source_id !== undefined &&
        leftSource.source_id === rightSource.source_id,
    ),
  );
}

function traversalOriginIds(nodesById: Map<string, GraphNode>): Set<string> {
  const origins = new Set<string>(["root"]);
  const root = nodesById.get("root");

  if (!root) {
    return origins;
  }

  for (const node of nodesById.values()) {
    if (node.kind === "docket" && sharesCourtListenerDocketSource(root, node)) {
      origins.add(node.id);
    }
  }

  return origins;
}

export function graphTraversalSummary(
  parsedNodes: readonly ParsedGraphNode[],
): GraphTraversalSummary {
  const nodesById = new Map(parsedNodes.map(({ node }) => [node.id, node]));
  const fileIdMismatchCount = parsedNodes.filter(
    ({ fileStem, node }) => fileStem !== node.id,
  ).length;
  const referencedIds = new Set<string>();
  const reachableIds = traversalOriginIds(nodesById);
  const queue = [...reachableIds];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeId ? nodesById.get(nodeId) : undefined;

    if (!node) {
      continue;
    }

    for (const reference of nodeReferences(node)) {
      referencedIds.add(reference);

      if (!reachableIds.has(reference) && nodesById.has(reference)) {
        reachableIds.add(reference);
        queue.push(reference);
      }
    }
  }

  const declaredIds = new Set(nodesById.keys());
  const danglingReferenceCount = [...referencedIds].filter(
    (reference) => !declaredIds.has(reference),
  ).length;
  const unlinkedRecordCount = [...declaredIds].filter(
    (nodeId) => !reachableIds.has(nodeId),
  ).length;

  return {
    danglingReferenceCount,
    fileIdMismatchCount,
    invalidRecordCount: 0,
    unlinkedRecordCount,
  };
}
