import type { WorkspaceRuntime } from "../../../workspaces/create.js";

export type CommandResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

export type CourtListenerImportRuntime = WorkspaceRuntime & {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
  createMutationId?: () => string;
  createGraphRecordId?: () => string;
};

export type SourceRequestRecord = {
  type: "source_request";
  id: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body?: unknown;
    body_text?: string;
  };
};

export type CourtListenerResponses = {
  docket: Record<string, unknown>;
  docketRequest: SourceRequestRecord;
  docketEntries: Record<string, unknown>[];
  docketEntryRequests: SourceRequestRecord[];
  parties: Record<string, unknown>[];
  partyRequests: SourceRequestRecord[];
  attorneys: Record<string, unknown>[];
  attorneyRequests: SourceRequestRecord[];
  recapDocuments: Record<string, unknown>[];
  recapDocumentRequests: SourceRequestRecord[];
  citationLookupRequests: SourceRequestRecord[];
  citationLookupIncomplete: boolean;
};

export type ImportedGraphRecordIds = {
  docket: string;
  docketEntries: readonly string[];
  parties: readonly string[];
  attorneys: readonly string[];
  recapDocuments: readonly string[];
};

export type GraphRecordMapping = {
  kind: string;
  properties: Record<string, string>;
};

export type DocketImportMappings = {
  docket: GraphRecordMapping;
  party: GraphRecordMapping;
  attorney: GraphRecordMapping;
  docket_entry: GraphRecordMapping;
  recap_document: GraphRecordMapping;
};
