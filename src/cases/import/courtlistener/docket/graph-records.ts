import { writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CaseGraphRoot,
  CaseHomeSourceReference,
} from "../../../workspaces/case-home-document.js";
import { mappedProperties } from "./mapping.js";
import {
  localIdForSourceUrl,
  localIdsForSourceUrls,
  sourceIdValue,
} from "./source-values.js";
import type {
  CourtListenerResponses,
  DocketImportMappings,
  ImportedGraphRecordIds,
  SourceRequestRecord,
} from "./types.js";
import { graphRecordContent } from "./yaml.js";

function sourceReference(
  mutationId: string,
  requestId: string,
  sourceModel: string,
  sourceId: string | number,
  sourcePath: string,
): CaseHomeSourceReference {
  return {
    mutation: mutationId,
    request: requestId,
    path: sourcePath,
    source_system: "courtlistener",
    source_model: sourceModel,
    source_id: sourceId,
  };
}

function createImportedGraphRecordIds(
  responses: CourtListenerResponses,
  createGraphRecordId: () => string,
): ImportedGraphRecordIds {
  return {
    docket: createGraphRecordId(),
    docketEntries: responses.docketEntries.map(() => createGraphRecordId()),
    parties: responses.parties.map(() => createGraphRecordId()),
    attorneys: responses.attorneys.map(() => createGraphRecordId()),
    recapDocuments: responses.recapDocuments.map(() => createGraphRecordId()),
  };
}

function citationLookupByRecapDocumentId(
  requests: readonly SourceRequestRecord[],
): Map<string, SourceRequestRecord> {
  const lookupByDocumentId = new Map<string, SourceRequestRecord>();

  for (const request of requests) {
    const match = request.id.match(
      /^request-citation-lookup-recap-document-(.+)$/,
    );
    if (match?.[1]) {
      lookupByDocumentId.set(match[1], request);
    }
  }

  return lookupByDocumentId;
}

export async function writeImportedGraphRecords(
  homeDirectory: string,
  timestamp: string,
  mutationId: string,
  responses: CourtListenerResponses,
  createGraphRecordId: () => string,
  mappings: DocketImportMappings,
): Promise<CaseGraphRoot> {
  const recordIds = createImportedGraphRecordIds(
    responses,
    createGraphRecordId,
  );

  await writeFile(
    path.join(homeDirectory, `${recordIds.docket}.yaml`),
    graphRecordContent({
      type: "node",
      kind: mappings.docket.kind,
      id: recordIds.docket,
      ...mappedProperties(mappings.docket, responses.docket),
      docket_entries: recordIds.docketEntries,
      parties: recordIds.parties,
      attorneys: recordIds.attorneys,
      recap_documents: recordIds.recapDocuments,
      created_at: timestamp,
      updated_at: timestamp,
      sources: [
        sourceReference(
          mutationId,
          responses.docketRequest.id,
          "docket",
          sourceIdValue(responses.docket.id),
          "$.response.body",
        ),
      ],
    }),
    { flag: "wx" },
  );

  for (const [index, party] of responses.parties.entries()) {
    await writeFile(
      path.join(homeDirectory, `${recordIds.parties[index]}.yaml`),
      graphRecordContent({
        type: "node",
        kind: mappings.party.kind,
        id: recordIds.parties[index],
        ...mappedProperties(mappings.party, party),
        attorneys: localIdsForSourceUrls(
          party.attorneys,
          responses.attorneys,
          recordIds.attorneys,
        ),
        created_at: timestamp,
        updated_at: timestamp,
        sources: [
          sourceReference(
            mutationId,
            responses.partyRequests[0]?.id ?? "request-parties-page-1",
            "party",
            sourceIdValue(party.id),
            `$.response.body.results[${String(index)}]`,
          ),
        ],
      }),
      { flag: "wx" },
    );
  }

  for (const [index, attorney] of responses.attorneys.entries()) {
    await writeFile(
      path.join(homeDirectory, `${recordIds.attorneys[index]}.yaml`),
      graphRecordContent({
        type: "node",
        kind: mappings.attorney.kind,
        id: recordIds.attorneys[index],
        ...mappedProperties(mappings.attorney, attorney),
        parties_represented: localIdsForSourceUrls(
          attorney.parties_represented,
          responses.parties,
          recordIds.parties,
        ),
        created_at: timestamp,
        updated_at: timestamp,
        sources: [
          sourceReference(
            mutationId,
            responses.attorneyRequests[0]?.id ?? "request-attorneys-page-1",
            "attorney",
            sourceIdValue(attorney.id),
            `$.response.body.results[${String(index)}]`,
          ),
        ],
      }),
      { flag: "wx" },
    );
  }

  for (const [index, entry] of responses.docketEntries.entries()) {
    await writeFile(
      path.join(homeDirectory, `${recordIds.docketEntries[index]}.yaml`),
      graphRecordContent({
        type: "node",
        kind: mappings.docket_entry.kind,
        id: recordIds.docketEntries[index],
        ...mappedProperties(mappings.docket_entry, entry),
        recap_documents: localIdsForSourceUrls(
          entry.recap_documents,
          responses.recapDocuments,
          recordIds.recapDocuments,
        ),
        created_at: timestamp,
        updated_at: timestamp,
        sources: [
          sourceReference(
            mutationId,
            responses.docketEntryRequests[0]?.id ??
              "request-docket-entries-page-1",
            "docket_entry",
            sourceIdValue(entry.id),
            `$.response.body.results[${String(index)}]`,
          ),
        ],
      }),
      { flag: "wx" },
    );
  }

  const citationLookupRequests = citationLookupByRecapDocumentId(
    responses.citationLookupRequests,
  );

  for (const [index, document] of responses.recapDocuments.entries()) {
    const documentId = sourceIdValue(document.id);
    const citationLookupRequest = citationLookupRequests.get(documentId);
    const sources = [
      sourceReference(
        mutationId,
        responses.recapDocumentRequests[0]?.id ??
          "request-recap-documents-page-1",
        "recap_document",
        documentId,
        `$.response.body.results[${String(index)}]`,
      ),
    ];

    if (citationLookupRequest) {
      sources.push(
        sourceReference(
          mutationId,
          citationLookupRequest.id,
          "citation_lookup",
          documentId,
          "$.response.body",
        ),
      );
    }

    await writeFile(
      path.join(homeDirectory, `${recordIds.recapDocuments[index]}.yaml`),
      graphRecordContent({
        type: "node",
        kind: mappings.recap_document.kind,
        id: recordIds.recapDocuments[index],
        ...mappedProperties(mappings.recap_document, document),
        docket_entry: localIdForSourceUrl(
          document.docket_entry,
          responses.docketEntries,
          recordIds.docketEntries,
        ),
        citation_lookup_status: citationLookupRequest?.response.status,
        created_at: timestamp,
        updated_at: timestamp,
        sources,
      }),
      { flag: "wx" },
    );
  }

  return {
    type: "node",
    kind: "case",
    id: "root",
    sources: [
      sourceReference(
        mutationId,
        responses.docketRequest.id,
        "docket",
        sourceIdValue(responses.docket.id),
        "$.response.body",
      ),
    ],
  };
}
